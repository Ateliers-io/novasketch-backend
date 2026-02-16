// authRoutes.js: Maps auth endpoints to controller functions.
//
// POST /api/auth/google - Public. Exchanges a Google auth code for a JWT.
// GET  /api/auth/me     - Protected. Returns the logged-in user's profile.

import { Router } from "express";
import { googleAuth, getMe } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/google", googleAuth);
router.get("/me", protect, getMe);

export default router;
