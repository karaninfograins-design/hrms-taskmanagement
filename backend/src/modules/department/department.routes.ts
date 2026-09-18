import { Router } from "express";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
} from "./department.controller.js";

const router = Router();

router.get("/", getDepartments);
router.post("/", createDepartment);
router.put("/:id", updateDepartment);

export default router;
