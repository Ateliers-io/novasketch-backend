// authController.js: Handles Google OAuth code exchange and JWT issuance.
//
// Flow: Frontend (react-oauth/google) gives us an auth code via POST /api/auth/google.
// We exchange it with Google for an id_token, verify it. Then, find or create the user
// in Mongo. Finally, we issue our own JWT for subsequent API calls.

import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage' // Required for the popup-based flow used by the frontend
);

// POST /api/auth/google — Exchange Google auth code for a NovaSketch JWT
export const googleAuth = async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Authorization code is required" });
    }

    try {
        // Step 1: Trade the one-time auth code for Google tokens
        const { tokens } = await client.getToken(code);
        const idToken = tokens.id_token;

        if (!idToken) {
            return res.status(400).json({ error: "No ID token found in response" });
        }

        // Step 2: Verify the id_token's signature and claim
        // Ensures the token was issued by Google for our specific client ID
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        // Step 3: Upsert user (first login creates a new record, subsequent logins just looked up)
        let user = await User.findOne({ googleId });

        if (!user) {
            user = await User.create({
                googleId,
                email,
                displayName: name,
                avatar: picture || "",
            });
        }

        // Step 4: Issue our own JWT so the frontend doesn't need to talk
        // to Google again until this expires
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            token,
            user: {
                id: user._id,
                email: user.email,
                displayName: user.displayName,
                avatar: user.avatar,
            },
        });
    } catch (err) {
        console.error("Google Auth Error:", err);
        res.status(401).json({ error: "Invalid token or code" });
    }
};

// GET /api/auth/me — Returns the currently authenticated user's profile.
// Requires the 'protect' middleware (authMiddleware.js) to have already
// verified the JWT and attached req.userId.
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-__v");
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
};
