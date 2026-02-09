# NovaSketch — Collaborative Backend Engine

The NovaSketch backend is a high-performance Node.js environment designed to handle real-time synchronization, persistent storage, and secure session management for a distributed digital canvas. It leverages **Yjs** CRDTs over **WebSockets** to ensure that multiple remote users can co-create with strong guarantees of consistency and low latency.

## 🛠️ Technical Core

### **Real-Time Synchronization (Yjs & WebSockets)**

* **Conflict-Free Replication**: Uses the Yjs library to manage document state, allowing concurrent edits (draw, erase, move) to resolve automatically without data loss.
* **Awareness & Presence**: Implements an awareness protocol to broadcast ephemeral state, such as cursor positions and active user presence, to all participants in a room.
* **Optimized Messaging**: Categorizes communication into specific message types (Sync, Awareness, Ephemeral, and Property Updates) to minimize bandwidth and processing overhead.

### **Data Persistence**

* **MongoDB Integration**: Persists the shared canvas state as binary updates, ensuring that the creative workspace can be reloaded exactly as it was left.
* **Debounced Auto-Save**: Implements a 2000ms debounced save mechanism to protect against data loss while preventing excessive database write operations during active drawing sessions.

### **Security & Validation**

* **Authentication**: Supports Google OAuth and JWT-based session management to protect private rooms and user data.
* **Server-Side Validation**: Sanitizes property updates (like resizing or rotating shapes) on the server before broadcasting to ensure state integrity and prevent malicious or malformed updates.

---

## 📂 Project Architecture

```text
novasketch-backend/
├── src/
│   ├── config/          # Database connection (Mongoose)
│   ├── controllers/     # Auth logic and session handling
│   ├── middleware/      # JWT and route protection
│   ├── models/          # User and persistence schemas
│   ├── routes/          # API endpoints for auth and shapes
│   └── utils/           # Transformation and property validation
├── server.js            # Main entry point; WebSocket & Yjs logic
└── package.json         # Dependency and script definitions

```

---

## ⚙️ Setup and Installation

### **Prerequisites**

* **Node.js**: Version 20 or higher.
* **Package Manager**: pnpm (recommended).
* **Database**: A running MongoDB instance.

### **Installation**

1. **Install Dependencies**:
```bash
pnpm install

```


2. **Environment Variables**: Create a `.env` file in the root with the following:
* `PORT`: Server port (default: 3000).
* `MONGODB_URI`: Your MongoDB connection string.
* `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: For OAuth integration.
* `JWT_SECRET`: For secure token generation.



### **Running the Server**

* **Development**:
```bash
pnpm dev

```


* **Production**:
```bash
pnpm start

```



## 🔌 API & Socket Endpoints

* **HTTP Health Check**: `GET /health`.
* **Authentication**: `POST /api/auth/*` for login and registration.
* **Canvas Persistence**: `GET /api/rooms/*` for retrieving stored states.
* **WebSocket Gateway**: `ws://<server>:<port>/<room-id>` handles all real-time drawing sync and awareness updates.
