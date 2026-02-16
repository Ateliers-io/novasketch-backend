// authMiddleware.js: JWT guard for protected API routes.
//
// Extracts the Bearer token from the Authorization header, verifies it
// against JWT_SECRET, and attaches the userId to req for downstream handlers.
//
// Used by: authRoutes.js (GET /me), and any future routes that need auth.
//          authController.js which issues the tokens this middleware validates.

import jwt from "jsonwebtoken";

export const protect = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Not authorized" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        // Covers expired tokens, tampered tokens, wrong secret, etc.
        // The frontend's Axios interceptor (services/api.ts) catches 401s
        // and redirects to /auth.
        return res.status(401).json({ error: "Token invalid or expired" });
    }
};
