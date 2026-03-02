import Canvas from "../models/Canvas.js";
import User from "../models/User.js";
import crypto from "node:crypto";

// ─── create canvas ───
export const createCanvas = async (req, res) => {
    try {
        // Fix 1: Destructure only what we need and sanitize
        const { name } = req.body;
        const cleanName = typeof name === 'string' ? name : "Untitled Board";

        const canvasId = crypto.randomUUID();
        const ownerId = req.userId;

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
            { _id: id, owner: req.userId }, 
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
        const { id } = req.params;
        const { userId, role } = req.body;

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ message: "Valid userId is required" });
        }

        const validRoles = ["editor", "viewer"];
        const assignedRole = validRoles.includes(role) ? role : "editor";

        // Fix 5: Ensure only owner can add participants
        const canvas = await Canvas.findOne({ _id: id, owner: req.userId });
        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found or unauthorized" });
        }

        const existing = canvas.participants.find(p => p.userId.toString() === userId);
        if (existing) {
            return res.status(409).json({ message: "User is already a participant" });
        }

        canvas.participants.push({
            userId,
            role: assignedRole,
            joinedAt: new Date(),
        });
        await canvas.save();

        await User.findByIdAndUpdate(userId, {
            $push: {
                canvases: {
                    canvasId: id,
                    role: assignedRole,
                    lastAccessedAt: new Date(),
                },
            },
        });

        res.status(200).json({
            canvasId: canvas._id,
            participants: canvas.participants,
        });
    } catch (error) {
        console.error("Error adding participant:", error);
        res.status(500).json({ message: "Server error adding participant" });
    }
};