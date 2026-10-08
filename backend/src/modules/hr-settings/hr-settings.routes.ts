import { Router } from "express";
import {
  getHRSettings,
  createHRSetting,
  updateHRSetting,
  deleteHRSetting,
} from "./hr-settings.controller.js";

const router = Router();

router.get("/", getHRSettings);
router.post("/", createHRSetting);
router.put("/:id", updateHRSetting);
router.delete("/:id", deleteHRSetting);

export default router;
