import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { verifyToken } from "../utils/jwt.js";

async function authenticate(req: Request, res: Response) {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ message: "Authentication is required" });
    return false;
  }

  try {
    const { userId } = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user || user.status !== "ACTIVE") {
      res.status(403).json({ message: "Your account is not allowed to access this workspace" });
      return false;
    }
    return user;
  } catch {
    res.status(401).json({ message: "Invalid or expired authentication token" });
    return false;
  }
}

function adminOnly(role: string, res: Response) {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  res.status(403).json({ message: "Administrator access is required" });
  return false;
}

function superAdminOnly(role: string, res: Response) {
  if (role === "SUPER_ADMIN") return true;
  res.status(403).json({ message: "Only a super admin can manage roles and permissions" });
  return false;
}

function generateProjectKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map(w => w[0]?.toUpperCase() || "").join("").slice(0, 5);
  }
  const clean = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return clean.slice(0, 4) || "PRJ";
}

export async function listProjects(req: Request, res: Response) {
  if (!(await authenticate(req, res))) return;
  const items = await prisma.project.findMany({
    where: { status: { not: "INACTIVE" } },
    select: { id: true, key: true, name: true, status: true, startDate: true, endDate: true, createdBy: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ items: items.map(({ createdBy, ...project }: { createdBy: { name: string }; [key: string]: unknown }) => ({ ...project, owner: createdBy.name })) });
}

export async function deleteProject(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;
  const projectId = Number(req.params.id);
  try {
    const project = await prisma.project.update({
      where: { id: projectId },
      data: { status: "INACTIVE" },
    });
    res.json({ message: "Project deleted successfully", project });
  } catch {
    res.status(404).json({ message: "Project not found" });
  }
}

export async function getSprint(req: Request, res: Response) {
  if (!(await authenticate(req, res))) return;

  const sprint = await prisma.sprint.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      project: { select: { id: true, key: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      workItems: {
        orderBy: { updatedAt: "desc" },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
          reporter: { select: { id: true, name: true, email: true } },
          parent: { select: { id: true, title: true, type: true } },
          comments: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              createdAt: true,
              user: { select: { id: true, name: true } },
            },
          },
          activities: {
            orderBy: { createdAt: "desc" },
            include: { user: { select: { id: true, name: true } } },
          },
          _count: { select: { children: true, comments: true } },
        },
      },
    },
  });

  if (!sprint || sprint.status === "CANCELLED") {
    res.status(404).json({ message: "Sprint not found" });
    return;
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId: sprint.projectId },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const availableUsers = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  res.json({ sprint: { ...sprint, members: members.map((member: { user: unknown }) => member.user), availableUsers } });
}

export async function getWorkItem(req: Request, res: Response) {
  if (!(await authenticate(req, res))) return;

  const item = await prisma.workItem.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      project: { select: { id: true, key: true, name: true } },
      sprint: { select: { id: true, name: true, status: true } },
      assignee: { select: { id: true, name: true, email: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      reporter: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      parent: { select: { id: true, title: true, type: true } },
      children: {
        orderBy: { updatedAt: "desc" },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
          sprint: { select: { id: true, name: true } },
        },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!item) {
    res.status(404).json({ message: "Work item / Epic not found" });
    return;
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId: item.projectId },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });

  res.json({ item, members: members.map((m: { user: unknown }) => m.user) });
}

const VALID_STORY_POINTS = ["4-5 hrs", "8-10 hrs", "12-15 hrs", "20-25 hrs", "32-40 hrs", "52-65 hrs"] as const;

