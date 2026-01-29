import app from "./app.js";

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const Y = require("yjs");


// 1. CONFIGURATION
const PORT = 3000;
const MONGO_URI = "mongodb+srv://kurapatikushalnarasimha95_db_user:yEm04oUnfCLuYD6E@cluster0.sqnkvlt.mongodb.net/?appName=Cluster0"

// db setup

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ DB Connection Error:", err));

// Schema: We store the room ID and the raw binary data of the drawing
const RoomSchema = new mongoose.Schema({
  _id: String,      // We use the Room Name as the ID
  data: Buffer      // The drawing is stored as a binary blob
});

const Room = mongoose.model("Room", RoomSchema);

// server setup with express
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Memory Store: Holds active drawings so we don't hit DB on every stroke
// Map<RoomID, Y.Doc>
const activeRooms = new Map();

app.get("/", (req, res) => {
  res.send("🎨 Drawing Backend is Running (JS Mode)");
});

//  WEBSOCKET LOGIC
wss.on("connection", async (ws, req) => {
  // 1. Get Room ID from URL (e.g., ws://localhost:3000/room-1)
  const roomId = req.url.slice(1) || "default-room";
  console.log(`🔌 New User connected to: ${roomId}`);

  // 2. Initialize Room if not in memory
  if (!activeRooms.has(roomId)) {
    console.log(`📂 Loading Room ${roomId} from Disk...`);
    const doc = new Y.Doc();
    
    // A. Load from MongoDB
    const existingRoom = await Room.findById(roomId);
    if (existingRoom && existingRoom.data) {
        // Apply binary data from DB to the in-memory Doc
        Y.applyUpdate(doc, new Uint8Array(existingRoom.data));
    }

    // B. Setup Auto-Save (Debounce)
    // Only save to DB if 2 seconds have passed since the last edit
    let saveTimer = null;
    const saveToDB = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            const binaryData = Y.encodeStateAsUpdate(doc);
            await Room.findByIdAndUpdate(
                roomId, 
                { data: Buffer.from(binaryData) }, 
                { upsert: true }
            );
            console.log(`💾 Saved ${roomId} to MongoDB`);
        }, 2000);
    };

    doc.on('update', saveToDB);
    activeRooms.set(roomId, doc);
  }

  const doc = activeRooms.get(roomId);

  // 3. Send Initial State to the new Client to ensure they see the current drawing immediately
  const initialState = Y.encodeStateAsUpdate(doc);
  ws.send(initialState);

  // 4. Handle Incoming Updates
  ws.on("message", (message) => {
    // message is a Buffer. Convert to Uint8Array for Y.js
    const update = new Uint8Array(message);
    
    // A. Update the Server's state
    Y.applyUpdate(doc, update);

    // B. Broadcast to everyone else in the room
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(update);
      }
    });
  });

  ws.on("close", () => {
    console.log(`❌ User disconnected from ${roomId}`);
  });
});

// 5. START SERVER
server.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});