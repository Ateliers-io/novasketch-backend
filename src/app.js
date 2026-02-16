// app.js: Express app instance
//
// This exists separately from server.js so tests can import the app
// without starting the HTTP server.

import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import shapeRoutes from "./routes/shapeRoutes.js";
import healthRouter from "./routes/health.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/rooms", shapeRoutes);
app.use("/health", healthRouter);

app.get("/", (req, res) => res.send("Drawing Backend Running"));

export default app;
