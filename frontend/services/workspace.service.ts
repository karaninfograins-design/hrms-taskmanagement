import { apiRequest } from "./api";

export type WorkspaceListItem = Record<string, string | number | boolean | null>;

export type WorkspaceListResponse = { items: WorkspaceListItem[] };

export type ProjectDetails = {
  id: number;
  name: string;
  key?: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdBy: { id: number; name: string; email: string };
  availableUsers: Array<{ id: number; name: string; email: string }>;
  sprints: Array<{
    id: number;
    name: string;
    type: string;
    status: string;
    startDate: string;
    endDate: string;
    _count: { workItems: number };
  }>;
  members: Array<{
    joinedAt: string;
    user: {
      id: number;
      name: string;
      email: string;
      status: string;
      designation: { name: string } | null;
    };
  }>;
  workItems: Array<{
    id: number;
    title: string;
    type: string;
    status: string;
    priority: string;
    description?: string | null;
    parentId?: number | null;
    storyPoints?: number | string | null;
    startDate?: string | null;
    dueDate?: string | null;
    sprint: { id: number; name: string } | null;
    assignee: { id: number; name: string; email: string } | null;
  }>;
};

export type SprintDetails = {
  id: number;
  name: string;
  description: string | null;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  project: { id: number; name: string };
  createdBy: { id: number; name: string; email: string };
  members: Array<{ id: number; name: string; email: string }>;
  workItems: Array<{
    id: number;
    title: string;
    type: string;
    status: string;
    priority: string;
    startDate: string | null;
    dueDate: string | null;
    assignee: { id: number; name: string; email: string } | null;
    reporter: { id: number; name: string; email: string } | null;
    parent: { id: number; title: string; type: string } | null;
    _count: { children: number; comments: number };
    comments: Array<{
      id: number;
      content: string;
      createdAt: string;
      deletedAt?: string | null;
      deletedById?: number | null;
      user: { id: number; name: string };
      deletedBy?: { id: number; name: string } | null;
    }>;
  }>;
};

