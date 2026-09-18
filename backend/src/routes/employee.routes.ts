import { Router } from "express";
import {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getRolesAndDesignations,
} from "../controllers/employee.controller";

const router = Router();

// GET /api/employees - Get all employees (with pagination)
router.get("/", getAllEmployees);

// GET /api/employees/filters - Get roles and designations for filters
// This must be registered before /:id so "filters" is not interpreted as an employee ID.
router.get("/filters", getRolesAndDesignations);

// GET /api/employees/:id - Get single employee
router.get("/:id", getEmployeeById);

// POST /api/employees - Create new employee
router.post("/", createEmployee);

// PUT /api/employees/:id - Update employee
router.put("/:id", updateEmployee);

// DELETE /api/employees/:id - Delete employee (soft delete)
router.delete("/:id", deleteEmployee);

export default router;
