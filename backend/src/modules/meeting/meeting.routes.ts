import { Router } from "express";
import {
  getMeetings,
  createMeeting,
  getLiveKitToken,
} from "./meeting.controller.js";

const router = Router();

router.get("/", getMeetings);
router.post("/", createMeeting);
router.get("/:id/token", getLiveKitToken);

export default router;
