import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import mongoose from "mongoose";
import * as Y from "yjs";

// 1. CONFIGURATION
const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://kurapatikushalnarasimha95_db_user:yEm04oUnfCLuYD6E@cluster0.sqnkvlt.mongodb.net/?appName=Cluster0";

// 2. DB SETUP
try {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");
} catch (err) {
  console.error("❌ DB Connection Error:", err);
}

// Schema
const RoomSchema = new mongoose.Schema({
  _id: String,
  data: Buffer
});

const Room = mongoose.model("Room", RoomSchema);

// 3. SERVER SETUP
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Memory Store
const activeRooms = new Map();

app.get("/", (req, res) => {
  res.send("🎨 Drawing Backend is Running (ESM Mode)");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", uptime: process.uptime() });
});

// 4. WEBSOCKET LOGIC
wss.on("connection", async (ws, req) => {
  // Get Room ID
  const roomId = req.url.slice(1) || "default-room";
  console.log(`🔌 New User connected to: ${roomId}`);

  // Initialize Room
  if (!activeRooms.has(roomId)) {
    console.log(`📂 Loading Room ${roomId}...`);
    const doc = new Y.Doc();
    
    // A. Load from MongoDB
    try {
      const existingRoom = await Room.findById(roomId);
      if (existingRoom && existingRoom.data) {
        Y.applyUpdate(doc, new Uint8Array(existingRoom.data));
      }
    } catch (e) {
      console.error("Error loading room:", e);
    }

    // B. Auto-Save Logic
    let saveTimer = null;
    const saveToDB = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const binaryData = Y.encodeStateAsUpdate(doc);
        try {
          await Room.findByIdAndUpdate(
            roomId, 
            { data: Buffer.from(binaryData) }, 
            { upsert: true }
          );
          console.log(`💾 Saved ${roomId} to MongoDB`);
        } catch (e) {
          console.error("Error saving room:", e);
        }
      }, 2000);
    };

    doc.on('update', saveToDB);
    activeRooms.set(roomId, doc);
  }

  const doc = activeRooms.get(roomId);

  // Send Initial State
  const initialState = Y.encodeStateAsUpdate(doc);
  ws.send(initialState);

  // Handle Updates
  ws.on("message", (message) => {
    const update = new Uint8Array(message);
    Y.applyUpdate(doc, update);

    // Broadcast
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(update);
      }
    });
  });

  ws.on("close", () => {
    // Optional cleanup
  });
});

// 5. START SERVER
server.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});