// app.js: Express app instance
//
// This exists separately from server.js so tests can import the app
// without starting the HTTP server.

import express from "express";
import cors from "cors";
import * as Sentry from "@sentry/node";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger.js";
import authRoutes from "./routes/authRoutes.js";
import shapeRoutes from "./routes/shapeRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import healthRouter from "./routes/health.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "NovaSketch API Docs",
}));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/rooms", shapeRoutes);
app.use("/api/session", sessionRoutes);
app.use("/health", healthRouter);

app.get("/", (req, res) => res.send("Drawing Backend Running"));

// Sentry error handler — must be registered after all controllers/routes
// and before any other error-handling middleware.
Sentry.setupExpressErrorHandler(app);

// Fallthrough error handler: returns the Sentry event ID so clients/support
// can reference the specific error report.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(500).json({
    error: err.message || "Internal Server Error",
    sentryId: res.sentry,
  });
});

export default app;
