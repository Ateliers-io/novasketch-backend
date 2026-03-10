// shapeRoutes.js: Contains REST endpoints for reading shape data from persisted rooms.
//
// There are read-only endpoints that decode the Yjs binary snapshot stored in
// MongoDB and extract shape data from it.

import express from 'express';
import * as Y from 'yjs';
import Room from '../models/Room.js';

const router = express.Router();

/**
 * @swagger
 * /api/rooms/{roomId}/shapes:
 *   get:
 *     summary: List all shapes in a room
 *     description: Decodes the Yjs binary snapshot and returns all shapes from the room's document.
 *     tags: [Shapes]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: List of shapes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roomId:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 shapes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *       404:
 *         description: Room not found
 *       500:
 *         description: Failed to fetch shapes
 */
router.get('/:roomId/shapes', async (req, res) => {
    const { roomId } = req.params;

    try {
        const room = await Room.findById(roomId);

        if (!room?.data) {
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

/**
 * @swagger
 * /api/rooms/{roomId}/shape/{shapeId}:
 *   get:
 *     summary: Get a specific shape by ID
 *     tags: [Shapes]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: shapeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Shape data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *       404:
 *         description: Room or shape not found
 *       500:
 *         description: Failed to fetch shape
 */
router.get('/:roomId/shape/:shapeId', async (req, res) => {
    const { roomId, shapeId } = req.params;

    try {
        const room = await Room.findById(roomId);

        if (!room?.data) {
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
