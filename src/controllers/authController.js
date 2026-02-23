// authController.js: Handles Google OAuth code exchange and JWT issuance.
//
// Flow: Frontend (react-oauth/google) gives us an auth code via POST /api/auth/google.
// We exchange it with Google for an id_token, verify it. Then, find or create the user
// in Mongo. Finally, we issue our own JWT for subsequent API calls.

import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import User, { EMAIL_REGEX, DISPLAY_NAME_REGEX, PASSWORD_REGEX } from "../models/User.js";

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage' // Required for the popup-based flow used by the frontend
);

// ─── helpers ───

const signToken = (user) =>
    jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

const sanitizeUser = (user) => ({
    id: user._id,
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar,
    authProvider: user.authProvider,
});

// ─── register (email + password) ───

export const register = async (req, res) => {
    const { name, email, password } = req.body;

    // All fields required
    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required" });
    }

    // Validate display name
    if (!DISPLAY_NAME_REGEX.test(name)) {
        return res.status(400).json({
            error: "Name must be 2-30 characters, start with a letter, and only contain letters, numbers, spaces, hyphens, or underscores",
            field: "name",
        });
    }

    // Validate email
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: "Invalid email format", field: "email" });
    }

    // Validate password
    if (!PASSWORD_REGEX.test(password)) {
        return res.status(400).json({
            error: "Password must be 8-64 characters with at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character",
            field: "password",
        });
    }

    try {
        // Check for existing user (case-insensitive email match is handled by schema lowercase)
        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) {
            return res.status(409).json({ error: "An account with this email already exists", field: "email" });
        }

        const user = await User.create({
            email: email.toLowerCase(),
            displayName: name.trim(),
            password, // hashed by pre-save hook
            authProvider: "local",
        });

        const token = signToken(user);
        res.status(201).json({ token, user: sanitizeUser(user) });
    } catch (err) {
        console.error("Register Error:", err);

        // Mongoose validation errors
        if (err.name === "ValidationError") {
            const firstError = Object.values(err.errors)[0];
            return res.status(400).json({ error: firstError.message });
        }

        // Duplicate key (race condition edge case)
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] || "email";
            const messages = {
                email: "An account with this email already exists",
                googleId: "This Google account is already linked to another user",
            };
            return res.status(409).json({ error: messages[field] || "An account with these credentials already exists", field });
        }

        res.status(500).json({ error: "Registration failed. Please try again." });
    }
};

// ─── login (email + password) ───

export const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    // Basic format checks before hitting DB
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: "Invalid email format", field: "email" });
    }

    try {
        // Explicitly select password since it's excluded by default
        const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

        if (!user) {
            // Intentionally vague to avoid user enumeration
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // If user registered via Google, they can't log in with password
        if (user.authProvider === "google" && !user.password) {
            return res.status(401).json({
                error: "This account uses Google Sign-In. Please log in with Google.",
                field: "email",
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = signToken(user);
        res.json({ token, user: sanitizeUser(user) });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Login failed. Please try again." });
    }
};

// ─── google OAuth (existing) ───

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
            // Check if an email-registered user exists — link the Google account
            user = await User.findOne({ email: email.toLowerCase() });
            if (user) {
                user.googleId = googleId;
                user.avatar = picture || user.avatar;
                user.authProvider = "google";
                await user.save();
            } else {
                user = await User.create({
                    googleId,
                    email,
                    displayName: name,
                    avatar: picture || "",
                    authProvider: "google",
                });
            }
        }

        const token = signToken(user);
        res.json({ token, user: sanitizeUser(user) });
    } catch (err) {
        console.error("Google Auth Error:", err);
        res.status(401).json({ error: "Invalid token or code" });
    }
};

// ─── me (existing) ───

export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-__v");
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json(user);
    } catch {
        res.status(500).json({ error: "Server error" });
    }
};
