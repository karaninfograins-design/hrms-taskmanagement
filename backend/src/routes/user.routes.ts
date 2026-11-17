import { Router } from "express";
import { getProfile, updateProfile, changePassword, uploadAvatar, deleteAvatar } from "../controllers/user.controller.js";

const router = Router();

// GET /api/users/:id - Get profile details
router.get("/:id", getProfile);

// PUT /api/users/:id - Update profile details
router.put("/:id", updateProfile);

// POST /api/users/:id/avatar - Upload profile picture
router.post("/:id/avatar", uploadAvatar);

// DELETE /api/users/:id/avatar - Remove profile picture
router.delete("/:id/avatar", deleteAvatar);

// PUT /api/users/:id/password - Change password
router.put("/:id/password", changePassword);

export default router;
