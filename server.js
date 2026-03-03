// server.js - This is the main entry point. It connects Express, WebSockets,
// and Yjs CRDT sync.
// 
// Architecture: Has the HTTP server, WS logic, Yjs document lifecycle,
// and persistence.
//
// Data flow:
//   Client WebSocket <-> this server <-> MongoDB (Room state via Yjs binary snapshots)
//   REST routes (auth, shapes) are mounted here but defined in src/routes/.

// IMPORTANT: instrument.mjs must be the first import so Sentry is initialised
// before any other modules are loaded.
import "./instrument.mjs";

import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { encoding, decoding } from "lib0";
import "dotenv/config";
import connectDB from "./src/config/db.js";
import { validatePropertyUpdate } from "./src/utils/validation.js";
import { pubClient, subClient } from "./src/config/redis.js";
import { saveShape, getCanvasShapes } from "./src/services/redisCanvasService.js";
const PORT = process.env.PORT || 3000;

await connectDB();

// Room schema (defined here as it is tightly coupled to the Yjs binary format).
import Room from "./src/models/Room.js";
import Canvas from "./src/models/Canvas.js";
import app from "./src/app.js";

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Unique ID to tag Pub/Sub messages so the publishing node 
// doesn't echo them back to its own local clients.
const serverId = crypto.randomUUID();

// In-memory room registry. Keyed by room ID.
// Map<RoomID, { doc: Y.Doc, clients: Set<WebSocket> }>
// Each entry holds the Yjs doc and connected client set.
const rooms = new Map();

// Broadcasts a binary message to every LOCAL client in a room.
const broadcastLocal = (roomId, message, excludeClient = null) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.clients.forEach(client => {
    if (client !== excludeClient && client?.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Publishes a message to the Redis Pub/Sub channel
const publishToChannel = (roomId, message) => {
  try {
    const payload = JSON.stringify({
      serverId,
      roomId,
      // Convert binary message to base64 for safe JSON serialisation
      data: Buffer.from(message).toString('base64'),
    });
    pubClient.publish(`room:${roomId}`, payload);
  } catch (err) {
    console.error(`[Redis Pub] Failed to publish to room:${roomId}:`, err.message);
  }
};

// Broadcasts to local clients and publishes to Redis for other nodes.
// Set `crossNode` to false for messages that should stay local-only
// (e.g. initial sync to a single joining client).
const broadcastToRoom = (roomId, message, excludeClient = null, crossNode = true) => {
  broadcastLocal(roomId, message, excludeClient);
  if (crossNode) {
    publishToChannel(roomId, message);
  }
};

// ---- Redis Subscription Handler ----
// Listen for messages published by other server instances and relay
// them to local clients in the matching room.
subClient.on('message', (channel, raw) => {
  try {
    const { serverId: sourceId, roomId, data } = JSON.parse(raw);

    if (sourceId === serverId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const message = Buffer.from(data, 'base64');
    room.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } catch (err) {
    console.error('[Redis Sub] Error handling message:', err.message);
  }
});

subClient.on('error', (err) => {
  console.error('[Redis Sub] Subscription error:', err.message);
});

const buildPresenceMessage = (jsonStr) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 4); // type 4 = presence event
  encoding.writeVarString(encoder, jsonStr);
  return encoding.toUint8Array(encoder);
};

// Lazily initialises a room: loads Yjs state from Mongo, sets up
// update listener for persistence + broadcast.
// The debounced save avoids querying Mongo on every rapid drawing strokes.
const getOrCreateRoom = async (roomId) => {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }

  console.log(`Creating/Loading Room: ${roomId}`);
  const doc = new Y.Doc();

  // Awareness is initialized onto the doc rather than being built-in,
  // so cursor presence works from the first message.
  doc.awareness = new awarenessProtocol.Awareness(doc);

  const roomState = { doc, clients: new Set(), isLocked: false };
  rooms.set(roomId, roomState);

  // Subscribe to the Redis Pub/Sub channel for this room so messages
  // from other server instances are relayed to local clients.
  try {
    await subClient.subscribe(`room:${roomId}`);
    console.log(`[Redis Sub] Subscribed to room:${roomId}`);
  } catch (err) {
    console.error(`[Redis Sub] Failed to subscribe to room:${roomId}:`, err.message);
  }

  // Load lock state from Canvas doc (if one exists for this roomId)
  try {
    const canvas = await Canvas.findById(roomId);
    if (canvas) {
      roomState.isLocked = canvas.is_locked;
    }
  } catch (e) {
    console.error(`Canvas lock load error for ${roomId}:`, e);
  }

  // Restore previous state from Mongo (if any)
  try {
    const existingRoom = await Room.findById(roomId);
    if (existingRoom?.data?.length > 0) {
      Y.applyUpdate(doc, new Uint8Array(existingRoom.data));
      console.log(`Loaded ${existingRoom.data.length} bytes for ${roomId}`);
    }
  } catch (e) {
    console.error(`DB Load Error for ${roomId}:`, e);
  }

  // Debounced persistence — 2s window so rapid strokes batch into one write.
  let saveTimer = null;
  const saveToDB = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const binaryData = Y.encodeStateAsUpdate(doc);

      // Compute lightweight metadata without a full decode
      const dataSize = binaryData.byteLength;
      let shapeCount = 0;
      try {
        const shapesMap = doc.getMap('shapes');
        shapeCount = shapesMap.size;
      } catch { /* shapes map may not exist yet */ }

      try {
        await Room.findByIdAndUpdate(
          roomId,
          {
            data: Buffer.from(binaryData),
            dataSize,
            shapeCount,
          },
          { upsert: true }
        );

        // Bump lastEditedAt on the Canvas document
        await Canvas.findByIdAndUpdate(roomId, { lastEditedAt: new Date() });

        console.log(`Saved room ${roomId} (${dataSize} bytes, ${shapeCount} shapes)`);
      } catch (e) {
        console.error("Save Error:", e);
      }
    }, 2000);
  };

  // Triggered on every Yjs mutation (persists + broadcasts the change).
  // 'origin' is the WS that sent the update.
  doc.on('update', (update, origin) => {
    saveToDB();

    // Cache individual shapes to Redis for fast retrieval
    try {
      const shapesMap = doc.getMap('shapes');
      for (const [shapeId, shapeData] of shapesMap.entries()) {
        saveShape(roomId, shapeId, shapeData).catch(err =>
          console.error(`[Redis] Shape cache error for ${shapeId}:`, err.message)
        );
      }
    } catch { /* shapes map may not exist yet */ }

    // Broadcast to clients
    if (origin !== null) { // origin null means loaded from DB
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0); // MessageSync
      syncProtocol.writeUpdate(encoder, update);
      broadcastToRoom(roomId, encoding.toUint8Array(encoder), origin);
    }
  });

  // Awareness = cursor positions, user names, selection highlights.
  // Fires frequently but payloads are small, so no debounce needed here.
  doc.awareness.on('update', ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated).concat(removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1); // Message Awareness
    const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients);
    encoding.writeVarUint8Array(encoder, awarenessUpdate);
    broadcastToRoom(roomId, encoding.toUint8Array(encoder), origin);
  });

  return roomState;
};