export async function createWorkItem(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;

  const { projectId, sprintId, type, title, description, priority, assigneeId, reporterId, parentId, startDate, dueDate, storyPoints } = req.body as Record<string, unknown>;
  const validTypes = ["EPIC", "STORY", "TASK", "FEATURE", "BUG", "SUBTASK"] as const;
  const validPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
  if (typeof title !== "string" || !title.trim() || typeof projectId !== "number" || !validTypes.includes(type as typeof validTypes[number])) {
    res.status(400).json({ message: "Project, title, and a valid work item type are required" });
    return;
  }
  if (priority !== undefined && !validPriorities.includes(priority as typeof validPriorities[number])) {
    res.status(400).json({ message: "Invalid priority" });
    return;
  }
  if (storyPoints !== undefined && storyPoints !== null && !VALID_STORY_POINTS.includes(storyPoints as typeof VALID_STORY_POINTS[number])) {
    res.status(400).json({ message: "Story points must be one of the predefined options" });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) { res.status(404).json({ message: "Project not found" }); return; }

  // WorkItem Type Hierarchy Validation
  let finalSprintId: number | null = sprintId === undefined || sprintId === null ? null : Number(sprintId);
  let finalParentId: number | null = parentId === undefined || parentId === null ? null : Number(parentId);

  if (type === "EPIC") {
    // Epic defaults: sprintId = null, parentId = null
    finalSprintId = null;
    finalParentId = null;
  } else if (type === "SUBTASK") {
    if (!finalParentId) {
      res.status(400).json({ message: "Subtask creation requires a parent work item" });
      return;
    }
    const parent = await prisma.workItem.findFirst({ where: { id: finalParentId, projectId }, select: { id: true, type: true } });
    if (!parent) {
      res.status(400).json({ message: "Parent work item must belong to the same project" });
      return;
    }
    if (parent.type === "EPIC" || parent.type === "SUBTASK") {
      res.status(400).json({ message: "Subtask parent must be a Story, Task, Feature, or Bug" });
      return;
    }
  } else if (finalParentId) {
    const parent = await prisma.workItem.findFirst({ where: { id: finalParentId, projectId }, select: { id: true } });
    if (!parent) {
      res.status(400).json({ message: "Parent work item must belong to the same project" });
      return;
    }
  }

  if (finalSprintId) {
    const sprint = await prisma.sprint.findFirst({ where: { id: finalSprintId, projectId }, select: { id: true } });
    if (!sprint) { res.status(400).json({ message: "Sprint does not belong to this project" }); return; }
  }

  if (assigneeId !== undefined && assigneeId !== null) {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: Number(assigneeId) } } });
    if (!member) { res.status(400).json({ message: "Assignee must be a project member" }); return; }
  }

  const rawAssigneeIds: number[] = Array.isArray(req.body.assigneeIds)
    ? req.body.assigneeIds.map((id: unknown) => Number(id)).filter((id: number) => !Number.isNaN(id))
    : (assigneeId !== undefined && assigneeId !== null ? [Number(assigneeId)] : []);

  if (rawAssigneeIds.length > 0) {
    const members = await prisma.projectMember.findMany({
      where: { projectId, userId: { in: rawAssigneeIds } },
      select: { userId: true },
    });
    if (members.length !== rawAssigneeIds.length) {
      res.status(400).json({ message: "All assignees must be project members" });
      return;
    }
  }

  const workItemCount = await prisma.workItem.count({ where: { projectId } });
  const keyNumber = workItemCount + 1;
  const primaryAssigneeId = rawAssigneeIds.length > 0 ? rawAssigneeIds[0] : (assigneeId === undefined || assigneeId === null ? null : Number(assigneeId));

  const item = await prisma.workItem.create({
    data: {
      projectId,
      keyNumber,
      sprintId: finalSprintId,
      type: type as typeof validTypes[number],
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      priority: (priority as typeof validPriorities[number] | undefined) || "MEDIUM",
      status: "TODO",
      assigneeId: primaryAssigneeId,
      reporterId: reporterId === undefined || reporterId === null ? user.id : Number(reporterId),
      parentId: finalParentId,
      storyPoints: typeof storyPoints === "string" ? storyPoints : null,
      startDate: typeof startDate === "string" && startDate ? new Date(`${startDate}T00:00:00`) : null,
      dueDate: typeof dueDate === "string" && dueDate ? new Date(`${dueDate}T23:59:59`) : null,
      createdById: user.id,
    },
  });

  if (rawAssigneeIds.length > 0) {
    await prisma.workItemAssignee.createMany({
      data: rawAssigneeIds.map((userId) => ({ workItemId: item.id, userId })),
      skipDuplicates: true,
    });
  }

  await prisma.workItemActivity.create({
    data: {
      workItemId: item.id,
      userId: user.id,
      action: "CREATED",
      newValue: item.title,
    },
  });

  const fullItem = await prisma.workItem.findUnique({
    where: { id: item.id },
    include: {
      sprint: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  res.status(201).json({ item: fullItem || item });
}

export async function updateProjectMembers(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;
  const projectId = Number(req.params.id);
  const userIds = req.body?.userIds;
  if (!Array.isArray(userIds) || userIds.some((id) => typeof id !== "number")) {
    res.status(400).json({ message: "userIds must be an array of numbers" });
    return;
  }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) { res.status(404).json({ message: "Project not found" }); return; }
  const activeUsers = await prisma.user.findMany({ where: { id: { in: userIds }, status: "ACTIVE" }, select: { id: true } });
  if (activeUsers.length !== userIds.length) { res.status(400).json({ message: "Every selected user must be active" }); return; }
  await prisma.$transaction([
    prisma.projectMember.deleteMany({ where: { projectId } }),
    prisma.projectMember.createMany({ data: userIds.map((userId) => ({ projectId, userId })), skipDuplicates: true }),
  ]);
  res.json({ message: "Project members updated" });
}

export async function updateWorkItem(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user) return;
  const itemId = Number(req.params.id);
  const {
    title,
    description,
    type,
    status,
    priority,
    assigneeId,
    assigneeIds,
    sprintId,
    parentId,
    storyPoints,
    startDate,
    dueDate
  } = req.body as {
    title?: string;
    description?: string;
    type?: string;
    status?: string;
    priority?: string;
    assigneeId?: number | null;
    assigneeIds?: number[];
    sprintId?: number | null;
    parentId?: number | null;
    storyPoints?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
  };

  const validStatuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"] as const;
  const validPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
  const validTypes = ["EPIC", "STORY", "TASK", "FEATURE", "BUG", "SUBTASK"] as const;

  if (status !== undefined && !validStatuses.includes(status as typeof validStatuses[number])) {
    res.status(400).json({ message: "Invalid work item status" });
    return;
  }
  if (priority !== undefined && !validPriorities.includes(priority as typeof validPriorities[number])) {
    res.status(400).json({ message: "Invalid priority" });
    return;
  }
  if (type !== undefined && !validTypes.includes(type as typeof validTypes[number])) {
    res.status(400).json({ message: "Invalid work item type" });
    return;
  }

  const item = await prisma.workItem.findUnique({ where: { id: itemId } });
  if (!item) { res.status(404).json({ message: "Work item not found" }); return; }

  let primaryAssigneeId = assigneeId;
  if (Array.isArray(assigneeIds)) {
    primaryAssigneeId = assigneeIds.length > 0 ? assigneeIds[0] : null;
    await prisma.workItemAssignee.deleteMany({ where: { workItemId: itemId } });
    if (assigneeIds.length > 0) {
      await prisma.workItemAssignee.createMany({
        data: assigneeIds.map((userId) => ({ workItemId: itemId, userId: Number(userId) })),
        skipDuplicates: true,
      });
    }
  }

  const updated = await prisma.workItem.update({
    where: { id: itemId },
    data: {
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(description !== undefined ? { description: description ? description.trim() : null } : {}),
      ...(type ? { type: type as typeof validTypes[number] } : {}),
      ...(status ? { status: status as typeof validStatuses[number] } : {}),
      ...(priority ? { priority: priority as typeof validPriorities[number] } : {}),
      ...(primaryAssigneeId !== undefined ? { assigneeId: primaryAssigneeId === null ? null : Number(primaryAssigneeId) } : {}),
      ...(sprintId !== undefined ? { sprintId: sprintId === null ? null : Number(sprintId) } : {}),
      ...(parentId !== undefined ? { parentId: parentId === null ? null : Number(parentId) } : {}),
      ...(storyPoints !== undefined ? { storyPoints: storyPoints || null } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(`${startDate}T00:00:00`) : null } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(`${dueDate}T23:59:59`) : null } : {}),
    },
    include: {
      sprint: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
    }
  });

  res.json({ item: updated });
}

