import { Router } from "express";
import {
  getCallHistory,
  initiateCall,
  updateCallStatus,
} from "./calls.controller.js";

const router = Router();

router.get("/", getCallHistory);
router.post("/", initiateCall);
router.put("/:id", updateCallStatus);

export default router;
