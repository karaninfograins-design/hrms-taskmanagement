import { Router } from "express";
import {
  addWorkItemComment,
  createDesignation,
  createPermission,
  createProject,
  createSprint,
  createWorkItem,
  deleteDesignation,
  deleteProject,
  deleteRole,
  deleteSprint,
  deleteWorkItem,
  deleteWorkItemComment,
  getProject,
  getSprint,
  getWorkItem,
  getWorkspaceSettings,
  listBacklog,
  listDesignations,
  listEpics,
  listProjects,
  listRoles,
  listSprints,
  updateDesignation,
  updateProjectMembers,
  updateRolePermissions,
  updateSprintStatus,
  updateWorkItem,
  updateWorkItemSprint
} from "../controllers/workspace.controller.js";

const router = Router();

router.get("/projects", listProjects);
router.get("/projects/:id", getProject);
router.put("/projects/:id/members", updateProjectMembers);
router.post("/projects", createProject);
router.delete("/projects/:id", deleteProject);

router.get("/sprints", listSprints);
router.get("/sprints/:id", getSprint);
router.post("/sprints", createSprint);
router.patch("/sprints/:id/status", updateSprintStatus);
router.delete("/sprints/:id", deleteSprint);

router.post("/work-items", createWorkItem);
router.get("/work-items/:id", getWorkItem);
router.patch("/work-items/:id", updateWorkItem);
router.delete("/work-items/:id", deleteWorkItem);
router.patch("/work-items/:id/sprint", updateWorkItemSprint);
router.post("/work-items/:id/comments", addWorkItemComment);
router.delete("/comments/:id", deleteWorkItemComment);
router.get("/backlog", listBacklog);
router.get("/epics", listEpics);

router.get("/designations", listDesignations);
router.post("/designations", createDesignation);
router.put("/designations/:id", updateDesignation);
router.delete("/designations/:id", deleteDesignation);

router.get("/roles", listRoles);
router.delete("/roles/:id", deleteRole);
router.put("/roles/:id/permissions", updateRolePermissions);
router.post("/permissions", createPermission);
router.get("/settings", getWorkspaceSettings);

export default router;
