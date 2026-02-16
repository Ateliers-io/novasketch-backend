import { Router } from "express";
import { googleAuth, getMe, register, login } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Email/password auth
router.post("/register", register);
router.post("/login", login);

// Google OAuth
router.post("/google", googleAuth);

// Protected
router.get("/me", protect, getMe);

export default router;