export async function deleteWorkItem(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user) return;
  const itemId = Number(req.params.id);
  const item = await prisma.workItem.findUnique({ where: { id: itemId } });
  if (!item) { res.status(404).json({ message: "Work item not found" }); return; }
  await prisma.workItem.delete({ where: { id: itemId } });
  res.json({ message: "Work item deleted successfully" });
}

export async function addWorkItemComment(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user) return;
  const workItemId = Number(req.params.id);
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) { res.status(400).json({ message: "Comment is required" }); return; }
  const item = await prisma.workItem.findUnique({ where: { id: workItemId }, select: { id: true, assigneeId: true, projectId: true } });
  if (!item) { res.status(404).json({ message: "Work item not found" }); return; }
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: item.projectId, userId: user.id } } });
  if (user.role.name === "EMPLOYEE" && !member && item.assigneeId !== user.id) { res.status(403).json({ message: "You do not have access to comment on this work item" }); return; }
  const comment = await prisma.comment.create({ data: { workItemId, userId: user.id, content }, include: { user: { select: { id: true, name: true } } } });

  await prisma.workItemActivity.create({
    data: {
      workItemId,
      userId: user.id,
      action: "COMMENT_ADDED",
      newValue: content.slice(0, 100),
    },
  });

  res.status(201).json({ comment });
}

