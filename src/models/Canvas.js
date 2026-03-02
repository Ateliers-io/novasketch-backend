// Canvas.js — Mongoose model for a collaborative canvas (replaces the old Session model).
//
// Each canvas has an owner, a list of participants with roles,
// lock state, and sync tracking for offline/IndexedDB support.
//
// The _id is a UUID string (not an ObjectId) because it doubles as the
// WebSocket room ID and the Room document's _id.
//
// Used by: canvasController.js, server.js (lock check), checkSessionLock.js

import mongoose from "mongoose";

const CanvasSchema = new mongoose.Schema(
    {
        _id: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            default: "Untitled Board",
            trim: true,
            maxlength: [100, "Canvas name cannot exceed 100 characters"],
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Canvas must have an owner"],
        },
        participants: [
            {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                    required: true,
                },
                role: {
                    type: String,
                    enum: ["owner", "editor", "viewer"],
                    default: "editor",
                },
                joinedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        is_locked: {
            type: Boolean,
            default: false,
        },
        sync_status: {
            isFullySynced: {
                type: Boolean,
                default: false,
            },
            lastSyncedAt: {
                type: Date,
            },
            syncedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        },
        lastEditedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

const Canvas = mongoose.model("Canvas", CanvasSchema);

export default Canvas;
