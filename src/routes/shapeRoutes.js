// shapeRoutes.js: Contains REST endpoints for reading shape data from persisted rooms.
//
// There are read-only endpoints that decode the Yjs binary snapshot stored in
// MongoDB and extract shape data from it.

import express from 'express';
import * as Y from 'yjs';

const router = express.Router();

// GET /api/rooms/:roomId/shapes - All shapes in a room
router.get('/:roomId/shapes', async (req, res) => {
    const { roomId } = req.params;

    try {
        const mongoose = await import('mongoose');
        const Room = mongoose.default.model('Room');

        const room = await Room.findById(roomId);

        if (!room || !room.data) {
            return res.status(404).json({
                error: 'Room not found',
                roomId
            });
        }

        // Hydrate a throwaway Yjs doc to read the shapes map.
        const doc = new Y.Doc();
        Y.applyUpdate(doc, new Uint8Array(room.data));

        // Extract shapes from Y.Map
        const shapesMap = doc.getMap('shapes');
        const shapes = [];

        shapesMap.forEach((value, key) => {
            shapes.push({
                id: key,
                ...value
            });
        });

        res.json({
            roomId,
            count: shapes.length,
            shapes
        });

    } catch (err) {
        console.error(`Error fetching shapes for room ${roomId}:`, err);
        res.status(500).json({
            error: 'Failed to fetch shapes',
            message: err.message
        });
    }
});

// GET /api/rooms/:roomId/shape/:shapeId - Single shape by ID
router.get('/:roomId/shape/:shapeId', async (req, res) => {
    const { roomId, shapeId } = req.params;

    try {
        const mongoose = await import('mongoose');
        const Room = mongoose.default.model('Room');

        const room = await Room.findById(roomId);

        if (!room || !room.data) {
            return res.status(404).json({ error: 'Room not found' });
        }

        const doc = new Y.Doc();
        Y.applyUpdate(doc, new Uint8Array(room.data));

        const shapesMap = doc.getMap('shapes');
        const shape = shapesMap.get(shapeId);

        if (!shape) {
            return res.status(404).json({
                error: 'Shape not found',
                shapeId
            });
        }

        res.json({
            id: shapeId,
            ...shape
        });

    } catch (err) {
        console.error(`Error fetching shape ${shapeId}:`, err);
        res.status(500).json({ error: 'Failed to fetch shape' });
    }
});

export default router;