export async function getProject(req: Request, res: Response) {
  if (!(await authenticate(req, res))) return;

  const project = await prisma.project.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      sprints: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { startDate: "desc" },
        include: { _count: { select: { workItems: true } } },
      },
      members: {
        orderBy: { joinedAt: "asc" },
        select: {
          joinedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              designation: { select: { name: true } },
            },
          },
        },
      },
      workItems: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          keyNumber: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          sprint: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, email: true } },
          assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      },
    },
  });

  if (!project || project.status === "INACTIVE") {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  const availableUsers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      projectMembers: { none: { projectId: project.id } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  res.json({ project: { ...project, availableUsers } });
}

export async function createProject(req: Request, res: Response) {
  const user = await authenticate(req, res); if (!user || !adminOnly(user.role.name, res)) return;
  const { name, key, description, startDate, endDate } = req.body as Record<string, string>;
  if (!name?.trim()) { res.status(400).json({ message: "Project name is required" }); return; }
  const projectKey = key?.trim().toUpperCase() || generateProjectKey(name);
  const item = await prisma.project.create({
    data: {
      name: name.trim(),
      key: projectKey,
      description: description?.trim() || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      createdById: user.id
    }
  });
  res.status(201).json({ item });
}

export async function listSprints(req: Request, res: Response) {
  if (!(await authenticate(req, res))) return;
  const items = await prisma.sprint.findMany({
    where: { status: { not: "CANCELLED" } },
    select: { id: true, name: true, type: true, status: true, startDate: true, endDate: true, project: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ items: items.map(({ project, ...sprint }: { project: { name: string }; [key: string]: unknown }) => ({ ...sprint, project: project.name })) });
}

export async function deleteSprint(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;
  const sprintId = Number(req.params.id);
  try {
    const sprint = await prisma.sprint.update({
      where: { id: sprintId },
      data: { status: "CANCELLED" },
    });
    res.json({ message: "Sprint deleted successfully", sprint });
  } catch {
    res.status(404).json({ message: "Sprint not found" });
  }
}

export async function createSprint(req: Request, res: Response) {
  const user = await authenticate(req, res); if (!user || !adminOnly(user.role.name, res)) return;
  const { name, projectId, type, startDate, endDate, description } = req.body as Record<string, string | undefined>;
  const rawType = (type || "WEEKLY").toUpperCase();
  const sprintType = rawType === "FORTNIGHTLY" || rawType === "MONTHLY" || rawType === "MANUAL" || rawType === "CUSTOM" ? rawType : "WEEKLY";

  if (!name?.trim() || !projectId) {
    res.status(400).json({ message: "Name and project are required" });
    return;
  }
  if (!startDate || !endDate) {
    res.status(400).json({ message: "Start date and end date are required for a sprint" });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: Number(projectId) }, select: { id: true } });
  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  const calculatedStart = new Date(`${startDate}T00:00:00`);
  const calculatedEnd = new Date(`${endDate}T23:59:59`);

  if (Number.isNaN(calculatedStart.getTime()) || Number.isNaN(calculatedEnd.getTime())) {
    res.status(400).json({ message: "Invalid sprint date range" });
    return;
  }
  if (calculatedStart >= calculatedEnd) {
    res.status(400).json({ message: "Sprint start date must be before end date" });
    return;
  }

  const item = await prisma.sprint.create({
    data: {
      name: name.trim(),
      projectId: project.id,
      type: sprintType,
      startDate: calculatedStart,
      endDate: calculatedEnd,
      description: description?.trim() || null,
      createdById: user.id,
    },
  });
  res.status(201).json({ item });
}

