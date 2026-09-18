import { Router } from "express";
import { updateProfile, changePassword } from "../controllers/user.controller";

const router = Router();

// PUT /api/users/:id - Update profile details
router.put("/:id", updateProfile);

// PUT /api/users/:id/password - Change password
router.put("/:id/password", changePassword);

export default router;
