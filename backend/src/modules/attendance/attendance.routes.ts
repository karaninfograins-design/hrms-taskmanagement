import { Router } from "express";
import {
  getTodayAttendance,
  checkIn,
  checkOut,
  getAttendanceLogs,
} from "./attendance.controller.js";

const router = Router();

router.get("/today", getTodayAttendance);
router.post("/check-in", checkIn);
router.post("/check-out", checkOut);
router.get("/", getAttendanceLogs);

export default router;
