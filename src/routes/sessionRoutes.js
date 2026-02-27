import express from 'express';
import { createSession, getSession, lockSession } from '../controllers/sessionController.js';

const router = express.Router();

/**
 * @swagger
 * /api/session:
 *   post:
 *     summary: Create a new whiteboard session
 *     tags: [Sessions]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: My Design Board
 *                 description: Session name (defaults to "Untitled Board")
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                   format: uuid
 *                 url:
 *                   type: string
 *                   example: /board/550e8400-e29b-41d4-a716-446655440000
 *       500:
 *         description: Server error
 */
router.post('/', createSession);

/**
 * @swagger
 * /api/session/{id}:
 *   get:
 *     summary: Get session details by ID
 *     tags: [Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session UUID
 *     responses:
 *       200:
 *         description: Session details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 createdBy:
 *                   type: string
 *                 is_locked:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Session not found
 */
router.get('/:id', getSession);

/**
 * @swagger
 * /api/session/{id}/lock:
 *   patch:
 *     summary: Lock or unlock a session
 *     description: When locked, all WebSocket write operations are rejected for this session.
 *     tags: [Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_locked]
 *             properties:
 *               is_locked:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Lock state updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 is_locked:
 *                   type: boolean
 *       400:
 *         description: is_locked must be a boolean
 *       404:
 *         description: Session not found
 */
router.patch('/:id/lock', lockSession);

export default router;
