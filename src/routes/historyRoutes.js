// historyRoutes.js — REST endpoints for timeline replay snapshots.
//
// GET  /api/history/:sessionId  → returns all snapshots (base64 encoded) sorted by time
// DELETE /api/history/:sessionId → clears all snapshots for a session

import { Router } from 'express';
import History from '../models/History.js';

const router = Router();

/**
 * @route   GET /api/history/:sessionId
 * @desc    Get all timeline snapshots for a session, sorted ascending by timestamp
 * @returns Array of { _id, update (base64 string), timestamp }
 */
router.get('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const snapshots = await History.find({ sessionId })
            .sort({ timestamp: 1 })
            .lean();

        // Convert Buffer to base64 for JSON transport
        const result = snapshots.map(s => ({
            _id: s._id,
            update: s.update.toString('base64'),
            timestamp: s.timestamp,
        }));

        res.json(result);
    } catch (err) {
        console.error('[History] GET error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve history' });
    }
});

/**
 * @route   DELETE /api/history/:sessionId
 * @desc    Clear all timeline snapshots for a session
 */
router.delete('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await History.deleteMany({ sessionId });
        res.json({ deleted: result.deletedCount });
    } catch (err) {
        console.error('[History] DELETE error:', err.message);
        res.status(500).json({ error: 'Failed to clear history' });
    }
});

export default router;
