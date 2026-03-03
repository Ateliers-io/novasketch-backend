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

<!-- TREE:START -->
```text
novasketch-backend/
├── .github/
│   └── workflows/
│       ├── backend-ci.yml
│       └── update-readme.yml
├── scripts/
│   ├── generate-readme.js
│   └── swagger-export.js
├── src/
│   ├── config/
│   │   ├── db.js
│   │   ├── redis.js
│   │   └── swagger.js
│   ├── controllers/
│   │   ├── authController.js
│   │   └── canvasController.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── checkSessionLock.js
│   ├── models/
│   │   ├── Canvas.js
│   │   ├── canvasMembership.js
│   │   ├── Room.js
│   │   └── User.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── canvasRoutes.js
│   │   ├── health.js
│   │   └── shapeRoutes.js
│   ├── services/
│   │   ├── redisCanvasService.js
│   │   └── redisPersistenceService.js
│   ├── utils/
│   │   └── validation.js
│   └── app.js
├── tests/
│   ├── integration/
│   │   ├── authRoutes.test.js
│   │   ├── sessionRoutes.test.js
│   │   └── shapeRoutes.test.js
│   ├── unit/
│   │   ├── .gitkeep
│   │   ├── authController.test.js
│   │   ├── authMiddleware.test.js
│   │   ├── authRouteGuard.test.js
│   │   ├── checkSessionLock.test.js
│   │   ├── concurrentEditing.test.js
│   │   ├── networkOptimization.test.js
│   │   ├── oauthIntegration.test.js
│   │   ├── presenceEvents.test.js
│   │   ├── redisCanvasService.test.js
│   │   ├── redisPersistenceService.test.js
│   │   ├── Room.test.js
│   │   └── User.test.js
│   ├── utils/
│   │   └── db_handler.js
│   └── setup.js
├── .env.example
├── .gitignore
├── eslint.config.js
├── index.html
├── instrument.mjs
├── jest.config.js
├── jsconfig.json
├── nodemon.json
├── package.json
├── README.md
├── reset_db.js
└── server.js
```
<!-- TREE:END -->

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

<!-- API:START -->
#### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new account |
| `POST` | `/api/auth/login` | Login with email and password |
| `POST` | `/api/auth/google` | Authenticate via Google OAuth |
| `GET` | `/api/auth/me` | Get current user profile |

#### Canvas

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/canvas` | Create a new canvas |
| `GET` | `/api/canvas/mine` | List all canvases for the authenticated user |
| `GET` | `/api/canvas/{id}` | Get canvas details by ID |
| `PATCH` | `/api/canvas/{id}/lock` | Lock or unlock a canvas |
| `POST` | `/api/canvas/{id}/participants` | Add a participant to a canvas |

#### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |

#### Shapes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/rooms/{roomId}/shapes` | List all shapes in a room |
| `GET` | `/api/rooms/{roomId}/shape/{shapeId}` | Get a specific shape by ID |

* **WebSocket Gateway**: `ws://<server>:<port>/<room-id>` — real-time drawing sync and awareness updates.

> 📖 **Interactive docs**: Start the server and visit [`/api-docs`](http://localhost:3000/api-docs) for the full Swagger UI.

<!-- API:END -->
