// app.js: Express app instance
//
// This exists separately from server.js so tests can import the app
// without starting the HTTP server.

import express from "express";
import healthRoute from "./routes/health.js";

const app = express();
app.use(express.json());
app.use("/health", healthRoute);

export default app;
