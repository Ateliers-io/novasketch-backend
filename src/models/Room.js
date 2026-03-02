// Room.js — Stores the Yjs binary snapshot for a canvas.
//
// The _id matches the Canvas _id (a UUID string). The `data` field holds the
// CRDT binary that Yjs encodes/decodes. `dataSize` and `shapeCount` are
// lightweight metadata updated on every debounced save in server.js so we can
// monitor usage without decoding the binary.

import mongoose from 'mongoose';

const RoomSchema = new mongoose.Schema({
    _id: String,
    data: Buffer,
    dataSize: {
        type: Number,
        default: 0,
    },
    shapeCount: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

const Room = mongoose.model('Room', RoomSchema);

export default Room;
