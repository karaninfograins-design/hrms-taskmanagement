import { Router } from "express";
import {
  getLeaveTypes,
  getLeaveBalances,
  getLeaveRequests,
  applyLeave,
  updateLeaveStatus,
} from "./leave.controller.js";

const router = Router();

router.get("/types", getLeaveTypes);
router.get("/balances", getLeaveBalances);
router.get("/requests", getLeaveRequests);
router.post("/requests", applyLeave);
router.put("/requests/:id/status", updateLeaveStatus);

export default router;
