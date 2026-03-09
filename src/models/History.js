// History.js — Stores Yjs state snapshots for timeline replay.
//
// Each document captures the full Yjs binary state at a point in time.
// sessionId matches the Canvas/Room _id (UUID string).
// The compound index on (sessionId, timestamp) enables efficient
// range queries for replay scrubbing.

import mongoose from 'mongoose';

const HistorySchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        index: true,
    },
    update: {
        type: Buffer,
        required: true,
    },
    awareness: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

// Compound index for fast "get all snapshots for session, sorted by time"
HistorySchema.index({ sessionId: 1, timestamp: 1 });

const History = mongoose.model('History', HistorySchema);

export default History;
