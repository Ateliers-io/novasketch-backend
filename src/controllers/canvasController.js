import Canvas from "../models/Canvas.js";
import User from "../models/User.js";
import crypto from "node:crypto";
import CanvasMembership from "../models/canvasMembership.js";
// ─── create canvas ───
export const createCanvas = async (req, res) => {
    try {
        // Fix 1: Destructure only what we need and sanitize
        const { name } = req.body;
        const cleanName = typeof name === 'string' ? name : "Untitled Board";

        const canvasId = crypto.randomUUID();
        const ownerId = String(req.userId);

        // Fix 2: Cleaned syntax and structured query
        const canvas = await Canvas.create({
            _id: canvasId,
            name: cleanName,
            owner: ownerId,
            participants: [
                {
                    userId: ownerId,
                    role: "owner",
                    joinedAt: new Date(),
                },
            ],
        });

        await User.findByIdAndUpdate(ownerId, {
            $push: {
                canvases: {
                    canvasId: canvasId,
                    role: "owner",
                    lastAccessedAt: new Date(),
                },
            },
        });

        res.status(201).json({
            canvasId: canvas._id,
            name: canvas.name,
            url: `/board/${canvasId}`,
        });
    } catch (error) {
        console.error("Error creating canvas:", error);
        res.status(500).json({ message: "Server error creating canvas" });
    }
};

// ─── get user's canvases ───
export const getUserCanvases = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("canvases");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Fetch full canvas details for each reference
        const canvasIds = user.canvases.map((c) => c.canvasId);
        const canvases = await Canvas.find({ _id: { $in: canvasIds } })
            .populate("owner", "displayName avatar")
            .select("name owner is_locked lastEditedAt createdAt")
            .sort({ lastEditedAt: -1 });

        // Merge role from user's canvases array
        const result = canvases.map((canvas) => {
            const userRef = user.canvases.find(
                (c) => c.canvasId === canvas._id
            );
            return {
                canvasId: canvas._id,
                name: canvas.name,
                owner: canvas.owner,
                role: userRef?.role || "editor",
                is_locked: canvas.is_locked,
                lastEditedAt: canvas.lastEditedAt,
                lastAccessedAt: userRef?.lastAccessedAt,
                createdAt: canvas.createdAt,
            };
        });

        res.status(200).json({ canvases: result });
    } catch (error) {
        console.error("Error fetching user canvases:", error);
        res.status(500).json({ message: "Server error fetching canvases" });
    }
};

// ─── lock / unlock canvas ───
export const lockCanvas = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_locked } = req.body;

        // Fix 3: Strict type checking to prevent NoSQL injection
        if (typeof is_locked !== "boolean") {
            return res.status(400).json({ message: "is_locked must be a boolean" });
        }

        // Fix 4: Ownership check - only the owner can lock/unlock
        const canvas = await Canvas.findOneAndUpdate(
            { _id: String(id), owner: String(req.userId) },
            { $set: { is_locked } },
            { new: true }
        );

        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found or unauthorized" });
        }

        res.status(200).json({
            canvasId: canvas._id,
            is_locked: canvas.is_locked,
        });
    } catch (error) {
        console.error("Error locking canvas:", error);
        res.status(500).json({ message: "Server error updating lock state" });
    }
};

// ─── add participant ───
export const addParticipant = async (req, res) => {
    try {
        const { id } = req.params; // canvas ID
        const { userId, role } = req.body;
        const validRoles = ["editor", "viewer"];
        const assignedRole = validRoles.includes(role) ? role : "editor";

        // 1. Verify caller owns the canvas
        const canvas = await Canvas.findOne({ _id: String(id), owner: String(req.userId) });
        if (!canvas) return res.status(403).json({ message: "Unauthorized" });

        // 2. Verify the user being added actually exists
        const userExists = await User.exists({ _id: String(userId) });
        if (!userExists) return res.status(404).json({ message: "Target user not found" });

        // 3. Upsert the membership (handles both creation and updates atomically)
        const membership = await CanvasMembership.findOneAndUpdate(
            { canvasId: String(id), userId: String(userId) },
            { $set: { role: assignedRole } },
            { new: true, upsert: true } // If it doesn't exist, create it. If it does, update role.
        );

        res.status(200).json({ message: "Participant added", membership });
    } catch (error) {
        console.error("Error adding participant:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// ─── get canvas ───
export const getCanvas = async (req, res) => {
    try {
        const { id } = req.params;
        const canvas = await Canvas.findById(String(id)).populate(
            "owner",
            "displayName email avatar"
        );

        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
        }

        res.status(200).json({
            canvasId: canvas._id,
            name: canvas.name,
            owner: canvas.owner,
            participants: canvas.participants,
            is_locked: canvas.is_locked,
            sync_status: canvas.sync_status,
            lastEditedAt: canvas.lastEditedAt,
            createdAt: canvas.createdAt,
        });
    } catch (error) {
        console.error("Error fetching canvas:", error);
        res.status(500).json({ message: "Server error fetching canvas" });
    }
};