export function getWorkspaceList(resource: string, token: string) {
  return apiRequest<WorkspaceListResponse>(`/api/workspace/${resource}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getProject(id: number, token: string) {
  return apiRequest<{ project: ProjectDetails }>(`/api/workspace/projects/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateProjectMembers(id: number, userIds: number[], token: string) {
  return apiRequest(`/api/workspace/projects/${id}/members`, { method: "PUT", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify({ userIds }) });
}

export function getSprint(id: number, token: string) {
  return apiRequest<{ sprint: SprintDetails }>(`/api/workspace/sprints/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type WorkItemInput = {
  projectId: number;
  sprintId?: number | null;
  type: "EPIC" | "STORY" | "TASK" | "FEATURE" | "BUG" | "SUBTASK";
  title: string;
  description?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assigneeId?: number | null;
  assigneeIds?: number[];
  parentId?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  storyPoints?: string | null;
};

export function createWorkItem(data: WorkItemInput, token: string) {
  return apiRequest("/api/workspace/work-items", { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

export function updateWorkItem(
  id: number,
  data: Partial<WorkItemInput> & { status?: string },
  token: string
) {
  return apiRequest(`/api/workspace/work-items/${id}`, {
    method: "PATCH",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteWorkItem(id: number, token: string) {
  return apiRequest(`/api/workspace/work-items/${id}`, {
    method: "DELETE",
    headers: auth(token),
  });
}

export function getWorkItem(id: number, token: string) {
  return apiRequest<{
    item: {
      id: number;
      keyNumber?: number;
      projectId: number;
      sprintId?: number | null;
      type: string;
      title: string;
      description?: string | null;
      status: string;
      priority: string;
      storyPoints?: string | null;
      startDate?: string | null;
      dueDate?: string | null;
      project?: { id: number; key: string; name: string };
      sprint?: { id: number; name: string; status: string } | null;
      assignee?: { id: number; name: string; email: string } | null;
      reporter?: { id: number; name: string; email: string } | null;
      createdBy?: { id: number; name: string; email: string } | null;
      parent?: { id: number; title: string; type: string } | null;
      children?: Array<{
        id: number;
        title: string;
        type: string;
        status: string;
        priority: string;
        assignee?: { id: number; name: string; email: string } | null;
        sprint?: { id: number; name: string } | null;
      }>;
      comments?: Array<{
        id: number;
        content: string;
        createdAt: string;
        user: { id: number; name: string };
      }>;
    };
    members: Array<{ id: number; name: string; email: string }>;
  }>(`/api/workspace/work-items/${id}`, { headers: auth(token) });
}

export function updateWorkItemSprint(id: number, sprintId: number | null, token: string) {
  return apiRequest(`/api/workspace/work-items/${id}/sprint`, { method: "PATCH", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify({ sprintId }) });
}

export function getProjectEpics(projectId: number, token: string) {
  return apiRequest<{ items: Array<Record<string, unknown>> }>(`/api/workspace/epics?projectId=${projectId}`, { headers: auth(token) });
}

export function getProjectBacklog(projectId: number, token: string) {
  return apiRequest<{ items: Array<Record<string, unknown>> }>(`/api/workspace/backlog?projectId=${projectId}`, { headers: auth(token) });
}

export function addWorkItemComment(id: number, content: string, token: string) {
  return apiRequest(`/api/workspace/work-items/${id}/comments`, { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
}

export function deleteWorkItemComment(id: number, token: string) {
  return apiRequest(`/api/workspace/comments/${id}`, { method: "DELETE", headers: auth(token) });
}

export type Designation = { id: number; name: string; description: string | null; status: boolean };
export type Permission = { id: number; name: string; description: string | null };
export type Role = { id: number; name: string; description: string | null; permissionIds: string[] };
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export const getDesignations = (token: string) => apiRequest<{ items: Designation[] }>("/api/workspace/designations", { headers: auth(token) });
export const saveDesignation = (data: Partial<Designation>, token: string) => apiRequest<{ item: Designation }>(data.id ? `/api/workspace/designations/${data.id}` : "/api/workspace/designations", { method: data.id ? "PUT" : "POST", headers: auth(token), body: JSON.stringify(data) });
export const deleteDesignation = (id: number, token: string) => apiRequest(`/api/workspace/designations/${id}`, { method: "DELETE", headers: auth(token) });
export const deleteRole = (id: number, token: string) => apiRequest(`/api/workspace/roles/${id}`, { method: "DELETE", headers: auth(token) });
export const deleteProject = (id: number, token: string) => apiRequest(`/api/workspace/projects/${id}`, { method: "DELETE", headers: auth(token) });
export const deleteSprint = (id: number, token: string) => apiRequest(`/api/workspace/sprints/${id}`, { method: "DELETE", headers: auth(token) });
export const getRoles = (token: string) => apiRequest<{ roles: Role[]; permissions: Permission[] }>("/api/workspace/roles", { headers: auth(token) });
export const saveRolePermissions = (id: number, permissionIds: number[], token: string) => apiRequest(`/api/workspace/roles/${id}/permissions`, { method: "PUT", headers: auth(token), body: JSON.stringify({ permissionIds }) });
export const createPermission = (name: string, description: string, token: string) => apiRequest<{ permission: Permission }>("/api/workspace/permissions", { method: "POST", headers: auth(token), body: JSON.stringify({ name, description }) });
export const createWorkspaceItem = (resource: "projects" | "sprints", data: Record<string, string>, token: string) => apiRequest(`/api/workspace/${resource}`, { method: "POST", headers: auth(token), body: JSON.stringify(data) });
export const updateSprintStatus = (id: number, status: "ACTIVE" | "COMPLETED" | "CANCELLED", token: string) => apiRequest(`/api/workspace/sprints/${id}/status`, { method: "PATCH", headers: auth(token), body: JSON.stringify({ status }) });
