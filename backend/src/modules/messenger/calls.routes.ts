import { Router } from "express";
import {
  getCallHistory,
  initiateCall,
  updateCallStatus,
  deleteCallLog,
  clearAllCallLogs,
  inviteParticipant,
} from "./calls.controller.js";

const router = Router();

router.get("/", getCallHistory);
router.post("/", initiateCall);
router.delete("/", clearAllCallLogs);
router.post("/:id/invite", inviteParticipant);
router.put("/:id", updateCallStatus);
router.delete("/:id", deleteCallLog);

export default router;

