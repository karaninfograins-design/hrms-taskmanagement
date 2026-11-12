import { Router } from "express";
import { getProfile, updateProfile, changePassword } from "../controllers/user.controller.js";

const router = Router();

// GET /api/users/:id - Get profile details
router.get("/:id", getProfile);

// PUT /api/users/:id - Update profile details
router.put("/:id", updateProfile);

// PUT /api/users/:id/password - Change password
router.put("/:id/password", changePassword);

export default router;
