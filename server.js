// server.js — This is the main entry point. It connects Express, WebSockets,
// and and Yjs CRDT sync.
//
// Architecture: Has the HTTP server, WS logic, Yjs document lifecycle,
// and persistence.
//
// Data flow:
//   Client WebSocket <-> this server <-> MongoDB (Room state via Yjs binary snapshots)
//   REST routes (auth, shapes) are mounted here but defined in src/routes/.

import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import mongoose from "mongoose";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { encoding, decoding } from "lib0";
import "dotenv/config";
import connectDB from "./src/config/db.js";
import { validatePropertyUpdate } from "./src/utils/validation.js";

const PORT = process.env.PORT || 3000;

await connectDB();

// Room schema (defined here as it is tightly coupled to the Yjs binary format).
import Room from "./src/models/Room.js";
import app from "./src/app.js";


const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
import cors from "cors";
app.use(cors());
app.use(express.json());

// Routes (auth handled via jwt)
import authRoutes from "./src/routes/authRoutes.js";
import shapeRoutes from "./src/routes/shapeRoutes.js";
app.use("/api/auth", authRoutes);
app.use("/api/rooms", shapeRoutes);

// In-memory room registry. Keyed by room ID.
// Map<RoomID, { doc: Y.Doc, clients: Set<WebSocket> }>
// Each entry holds the Yjs doc and connected client set.
const rooms = new Map();

app.get("/", (req, res) => res.send("Drawing Backend Running"));
app.get("/health", (req, res) => res.json({ status: "OK" }));

// Broadcasts a binary message to every client in a room.
// Used for both Yjs sync and our custom messages.
const broadcastToRoom = (roomId, message, excludeClient = null) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.clients.forEach(client => {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
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

  const roomState = { doc, clients: new Set() };
  rooms.set(roomId, roomState);

  // Restore previous state from Mongo (if any)
  try {
    const existingRoom = await Room.findById(roomId);
    if (existingRoom && existingRoom.data && existingRoom.data.length > 0) {
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
      try {
        await Room.findByIdAndUpdate(roomId, { data: Buffer.from(binaryData) }, { upsert: true });
        console.log(`Saved room ${roomId}`);
      } catch (e) {
        console.error("Save Error:", e);
      }
    }, 2000);
  };

  // Triggered on every Yjs mutation (persists + broadcasts the change).
  // 'origin' is the WS that sent the update.
  doc.on('update', (update, origin) => {
    saveToDB();

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
wss.on("connection", async (ws, req) => {
  // Room ID is just the URL path. "/my-room" -> "my-room".
  const roomId = req.url.slice(1) || "default-room";
  console.log(`User joining: ${roomId}`);

  const room = await getOrCreateRoom(roomId);
  room.clients.add(ws);

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
        case 0: // Yjs sync - the CRDT does the heavy lifting
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
    // Optional: If room empty, verify logic to remove from memory
    if (room.clients.size === 0) {
      // Intentionally left empty
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});