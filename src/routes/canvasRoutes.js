// canvasRoutes.js — REST endpoints for canvas management.
//
// Replaces the old sessionRoutes.js. All mutating endpoints require
// authentication via the protect middleware.

import express from "express";
import {
    createCanvas,
    getCanvas,
    getUserCanvases,
    lockCanvas,
    addParticipant,
} from "../controllers/canvasController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/canvas:
 *   post:
 *     summary: Create a new canvas
 *     tags: [Canvas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: My Design Board
 *                 description: Canvas name (defaults to "Untitled Board")
 *     responses:
 *       201:
 *         description: Canvas created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 canvasId:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 url:
 *                   type: string
 *                   example: /board/550e8400-e29b-41d4-a716-446655440000
 *       500:
 *         description: Server error
 */
router.post("/", protect, createCanvas);

/**
 * @swagger
 * /api/canvas/mine:
 *   get:
 *     summary: List all canvases for the authenticated user
 *     tags: [Canvas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of user's canvases
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 canvases:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       canvasId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       owner:
 *                         type: object
 *                       role:
 *                         type: string
 *                       is_locked:
 *                         type: boolean
 *                       lastEditedAt:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: User not found
 */
router.get("/mine", protect, getUserCanvases);

/**
 * @swagger
 * /api/canvas/{id}:
 *   get:
 *     summary: Get canvas details by ID
 *     tags: [Canvas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Canvas UUID
 *     responses:
 *       200:
 *         description: Canvas details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 canvasId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 owner:
 *                   type: object
 *                 participants:
 *                   type: array
 *                 is_locked:
 *                   type: boolean
 *                 sync_status:
 *                   type: object
 *                 lastEditedAt:
 *                   type: string
 *                   format: date-time
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Canvas not found
 */
router.get("/:id", getCanvas);

/**
 * @swagger
 * /api/canvas/{id}/lock:
 *   patch:
 *     summary: Lock or unlock a canvas
 *     description: When locked, all WebSocket write operations are rejected for this canvas.
 *     tags: [Canvas]
 *     security:
 *       - bearerAuth: []
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
 *       400:
 *         description: is_locked must be a boolean
 *       404:
 *         description: Canvas not found
 */
router.patch("/:id/lock", protect, lockCanvas);

/**
 * @swagger
 * /api/canvas/{id}/participants:
 *   post:
 *     summary: Add a participant to a canvas
 *     tags: [Canvas]
 *     security:
 *       - bearerAuth: []
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
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The user's ObjectId
 *               role:
 *                 type: string
 *                 enum: [editor, viewer]
 *                 default: editor
 *     responses:
 *       200:
 *         description: Participant added
 *       400:
 *         description: userId is required
 *       404:
 *         description: Canvas or user not found
 *       409:
 *         description: User is already a participant
 */
router.post("/:id/participants", protect, addParticipant);

export default router;
