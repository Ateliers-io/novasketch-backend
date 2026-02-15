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

// 1. CONFIGURATION
const PORT = process.env.PORT || 3000;

// 2. DB SETUP
await connectDB();

import Room from "./src/models/Room.js";

// 3. SERVER SETUP
import app from "./src/app.js";

// 3. SERVER SETUP
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Map<RoomID, { doc: Y.Doc, clients: Set<WebSocket> }>
const rooms = new Map();

/**
 * Helper: Broadcast a message to all clients in a specific room
 */
const broadcastToRoom = (roomId, message, excludeClient = null) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.clients.forEach(client => {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

/**
 * Helper: Setup a new Room (One-time initialization)
 */
const getOrCreateRoom = async (roomId) => {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }

  console.log(`📂 Creating/Loading Room: ${roomId}`);
  const doc = new Y.Doc();

  // Important: Initialize Awareness correctly
  doc.awareness = new awarenessProtocol.Awareness(doc);

  const roomState = { doc, clients: new Set() };
  rooms.set(roomId, roomState);

  // A. Load Data from MongoDB
  try {
    const existingRoom = await Room.findById(roomId);
    if (existingRoom && existingRoom.data && existingRoom.data.length > 0) {
      Y.applyUpdate(doc, new Uint8Array(existingRoom.data));
      console.log(`✅ Loaded ${existingRoom.data.length} bytes for ${roomId}`);
    }
  } catch (e) {
    console.error(`⚠️ DB Load Error for ${roomId}:`, e);
  }

  // B. Setup Persistence (Debounced Save)
  let saveTimer = null;
  const saveToDB = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const binaryData = Y.encodeStateAsUpdate(doc);
      try {
        await Room.findByIdAndUpdate(roomId, { data: Buffer.from(binaryData) }, { upsert: true });
        console.log(`💾 Saved ${roomId}`);
      } catch (e) {
        console.error("❌ Save Error:", e);
      }
    }, 2000);
  };

  // C. Setup ONE Listener for Drawing Updates
  doc.on('update', (update, origin) => {
    // Save to DB
    saveToDB();

    // Broadcast to clients
    if (origin !== null) { // origin null means loaded from DB
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0); // MessageSync
      syncProtocol.writeUpdate(encoder, update);
      broadcastToRoom(roomId, encoding.toUint8Array(encoder), origin);
    }
  });

  // D. Setup ONE Listener for Awareness (Cursors)
  doc.awareness.on('update', ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated).concat(removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1); // MessageAwareness
    const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients);
    encoding.writeVarUint8Array(encoder, awarenessUpdate);
    broadcastToRoom(roomId, encoding.toUint8Array(encoder), origin);
  });

  return roomState;
};

// 4. WEBSOCKET LOGIC
wss.on("connection", async (ws, req) => {
  const roomId = req.url.slice(1) || "default-room";
  console.log(`🔌 User joining: ${roomId}`);

  // 1. Join Room
  const room = await getOrCreateRoom(roomId);
  room.clients.add(ws);

  // 2. Send Initial State
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0); // MessageSync
  syncProtocol.writeSyncStep1(encoder, room.doc);
  ws.send(encoding.toUint8Array(encoder));

  // 3. Send Awareness State
  if (room.doc.awareness.states.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, 1); // MessageAwareness
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
        case 0: // Sync
          encoding.writeVarUint(encoder, 0);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws); // Pass 'ws' as origin
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
          break;

        case 1: // Awareness
          awarenessProtocol.applyAwarenessUpdate(room.doc.awareness, decoding.readVarUint8Array(decoder), ws);
          break;

        case 2: // Ephemeral/Broadcast (Position/Drag)
          {
            const payload = decoding.readVarUint8Array(decoder);
            // Re-broadcast to others, excluding sender
            const forwardEncoder = encoding.createEncoder();
            encoding.writeVarUint(forwardEncoder, 2); // Message Type 2
            encoding.writeVarUint8Array(forwardEncoder, payload);
            broadcastToRoom(roomId, encoding.toUint8Array(forwardEncoder), ws);
          }
          break;

        case 3: // Property Updates (Resize/Rotate)
          {
            const payload = decoding.readVarUint8Array(decoder);
            // Decode payload as JSON
            const payloadStr = new TextDecoder().decode(payload);
            try {
              const data = JSON.parse(payloadStr);

              // Validate payload
              const validation = validatePropertyUpdate(data);
              if (!validation.valid) {
                console.error(`❌ [${roomId}] Invalid property update: ${validation.error}`);
                break;
              }

              // Expected: { objectId, type: 'resize'|'rotate', properties: { width?, height?, rotation? } }
              const emoji = data.type === 'rotate' ? '🔄' : data.type === 'resize' ? '📐' : '✏️';
              const propSummary = Object.entries(data.properties)
                .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
                .join(', ');
              console.log(`${emoji} [${roomId}] ${data.type?.toUpperCase() || 'UPDATE'}: ${data.objectId} → {${propSummary}}`);
              console.log(`   └─ Clients in room: ${room.clients.size}`);

              // Re-broadcast to others
              const forwardEncoder = encoding.createEncoder();
              encoding.writeVarUint(forwardEncoder, 3); // Message Type 3
              encoding.writeVarUint8Array(forwardEncoder, payload);
              broadcastToRoom(roomId, encoding.toUint8Array(forwardEncoder), ws);
            } catch (parseErr) {
              console.error("❌ Invalid property update payload:", parseErr);
            }
          }
          break;
      }
    } catch (e) {
      console.error("❌ Error handling message:", e);
    }
  });

  // 5. Cleanup on Disconnect
  ws.on("close", () => {
    room.clients.delete(ws);
    // Optional: If room empty, verify logic to remove from memory
    if (room.clients.size === 0) {
      // logic to clear memory if desired
    }
  });
});

// 5. START SERVER
server.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});