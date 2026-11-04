import { Router } from "express";
import {
  login,
  getMe,
  forgotPassword,
  verifyResetToken,
  resetPassword,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/login", login);
router.get("/me", getMe);
router.post("/forgot-password", forgotPassword);
router.get("/verify-reset-token", verifyResetToken);
router.post("/reset-password", resetPassword);

export default router;
