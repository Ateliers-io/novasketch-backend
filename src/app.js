import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import shapeRoutes from "./routes/shapeRoutes.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/rooms", shapeRoutes);

app.get("/", (req, res) => res.send("🎨 Drawing Backend Running"));
app.get("/health", (req, res) => res.json({ status: "OK" }));

export default app;
