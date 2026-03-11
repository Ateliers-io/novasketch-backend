// authRoutes.js: Maps auth endpoints to controller functions.
//
// POST /api/auth/google - Public. Exchanges a Google auth code for a JWT.
// GET  /api/auth/me     - Protected. Returns the logged-in user's profile.

import { Router } from "express";
import { googleAuth, getMe, register, login, updateProfile, deleteAccount } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     UserProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         displayName:
 *           type: string
 *         avatar:
 *           type: string
 *         authProvider:
 *           type: string
 *           enum: [local, google]
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: MyP@ssw0rd!
 *     responses:
 *       201:
 *         description: Account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Validation error (missing fields, bad format)
 *       409:
 *         description: Email already exists
 */
router.post("/register", register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Missing or invalid fields
 *       401:
 *         description: Invalid credentials or Google-only account
 */
router.post("/login", login);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Authenticate via Google OAuth
 *     description: Exchanges a Google authorization code for a JWT. Creates or links the user account.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 description: Google authorization code from the frontend OAuth popup
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Missing code or invalid token
 *       401:
 *         description: Invalid authorization code
 */
router.post("/google", googleAuth);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Not authorized or token expired
 *       404:
 *         description: User not found
 */
router.get("/me", protect, getMe);

/**
 * @swagger
 * /api/auth/profile:
 *   patch:
 *     summary: Update current user's profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *               avatar:
 *                 type: string
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authorized
 */
router.patch("/profile", protect, updateProfile);

/**
 * @swagger
 * /api/auth/account:
 *   delete:
 *     summary: Delete current user's account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted
 *       401:
 *         description: Not authorized
 */
router.delete("/account", protect, deleteAccount);

export default router;
