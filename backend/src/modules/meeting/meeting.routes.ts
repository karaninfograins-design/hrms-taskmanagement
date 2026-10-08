import { Router } from "express";
import {
  getMeetings,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  getLiveKitToken,
} from "./meeting.controller.js";

const router = Router();

router.get("/", getMeetings);
router.post("/", createMeeting);
router.put("/:id", updateMeeting);
router.delete("/:id", deleteMeeting);
router.get("/:id/token", getLiveKitToken);

export default router;
