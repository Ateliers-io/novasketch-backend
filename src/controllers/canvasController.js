// canvasController.js — Handles CRUD for Canvas documents.
//
// Replaces the old sessionController.js. Manages canvas creation with owner
// tracking, participant management, lock/unlock, and user dashboard queries.
//
// All write endpoints require authentication (req.userId from authMiddleware).

import Canvas from "../models/Canvas.js";
import User from "../models/User.js";
import crypto from "crypto";

// ─── create canvas ───

export const createCanvas = async (req, res) => {
    try {
        const { name } = req.body;
        const canvasId = crypto.randomUUID();
        const ownerId = req.userId;

        // Create the canvas with the authenticated user as owner
        const canvas = await Canvas.create({
            _id: canvasId,
            name: name || "Untitled Board",
            owner: ownerId,
            participants: [
                {
                    userId: ownerId,
                    role: "owner",
                    joinedAt: new Date(),
                },
            ],
        });

        // Mirror the reference in the user's canvases array
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

// ─── get canvas by id ───

export const getCanvas = async (req, res) => {
    try {
        const { id } = req.params;
        const canvas = await Canvas.findById(id).populate(
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
        console.error("Error getting canvas:", error);
        res.status(500).json({ message: "Server error retrieving canvas" });
    }
};

// ─── list user's canvases (dashboard) ───

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

        if (typeof is_locked !== "boolean") {
            return res
                .status(400)
                .json({ message: "is_locked must be a boolean" });
        }

        const canvas = await Canvas.findByIdAndUpdate(
            id,
            { is_locked },
            { new: true }
        );

        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
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

        if (!userId) {
            return res.status(400).json({ message: "userId is required" });
        }

        const validRoles = ["editor", "viewer"];
        const assignedRole = validRoles.includes(role) ? role : "editor";

        // Check the canvas exists
        const canvas = await Canvas.findById(id);
        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
        }

        // Check if user is already a participant
        const existing = canvas.participants.find(
            (p) => p.userId.toString() === userId
        );
        if (existing) {
            return res.status(409).json({ message: "User is already a participant" });
        }

        // Check the target user exists
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Add to canvas participants
        canvas.participants.push({
            userId,
            role: assignedRole,
            joinedAt: new Date(),
        });
        await canvas.save();

        // Mirror in the user's canvases array
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
