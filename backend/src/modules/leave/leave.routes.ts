import { Router } from "express";
import {
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  getLeaveBalances,
  getAllEmployeeBalances,
  updateEmployeeBalance,
  getLeaveRequests,
  applyLeave,
  updateLeaveStatus,
} from "./leave.controller.js";

const router = Router();

router.get("/types", getLeaveTypes);
router.post("/types", createLeaveType);
router.put("/types/:id", updateLeaveType);
router.delete("/types/:id", deleteLeaveType);

router.get("/balances", getLeaveBalances);
router.get("/admin/balances", getAllEmployeeBalances);
router.put("/admin/balances/:id", updateEmployeeBalance);

router.get("/requests", getLeaveRequests);
router.post("/requests", applyLeave);
router.put("/requests/:id/status", updateLeaveStatus);

export default router;