export async function updateSprintStatus(req: Request, res: Response) {
  const user = await authenticate(req, res); if (!user || !adminOnly(user.role.name, res)) return;
  const { status } = req.body as { status?: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED" }; const sprintId = Number(req.params.id);
  const validStatuses = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
  if (!status || !validStatuses.includes(status)) { res.status(400).json({ message: "Invalid sprint status" }); return; }
  try {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) { res.status(404).json({ message: "Sprint not found" }); return; }
    if (status === "ACTIVE") await prisma.sprint.updateMany({ where: { projectId: sprint.projectId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
    const item = await prisma.sprint.update({ where: { id: sprintId }, data: { status } });
    res.json({ item });
  } catch { res.status(400).json({ message: "Unable to update sprint" }); }
}

export async function updateWorkItemSprint(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;

  const itemId = Number(req.params.id);
  const { sprintId } = req.body as { sprintId: number | null };

  const item = await prisma.workItem.findUnique({ where: { id: itemId } });
  if (!item) {
    res.status(404).json({ message: "Work item not found" });
    return;
  }

  if (sprintId !== null && sprintId !== undefined) {
    const sprint = await prisma.sprint.findFirst({
      where: { id: Number(sprintId), projectId: item.projectId },
    });
    if (!sprint) {
      res.status(400).json({ message: "Sprint does not belong to this project" });
      return;
    }
  }

  const updated = await prisma.workItem.update({
    where: { id: itemId },
    data: { sprintId: sprintId ? Number(sprintId) : null },
  });

  await prisma.workItemActivity.create({
    data: {
      workItemId: itemId,
      userId: user.id,
      action: "SPRINT_CHANGED",
      newValue: sprintId ? `Assigned to sprint #${sprintId}` : "Moved to backlog",
    },
  });

  res.json({ item: updated });
}

export async function listBacklog(req: Request, res: Response) {
  if (!(await authenticate(req, res))) return;
  const projectIdParam = req.query.projectId ? Number(req.query.projectId) : undefined;

  const items = await prisma.workItem.findMany({
    where: {
      sprintId: null,
      type: { not: "EPIC" },
      ...(projectIdParam ? { projectId: projectIdParam } : {}),
      project: { status: { not: "INACTIVE" } },
    },
    select: {
      id: true,
      keyNumber: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      storyPoints: true,
      projectId: true,
      parent: { select: { id: true, title: true, type: true } },
      assignee: { select: { id: true, name: true, email: true } },
      project: { select: { key: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ items: items.map(({ project, ...item }: { project: { key: string | null; name: string }; [key: string]: unknown }) => ({ ...item, project: project.name, issueKey: `${project.key || "PRJ"}-${(item as { keyNumber?: number; id: number }).keyNumber || (item as { id: number }).id}` })) });
}

export async function listEpics(req: Request, res: Response) {
  if (!(await authenticate(req, res))) return;
  const projectIdParam = req.query.projectId ? Number(req.query.projectId) : undefined;

  const items = await prisma.workItem.findMany({
    where: {
      type: "EPIC",
      ...(projectIdParam ? { projectId: projectIdParam } : {}),
      project: { status: { not: "INACTIVE" } },
    },
    include: {
      assignee: { select: { id: true, name: true } },
      reporter: { select: { id: true, name: true } },
      children: {
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          storyPoints: true,
          assignee: { select: { id: true, name: true } },
        },
      },
      _count: { select: { children: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  res.json({ items });
}

export async function listAdmins(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;
  const items = await prisma.user.findMany({
    where: { role: { name: { in: ["SUPER_ADMIN", "ADMIN"] } }, status: "ACTIVE" },
    select: { id: true, name: true, email: true, status: true, role: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ items: items.map(({ role, ...admin }: { role: { name: string }; [key: string]: unknown }) => ({ ...admin, role: role.name })) });
}

export async function listDesignations(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;
  const items = await prisma.designation.findMany({ where: { status: true }, select: { id: true, name: true, description: true, status: true }, orderBy: { name: "asc" } });
  res.json({ items });
}

export async function createDesignation(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;
  const { name, description } = req.body as { name?: unknown; description?: unknown };
  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ message: "Designation name is required" }); return; }
  try {
    const item = await prisma.designation.create({ data: { name: name.trim(), description: typeof description === "string" ? description.trim() || null : null } });
    res.status(201).json({ item });
  } catch { res.status(409).json({ message: "A designation with this name already exists" }); }
}

export async function updateDesignation(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;
  const { name, description, status } = req.body as { name?: unknown; description?: unknown; status?: unknown };
  try {
    const item = await prisma.designation.update({ where: { id: Number(req.params.id) }, data: { ...(typeof name === "string" ? { name: name.trim() } : {}), ...(typeof description === "string" ? { description: description.trim() || null } : {}), ...(typeof status === "boolean" ? { status } : {}) } });
    res.json({ item });
  } catch { res.status(404).json({ message: "Designation not found" }); }
}

export async function deleteDesignation(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !adminOnly(user.role.name, res)) return;
  try {
    const item = await prisma.designation.update({ where: { id: Number(req.params.id) }, data: { status: false } });
    res.json({ item, message: "Designation soft deleted" });
  } catch { res.status(404).json({ message: "Designation not found" }); }
}

export async function listRoles(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !superAdminOnly(user.role.name, res)) return;
  const [roles, permissions] = await Promise.all([prisma.role.findMany({
    where: { status: true },
    select: { id: true, name: true, description: true, status: true, permissions: { select: { permission: { select: { name: true } } } } },
    orderBy: { name: "asc" },
  }), prisma.permission.findMany({ select: { id: true, name: true, description: true }, orderBy: { name: "asc" } })]);
  res.json({ roles: roles.map(({ permissions: assigned, ...role }: { permissions: Array<{ permission: { name: string } }>; [key: string]: unknown }) => ({ ...role, permissionIds: assigned.map(({ permission }: { permission: { name: string } }) => permission.name) })), permissions });
}

export async function deleteRole(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !superAdminOnly(user.role.name, res)) return;
  try {
    const item = await prisma.role.update({ where: { id: Number(req.params.id) }, data: { status: false } });
    res.json({ item, message: "Role soft deleted" });
  } catch { res.status(404).json({ message: "Role not found" }); }
}

export async function updateRolePermissions(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !superAdminOnly(user.role.name, res)) return;
  const permissionIds = req.body?.permissionIds;
  if (!Array.isArray(permissionIds) || permissionIds.some((id) => typeof id !== "number")) { res.status(400).json({ message: "permissionIds must be an array of permission IDs" }); return; }
  const roleId = Number(req.params.id);
  try {
    await prisma.$transaction([prisma.rolePermission.deleteMany({ where: { roleId } }), prisma.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId, permissionId })) })]);
    res.json({ message: "Permissions updated" });
  } catch { res.status(400).json({ message: "Unable to update role permissions" }); }
}

export async function createPermission(req: Request, res: Response) {
  const user = await authenticate(req, res);
  if (!user || !superAdminOnly(user.role.name, res)) return;
  const { name, description } = req.body as { name?: unknown; description?: unknown };
  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ message: "Permission name is required" }); return; }
  try {
    const permission = await prisma.permission.create({ data: { name: name.trim().toUpperCase().replaceAll(" ", "_"), description: typeof description === "string" ? description.trim() || null : null } });
    res.status(201).json({ permission });
  } catch { res.status(409).json({ message: "A permission with this name already exists" }); }
}

export async function getWorkspaceSettings(req: Request, res: Response) {
  if (!(await authenticate(req, res))) return;
  res.json({ items: [{ workspace: "HRMS", timezone: "Asia/Kolkata", theme: "Black, white & orange", access: "Administrator managed" }] });
}
