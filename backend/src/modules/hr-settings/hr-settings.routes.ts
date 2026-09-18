import { Router } from "express";
import {
  getHRSettings,
  createHRSetting,
  updateHRSetting,
} from "./hr-settings.controller.js";

const router = Router();

router.get("/", getHRSettings);
router.post("/", createHRSetting);
router.put("/:id", updateHRSetting);

export default router;
