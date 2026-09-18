import { Router } from "express";
import { getAdmins, createAdmin } from "../controllers/admin.controller.js";

const router = Router();

router.get("/", getAdmins);
router.post("/", createAdmin);

export default router;
