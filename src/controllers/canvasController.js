import Canvas from "../models/Canvas.js";
import User from "../models/User.js";
import crypto from "node:crypto";
import CanvasMembership from "../models/canvasMembership.js";
// ─── create canvas ───
export const createCanvas = async (req, res) => {
    try {
        // Fix 1: Destructure only what we need and sanitize using explicit string casting
        const { name } = req.body;
        const cleanName = name ? name.toString() : "Untitled Board";

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
            .select("name owner is_locked lastEditedAt createdAt participants")
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
                isCollab: canvas.participants && canvas.participants.length > 1,
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
        console.error("Add participant error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
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

// ─── update canvas name ───
export const updateCanvasName = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "name is required" });
        }

        const canvas = await Canvas.findById(String(id));
        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
        }

        // Verify ownership or edit rights if you want to restrict rename
        if (canvas.owner.toString() !== String(req.userId)) {
            return res.status(403).json({ message: "Not authorized to rename this canvas" });
        }

        canvas.name = name;
        await canvas.save();

        res.status(200).json({ message: "Canvas renamed", name: canvas.name });
    } catch (error) {
        console.error("Update canvas name error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ─── delete canvas ───
export const deleteCanvas = async (req, res) => {
    try {
        const { id } = req.params;
        const canvas = await Canvas.findById(id);

        if (!canvas) {
            return res.status(404).json({ message: "Canvas not found" });
        }

        // Ensure only owner can delete
        if (canvas.owner.toString() !== String(req.userId)) {
            return res.status(403).json({ message: "Only the owner can delete a canvas" });
        }

        // Delete all memberships for this canvas
        await CanvasMembership.deleteMany({ canvasId: id });

        // Delete the canvas itself
        await canvas.deleteOne();

        res.status(200).json({ message: "Canvas deleted successfully" });
    } catch (error) {
        console.error("Delete canvas error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ─── auto-join canvas ───
export const joinCanvas = async (req, res) => {
    try {
        const { id } = req.params; // canvas ID
        const userId = req.userId; // from JWT middleware

        const canvas = await Canvas.findById(String(id));
        if (!canvas) return res.status(404).json({ message: "Canvas not found" });

        // If the owner is joining their own board, just return success
        if (canvas.owner.toString() === userId) {
            return res.status(200).json({ message: "Joined as owner" });
        }

        // Upsert CanvasMembership (viewer role by default for auto-joins)
        await CanvasMembership.findOneAndUpdate(
            { canvasId: String(id), userId: String(userId) },
            { $setOnInsert: { role: "editor" }, $set: { lastAccessedAt: new Date() } },
            { new: true, upsert: true }
        );

        // Add to Canvas participants array if not already present
        const isParticipant = canvas.participants.some(p => p.userId.toString() === userId);
        if (!isParticipant) {
            await Canvas.findByIdAndUpdate(String(id), {
                $push: { participants: { userId, role: "editor", joinedAt: new Date() } }
            });
        }

        // Add to User's canvases tracking array if not already present
        const user = await User.findById(userId);
        if (user) {
            const hasCanvas = user.canvases.some(c => c.canvasId === String(id));
            if (!hasCanvas) {
                user.canvases.push({ canvasId: String(id), role: "editor", lastAccessedAt: new Date() });
            } else {
                const canvasRef = user.canvases.find(c => c.canvasId === String(id));
                if (canvasRef) canvasRef.lastAccessedAt = new Date();
            }
            await user.save();
        }

        res.status(200).json({ message: "Joined canvas successfully" });
    } catch (error) {
        console.error("Error auto-joining canvas:", error);
        res.status(500).json({ message: "Server error joining canvas" });
    }
};