// app.js: Express app instance
//
// This exists separately from server.js so tests can import the app
// without starting the HTTP server.

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger.js";
import authRoutes from "./routes/authRoutes.js";
import shapeRoutes from "./routes/shapeRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import healthRouter from "./routes/health.js";

const app = express();

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],  // Restricts <base> tag URLs
            objectSrc: ["'none'"],  // Disables plugins like Flash
            scriptSrc: ["'self'", "'unsafe-inline'"],  // unsafe-inline needed for Swagger UI
            styleSrc: ["'self'", "'unsafe-inline'"],  // Allow inline styles for Swagger UI
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            frameSrc: ["'none'"],
            frameAncestors: ["'none'"],  // Prevents clickjacking
            formAction: ["'self'"],  // Restricts form submission targets
            upgradeInsecureRequests: [],  // Upgrades HTTP to HTTPS
        },
    },
    hsts: {
        maxAge: 31536000,  // 1 year in seconds
        includeSubDomains: true,
        preload: true,
    },
}));

// CORS - strict configuration
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,  // Limit each IP to 10 requests per windowMs
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "NovaSketch API Docs",
}));

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/rooms", shapeRoutes);
app.use("/api/session", sessionRoutes);
app.use("/health", healthRouter);

app.get("/", (req, res) => res.send("Drawing Backend Running"));

// 404 handler - must be after all other routes
app.use((req, res) => {
    res.status(404)
       .type('application/json')
       .json({ error: 'Not Found', message: 'The requested resource was not found' });
});

// Global error handler - must be last
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal Server Error';
    
    res.status(statusCode)
       .type('application/json')
       .json({
           error: statusCode >= 500 ? 'Internal Server Error' : message,
           message: statusCode >= 500 ? 'An unexpected error occurred' : message,
       });
});

export default app;
