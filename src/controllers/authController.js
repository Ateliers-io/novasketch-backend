import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage'
);

export const googleAuth = async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Authorization code is required" });
    }

    try {
        const { tokens } = await client.getToken(code);
        const idToken = tokens.id_token;

        if (!idToken) {
            return res.status(400).json({ error: "No ID token found in response" });
        }

        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        let user = await User.findOne({ googleId });

        if (!user) {
            user = await User.create({
                googleId,
                email,
                displayName: name,
                avatar: picture || "",
            });
        }

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