// WEBSOCKET LOGIC
// Uses a simple type prefix byte:
//   0 = Yjs sync (binary CRDT frames)
//   1 = Awareness (cursor/presence)
//   2 = Ephemeral broadcast (drag positions - not persisted)
//   3 = Property updates (resize/rotate - validated then rebroadcast)
//   4 = presence event (user join/leave)
//   5 = Redis cached state (shape snapshot for fast initial load)
wss.on("connection", async (ws, req) => {
  const urlObj = new URL(req.url, "http://localhost");
  const roomId = urlObj.pathname.slice(1) || "default-room";
  const name = urlObj.searchParams.get("name") || "Anonymous";
  const clientId = urlObj.searchParams.get("clientId") || crypto.randomUUID();
  ws.meta = { name, clientId };

  console.log(`[${roomId}] ${name} (${clientId}) joined`);

  const room = await getOrCreateRoom(roomId);
  room.clients.add(ws);

  // Notify other participants that a new user has joined
  const joinPayload = JSON.stringify({
    event: "user_joined",
    name: ws.meta.name,
    clientId: ws.meta.clientId,
    count: room.clients.size,
  });
  broadcastToRoom(roomId, buildPresenceMessage(joinPayload), ws);

  // Send current room participants to the newly joining participant
  const members = Array.from(room.clients).map(c => ({
    name: c.meta.name,
    clientId: c.meta.clientId,
  }));
  ws.send(buildPresenceMessage(JSON.stringify({
    event: "room_state",
    members,
    count: members.length,
  })));

  // Send cached shapes from Redis for an immediate view before full Yjs sync.
  // This is a fast-path so joining clients see content instantly.
  try {
    const cachedShapes = await getCanvasShapes(roomId);
    if (Object.keys(cachedShapes).length > 0) {
      const cacheEncoder = encoding.createEncoder();
      encoding.writeVarUint(cacheEncoder, 5);
      encoding.writeVarString(cacheEncoder, JSON.stringify(cachedShapes));
      ws.send(encoding.toUint8Array(cacheEncoder));
    }
  } catch (err) {
    console.error(`[Redis] Failed to send cached shapes for ${roomId}:`, err.message);
  }

  // Send the full Yjs state so the new client can catch up
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0); // Message Sync
  syncProtocol.writeSyncStep1(encoder, room.doc);
  ws.send(encoding.toUint8Array(encoder));

  // Also send existing awareness so the newcomer sees other cursors
  if (room.doc.awareness.states.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, 1); // Message Awareness
    const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
      room.doc.awareness,
      Array.from(room.doc.awareness.getStates().keys())
    );
    encoding.writeVarUint8Array(awarenessEncoder, awarenessUpdate);
    ws.send(encoding.toUint8Array(awarenessEncoder));
  }

  // 4. Handle Messages
  ws.on("message", (message) => {
    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(new Uint8Array(message));
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case 0: // Yjs sync
          // Reject write (sync step 2 = update) if the session is locked
          if (room.isLocked) {
            ws.send(buildPresenceMessage(JSON.stringify({
              event: "session_locked",
              message: "This session is locked. Your changes were not saved."
            })));
            break;
          }
          encoding.writeVarUint(encoder, 0);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
          // Only reply if sync protocol produced a response
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
          break;

        case 1: // Awareness (cursor/presence updates)
          awarenessProtocol.applyAwarenessUpdate(room.doc.awareness, decoding.readVarUint8Array(decoder), ws);
          break;

        case 2: // Ephemeral/Broadcast (Position/Drag) - not persisted
          {
            const payload = decoding.readVarUint8Array(decoder);
            const forwardEncoder = encoding.createEncoder();
            encoding.writeVarUint(forwardEncoder, 2);
            encoding.writeVarUint8Array(forwardEncoder, payload);
            broadcastToRoom(roomId, encoding.toUint8Array(forwardEncoder), ws);
          }
          break;

        case 3: // Property updates (resize/rotate) - validated before relay
          {
            const payload = decoding.readVarUint8Array(decoder);
            const payloadStr = new TextDecoder().decode(payload);
            try {
              const data = JSON.parse(payloadStr);
              const validation = validatePropertyUpdate(data);
              if (!validation.valid) {
                console.error(`[${roomId}] Invalid property update: ${validation.error}`);
                break; // Drop malformed messages
              }

              // Structured logging for debugging collab issues
              const propSummary = Object.entries(data.properties)
                .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
                .join(', ');
              console.log(`[${roomId}] ${data.type?.toUpperCase() || 'UPDATE'}: ${data.objectId} → {${propSummary}}`);
              console.log(`   Clients in room: ${room.clients.size}`);

              const forwardEncoder = encoding.createEncoder();
              encoding.writeVarUint(forwardEncoder, 3);
              encoding.writeVarUint8Array(forwardEncoder, payload);
              broadcastToRoom(roomId, encoding.toUint8Array(forwardEncoder), ws);
            } catch (parseErr) {
              console.error("Invalid property update payload:", parseErr);
            }
          }
          break;
      }
    } catch (e) {
      console.error("Error handling WS message:", e);
    }
  });

  // Cleanup on Disconnect
  ws.on("close", () => {
    room.clients.delete(ws);

    const leavePayload = JSON.stringify({
      event: "user_left",
      name: ws.meta?.name,
      clientId: ws.meta?.clientId,
      count: room.clients.size,
    });
    broadcastToRoom(roomId, buildPresenceMessage(leavePayload));

    console.log(`[${roomId}] ${ws.meta?.name} left (${room.clients.size} remaining)`);

    // Clean up when last client leaves: unsubscribe from Redis, remove room
    if (room.clients.size === 0) {
      rooms.delete(roomId);
      try {
        subClient.unsubscribe(`room:${roomId}`);
        console.log(`[Redis Sub] Unsubscribed from room:${roomId}`);
      } catch (err) {
        console.error(`[Redis Sub] Failed to unsubscribe from room:${roomId}:`, err.message);
      }
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});