"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";

import { DashboardShell } from "@/components/workspace/management-pages";
import { useAuth } from "@/hooks/use-auth";

import {
  addWorkItemComment,
  createWorkItem,
  createWorkspaceItem,
  deleteProject,
  deleteSprint,
  deleteWorkItem,
  deleteWorkItemComment,
  getProject,
  getSprint,
  getWorkItem,
  getWorkspaceList,
  updateProjectMembers,
  updateSprintStatus,
  updateWorkItem,
  updateWorkItemSprint,
  type ProjectDetails,
  type SprintDetails,
  type WorkItemInput,
  type WorkspaceListItem,
} from "@/services/workspace.service";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Props = {
  mode: "projects" | "sprints";
};

type WorkItemType =
  | "EPIC"
  | "STORY"
  | "TASK"
  | "FEATURE"
  | "BUG"
  | "SUBTASK";

type WorkItemStatus =
  | "TODO"
  | "IN_PROGRESS"
  // | "REVIEW"
  | "IN_REVIEW"
  | "DONE"
  | "BLOCKED";

type WorkItemPriority =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

type SprintStatus =
  | "PLANNED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

type SprintItem = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  project?: string;
  projectId?: number;
};

type JiraWorkItem = {
  id: number;
  key: string;
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  sprintId: number | null;
  parentTitle?: string;
  assigneeName?: string;
  dueDate?: string;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString()
    : "Not set";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function loadWorkspaceItems(
  mode: Props["mode"],
  token: string,
  setItems: (items: WorkspaceListItem[]) => void,
  setProjects: (items: WorkspaceListItem[]) => void,
) {
  getWorkspaceList(mode, token)
    .then(({ items }) => setItems(items))
    .catch((error) => {
      console.error("Failed to load workspace items:", error);
    });

  if (mode === "sprints") {
    getWorkspaceList("projects", token)
      .then(({ items }) => setProjects(items))
      .catch((error) => {
        console.error("Failed to load projects:", error);
      });
  }
}

/* -------------------------------------------------------------------------- */
/* Shared Jira UI                                                             */
/* -------------------------------------------------------------------------- */

function TypeBadge({ type }: { type: WorkItemType }) {
  const typeClasses: Record<string, string> = {
    EPIC: "bg-slate-100 text-slate-800 border-slate-300",
    STORY: "bg-emerald-50 text-emerald-800 border-emerald-200",
    TASK: "bg-blue-50 text-blue-800 border-blue-200",
    FEATURE: "bg-indigo-50 text-indigo-800 border-indigo-200",
    BUG: "bg-rose-50 text-rose-800 border-rose-200",
    SUBTASK: "bg-slate-50 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border tracking-wider ${typeClasses[type] || "bg-slate-100 text-slate-700"
        }`}
    >
      {type}
    </span>
  );
}

function PriorityPill({ priority }: { priority: WorkItemPriority }) {
  const priorityClasses: Record<string, string> = {
    CRITICAL: "text-rose-700 bg-rose-50 border-rose-200",
    HIGH: "text-amber-700 bg-amber-50 border-amber-200",
    MEDIUM: "text-slate-700 bg-slate-50 border-slate-200",
    LOW: "text-slate-500 bg-slate-50 border-slate-200",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityClasses[priority] || "text-slate-700"
        }`}
    >
      {priority}
    </span>
  );
}

export function renderAssignees(item: any) {
  if (Array.isArray(item?.assignees) && item.assignees.length > 0) {
    const names = item.assignees
      .map((a: any) => a.user?.name || a.name)
      .filter(Boolean);
    if (names.length > 0) return names.join(", ");
  }
  if (item?.assignee?.name) return item.assignee.name;
  return <span style={{ color: "var(--muted)" }}>Unassigned</span>;
}

export function MultiAssigneeSelector({
  members,
  selectedIds,
  onChange,
  label = "Assignees",
}: {
  members: Array<{ id: number; name: string; email?: string }>;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  label?: string;
}) {
  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
      <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--fg)" }}>
        {label} ({selectedIds.length} selected)
      </label>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          maxHeight: "130px",
          overflowY: "auto",
          border: "1px solid var(--line)",
          borderRadius: "8px",
          padding: "8px",
          background: "var(--card-bg)",
        }}
      >
        {members.map(({ id, name, email }) => {
          const isSelected = selectedIds.includes(id);
          return (
            <button
              key={id}
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "16px",
                fontSize: "0.82rem",
                fontWeight: 500,
                border: isSelected ? "1px solid #3b82f6" : "1px solid var(--line)",
                backgroundColor: isSelected ? "rgba(59, 130, 246, 0.15)" : "transparent",
                color: isSelected ? "#2563eb" : "var(--fg)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onClick={() => {
                if (isSelected) {
                  onChange(selectedIds.filter((mId) => mId !== id));
                } else {
                  onChange([...selectedIds, id]);
                }
              }}
              title={email ? `${name} (${email})` : name}
            >
              <span>{isSelected ? "✓" : "+"}</span>
              <span>{name}</span>
            </button>
          );
        })}
        {members.length === 0 && (
          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>No team members available in project.</span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Projects / Sprints List                                                    */
/* -------------------------------------------------------------------------- */

export function ProjectSprintPage({ mode }: Props) {
  const router = useRouter();
  const { session } = useAuth();

  const [items, setItems] = useState<WorkspaceListItem[]>([]);
  const [projects, setProjects] = useState<WorkspaceListItem[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({
    type: "WEEKLY",
  });

  const refresh = useCallback(() => {
    if (!session?.token) return;

    loadWorkspaceItems(
      mode,
      session.token,
      setItems,
      setProjects,
    );
  }, [mode, session?.token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create(event: React.FormEvent) {
    event.preventDefault();

    if (!session?.token) return;

    try {
      await createWorkspaceItem(
        mode,
        form,
        session.token,
      );

      setShowForm(false);
      setForm({ type: "WEEKLY" });

      refresh();
    } catch (error) {
      console.error("Failed to create workspace item:", error);
      alert(getErrorMessage(error, "Unable to create item."));
    }
  }

  async function lifecycle(
    id: number,
    status: "ACTIVE" | "COMPLETED" | "CANCELLED",
  ) {
    if (!session?.token) return;

    try {
      await updateSprintStatus(
        id,
        status,
        session.token,
      );

      refresh();
    } catch (error) {
      console.error("Failed to update sprint:", error);
      alert(getErrorMessage(error, "Unable to update sprint."));
    }
  }

  async function removeProject(
    id: number,
    name: string,
  ) {
    if (
      !session?.token ||
      !confirm(`Delete project "${name}"?`)
    ) {
      return;
    }

    try {
      await deleteProject(id, session.token);
      refresh();
    } catch (error) {
      console.error("Failed to delete project:", error);
      alert(getErrorMessage(error, "Unable to delete project."));
    }
  }

  async function removeSprint(
    id: number,
    name: string,
  ) {
    if (
      !session?.token ||
      !confirm(`Delete sprint "${name}"?`)
    ) {
      return;
    }

    try {
      await deleteSprint(id, session.token);
      refresh();
    } catch (error) {
      console.error("Failed to delete sprint:", error);
      alert(getErrorMessage(error, "Unable to delete sprint."));
    }
  }

  const isProjects = mode === "projects";

  return (
    <DashboardShell>
      <div className="welcome">
        <p className="eyebrow">WORK MANAGEMENT</p>

        <h1>
          {isProjects ? "Projects" : "Sprints"}
        </h1>
      </div>

      <button
        className="primary-button workspace-add-button mb-4"
        onClick={() => setShowForm(!showForm)}
      >
        + Create {isProjects ? "project" : "sprint"}
      </button>

      {showForm && (
        <form
          className="enhanced-sprint-form"
          onSubmit={create}
        >
          <label>
            {isProjects ? "Project Name" : "Sprint Name"}

            <input
              placeholder={`Enter ${isProjects ? "project" : "sprint"
                } title`}
              value={form.name || ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  name: event.target.value,
                })
              }
              required
            />
          </label>

          {!isProjects && (
            <label>
              Associated Project

              <select
                value={form.projectId || ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    projectId: event.target.value,
                  })
                }
                required
              >
                <option value="">
                  Select a project
                </option>

                {projects.map((project) => (
                  <option
                    key={String(project.id)}
                    value={String(project.id)}
                  >
                    {String(project.name)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            {isProjects
              ? "Project Status"
              : "Iteration Cadence"}

            <select
              value={form.type || "WEEKLY"}
              onChange={(event) =>
                setForm({
                  ...form,
                  type: event.target.value,
                })
              }
            >
              {isProjects ? (
                <>
                  <option value="ACTIVE">
                    Active
                  </option>

                  <option value="INACTIVE">
                    Inactive
                  </option>
                </>
              ) : (
                <>
                  <option value="WEEKLY">Weekly (7 Days)</option>
                  <option value="FORTNIGHTLY">Fortnightly (15 Days)</option>
                  <option value="MONTHLY">Monthly (30 Days)</option>
                  <option value="MANUAL">Custom Schedule (Manual Dates)</option>
                </>
              )}
            </select>
          </label>

          <label>
            Start Date {(!isProjects && form.type !== "MANUAL") ? "(Optional)" : isProjects ? "(Optional)" : ""}
            <input
              type="date"
              value={form.startDate || ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  startDate: event.target.value,
                })
              }
              required={!isProjects && form.type === "MANUAL"}
            />
          </label>

          <label>
            {isProjects ? "Deadline / End Date (Optional)" : `End Date ${form.type !== "MANUAL" ? "(Optional)" : ""}`}
            <input
              type="date"
              value={form.endDate || ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  endDate: event.target.value,
                })
              }
              required={!isProjects && form.type === "MANUAL"}
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Description & Objectives

            <textarea
              placeholder="Brief summary or goals..."
              value={form.description || ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  description:
                    event.target.value,
                })
              }
            />
          </label>

          <div className="enhanced-sprint-form-actions">
            <button
              type="button"
              className="sprint-btn"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="sprint-btn sprint-btn-primary"
            >
              Save {isProjects ? "Project" : "Sprint"}
            </button>
          </div>
        </form>
      )}

      {isProjects ? (
        <div className="workspace-list-card">
          <div className="workspace-table-scroll">
            <table className="workspace-table project-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Owner</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {(() => {
                  const isEmployeeRole = session?.user?.role === "EMPLOYEE";
                  const displayItems = isEmployeeRole
                    ? items.filter((item: any) => {
                        const isMember = Array.isArray(item.members) && item.members.some((m: any) => (m.userId || m.user?.id) === session?.user?.id || m.user?.email === session?.user?.email);
                        const isOwner = (item.createdBy?.id || item.createdById) === session?.user?.id;
                        return isMember || isOwner;
                      })
                    : items;

                  if (displayItems.length === 0) {
                    return (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", padding: "24px", color: "var(--muted, #64748b)" }}>
                          {isEmployeeRole ? "You are not assigned to any projects yet." : "No projects found."}
                        </td>
                      </tr>
                    );
                  }

                  return displayItems.map((item) => (
                    <tr key={String(item.id)}>
                    <td>
                      <strong>
                        {String(item.key || "PRJ")}
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {String(item.name)}
                      </strong>
                    </td>

                    <td>
                      <span className="jira-status">
                        {String(item.status)}
                      </span>
                    </td>

                    <td>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                        <span>👤</span> {(item as any).createdBy?.name || item.owner || "Admin"}
                      </span>
                    </td>

                    <td>
                      {String(
                        item.owner || "Not assigned",
                      )}
                    </td>

                    <td>
                      {item.startDate
                        ? new Date(
                          String(item.startDate),
                        ).toLocaleDateString()
                        : "Not set"}
                    </td>

                    <td>
                      {item.endDate
                        ? new Date(
                          String(item.endDate),
                        ).toLocaleDateString()
                        : "Not set"}
                    </td>

                    <td className="sprint-action-group">
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-extrabold text-[11px] transition-all cursor-pointer shadow-2xs"
                        onClick={() =>
                          router.push(
                            `/dashboard/projects/${item.id}`,
                          )
                        }
                        title="View Project Details"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span>View</span>
                      </button>

                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 font-extrabold text-[11px] transition-all cursor-pointer shadow-2xs"
                        onClick={() =>
                          removeProject(
                            Number(item.id),
                            String(item.name),
                          )
                        }
                        title="Delete Project"
                      >
                        <svg className="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ));
              })()}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="workspace-list-card">
          <div className="workspace-table-scroll">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Sprint Name</th>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={String(item.id)}>
                    <td>
                      <strong>
                        {String(item.name)}
                      </strong>
                    </td>

                    <td>
                      {String(item.project || "—")}
                    </td>

                    <td>
                      <span className="type-badge type-badge-task">
                        {String(item.type)}
                      </span>
                    </td>

                    <td>
                      <span className="jira-status">
                        {String(item.status)}
                      </span>
                    </td>

                    <td>
                      {item.startDate
                        ? new Date(
                          String(item.startDate),
                        ).toLocaleDateString()
                        : "Not set"}
                    </td>

                    <td>
                      {item.endDate
                        ? new Date(
                          String(item.endDate),
                        ).toLocaleDateString()
                        : "Not set"}
                    </td>

                    <td className="sprint-action-group">
                      {item.status === "PLANNED" && (
                        <button
                          className="sprint-btn sprint-btn-success"
                          onClick={() =>
                            lifecycle(
                              Number(item.id),
                              "ACTIVE",
                            )
                          }
                        >
                          ▶ Start
                        </button>
                      )}

                      {item.status === "ACTIVE" && (
                        <>
                          <button
                            className="sprint-btn sprint-btn-success"
                            onClick={() =>
                              lifecycle(
                                Number(item.id),
                                "COMPLETED",
                              )
                            }
                          >
                            ✓ Complete
                          </button>

                          <button
                            className="sprint-btn"
                            onClick={() =>
                              lifecycle(
                                Number(item.id),
                                "CANCELLED",
                              )
                            }
                          >
                            Cancel
                          </button>
                        </>
                      )}

                      <button
                        className="sprint-btn sprint-btn-primary"
                        onClick={() =>
                          router.push(
                            `/dashboard/sprints/${item.id}`,
                          )
                        }
                      >
                        View Sprint
                      </button>

                      <button
                        className="sprint-btn sprint-btn-danger"
                        onClick={() =>
                          removeSprint(
                            Number(item.id),
                            String(item.name),
                          )
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Project Details                                                            */
/* -------------------------------------------------------------------------- */

export function ProjectDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const { session, isLoading } = useAuth();

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState<
    "overview" | "backlog" | "board" | "sprints" | "workItems" | "epics" | "members" | "reports" | "activity"
  >(pathname?.endsWith("/backlog") ? "backlog" : "overview");

  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberMessage, setMemberMessage] = useState("");
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [tempMemberIds, setTempMemberIds] = useState<number[]>([]);

  /* Epic creation state */
  const [showCreateEpic, setShowCreateEpic] = useState(false);
  const [epicForm, setEpicForm] = useState({
    name: "",
    description: "",
    priority: "MEDIUM",
    assigneeId: "",
    assigneeIds: [] as number[],
    startDate: "",
    dueDate: "",
  });

  /* Sprint creation state */
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [sprintForm, setSprintForm] = useState({
    name: "",
    type: "WEEKLY",
    startDate: "",
    endDate: "",
  });
  const [sprintMessage, setSprintMessage] = useState("");

  /* Work Item creation state */
  const [showCreateWorkItem, setShowCreateWorkItem] = useState(false);
  const [workItemForm, setWorkItemForm] = useState({
    type: "STORY",
    title: "",
    description: "",
    priority: "MEDIUM",
    sprintId: "",
    assigneeId: "",
    assigneeIds: [] as number[],
    parentId: "",
    startDate: "",
    dueDate: "",
    storyPoints: "",
  });
  const [workItemMessage, setWorkItemMessage] = useState("");

  /* Filter states for work items */
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState("");

  /* View Sprint & Epic Modal state */
  const [selectedSprintForView, setSelectedSprintForView] = useState<
    ProjectDetails["sprints"][number] | null
  >(null);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<number | null>(null);
  const [editingWorkItem, setEditingWorkItem] = useState<{
    id: number;
    title: string;
    description: string;
    type: string;
    status: string;
    priority: string;
    assigneeId: string;
    assigneeIds: number[];
    sprintId: string;
    parentId: string;
    storyPoints: string;
    startDate: string;
    dueDate: string;
  } | null>(null);

  const loadProject = useCallback(async () => {
    if (!session?.token || !params.id) return;
    try {
      const { project: nextProject } = await getProject(
        Number(params.id),
        session.token
      );
      setProject(nextProject);
      setMemberIds(nextProject.members.map(({ user }) => user.id));
      setSelectedSprintForView((prev) => {
        if (!prev) return null;
        return nextProject.sprints.find((s) => s.id === prev.id) || null;
      });
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "Unable to load project details.")
      );
    }
  }, [params.id, session?.token]);

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  if (isLoading || !session) {
    return <main className="route-loading">Loading project...</main>;
  }

  async function saveMembers() {
    if (!session?.token || !project) return;
    try {
      await updateProjectMembers(project.id, memberIds, session.token);
      await loadProject();
      setMemberMessage("Project team updated successfully.");
      setTimeout(() => setMemberMessage(""), 4000);
    } catch (err) {
      setMemberMessage(getErrorMessage(err, "Unable to update project team."));
    }
  }

  function addMember() {
    if (!memberToAdd) return;
    const id = Number(memberToAdd);
    setMemberIds((current) => (current.includes(id) ? current : [...current, id]));
    setMemberToAdd("");
    setMemberMessage("");
  }

  function removeMember(id: number) {
    setMemberIds((current) => current.filter((memberId) => memberId !== id));
    setMemberMessage("");
  }

  async function handleCreateEpic(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.token || !project || !epicForm.name.trim()) return;

    try {
      await createWorkItem(
        {
          projectId: project.id,
          sprintId: null,
          type: "EPIC",
          title: epicForm.name.trim(),
          description: epicForm.description.trim() || undefined,
          priority: epicForm.priority as WorkItemInput["priority"],
          assigneeId: epicForm.assigneeIds.length > 0 ? epicForm.assigneeIds[0] : (epicForm.assigneeId ? Number(epicForm.assigneeId) : null),
          assigneeIds: epicForm.assigneeIds,
          parentId: null,
          startDate: epicForm.startDate || undefined,
          dueDate: epicForm.dueDate || undefined,
        },
        session.token
      );

      setEpicForm({ name: "", description: "", priority: "MEDIUM", assigneeId: "", assigneeIds: [], startDate: "", dueDate: "" });
      setShowCreateEpic(false);
      setWorkItemMessage("Epic created successfully.");
      setTimeout(() => setWorkItemMessage(""), 4000);
      await loadProject();
    } catch (err) {
      setWorkItemMessage(getErrorMessage(err, "Failed to create epic."));
    }
  }

  function getDatesForCadence(type: string, startStr?: string) {
    const start = startStr ? new Date(startStr) : new Date();
    const startDate = start.toISOString().split("T")[0];
    const daysToAdd = type === "WEEKLY" ? 7 : type === "FORTNIGHTLY" ? 14 : type === "MONTHLY" ? 30 : 7;
    const end = new Date(start);
    end.setDate(end.getDate() + daysToAdd);
    const endDate = end.toISOString().split("T")[0];
    return { startDate, endDate };
  }

  async function handleCreateSprint(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.token || !project || !sprintForm.name.trim()) return;

    let finalStart = sprintForm.startDate;
    let finalEnd = sprintForm.endDate;

    if (sprintForm.type !== "MANUAL" && (!finalStart || !finalEnd)) {
      const autoDates = getDatesForCadence(sprintForm.type, finalStart || undefined);
      finalStart = finalStart || autoDates.startDate;
      finalEnd = finalEnd || autoDates.endDate;
    }

    if (!finalStart || !finalEnd) {
      setSprintMessage("Start date and end date are required for a custom sprint.");
      return;
    }
    if (new Date(finalStart) >= new Date(finalEnd)) {
      setSprintMessage("Sprint start date must be before end date.");
      return;
    }

    try {
      await createWorkspaceItem(
        "sprints",
        {
          name: sprintForm.name.trim(),
          type: sprintForm.type,
          startDate: finalStart,
          endDate: finalEnd,
          projectId: String(project.id),
        },
        session.token
      );

      setSprintForm({ name: "", type: "WEEKLY", startDate: "", endDate: "" });
      setShowCreateSprint(false);
      setSprintMessage("Sprint created successfully.");
      setTimeout(() => setSprintMessage(""), 4000);
      await loadProject();
    } catch (err) {
      setSprintMessage(getErrorMessage(err, "Failed to create sprint."));
    }
  }

  async function handleCreateWorkItem(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.token || !project || !workItemForm.title.trim()) return;

    if (workItemForm.type === "SUBTASK" && !workItemForm.parentId) {
      setWorkItemMessage("Parent work item is required when creating a Sub-task.");
      return;
    }

    try {
      await createWorkItem(
        {
          projectId: project.id,
          sprintId: workItemForm.sprintId ? Number(workItemForm.sprintId) : null,
          type: workItemForm.type as WorkItemInput["type"],
          title: workItemForm.title.trim(),
          description: workItemForm.description.trim() || undefined,
          priority: workItemForm.priority as WorkItemInput["priority"],
          assigneeId: workItemForm.assigneeIds.length > 0 ? workItemForm.assigneeIds[0] : (workItemForm.assigneeId ? Number(workItemForm.assigneeId) : null),
          assigneeIds: workItemForm.assigneeIds,
          parentId: workItemForm.parentId ? Number(workItemForm.parentId) : null,
          startDate: workItemForm.startDate || undefined,
          dueDate: workItemForm.dueDate || undefined,
          storyPoints: workItemForm.storyPoints || null,
        },
        session.token
      );

      setWorkItemForm({
        type: "STORY",
        title: "",
        description: "",
        priority: "MEDIUM",
        sprintId: "",
        assigneeId: "",
        assigneeIds: [],
        parentId: "",
        startDate: "",
        dueDate: "",
        storyPoints: "",
      });
      setShowCreateWorkItem(false);
      setWorkItemMessage("Work item created successfully.");
      setTimeout(() => setWorkItemMessage(""), 4000);
      await loadProject();
    } catch (err) {
      setWorkItemMessage(getErrorMessage(err, "Failed to create work item."));
    }
  }

  async function handleUpdateSprintStatus(sprintId: number, status: "ACTIVE" | "COMPLETED" | "CANCELLED") {
    if (!session?.token) return;
    try {
      await updateSprintStatus(sprintId, status, session.token);
      await loadProject();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update sprint status."));
    }
  }

  async function handleQuickStatusChange(workItemId: number, newStatus: string) {
    if (!session?.token) return;
    try {
      await updateWorkItem(workItemId, { status: newStatus }, session.token);
      await loadProject();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update work item status."));
    }
  }

  async function handleSaveEditWorkItem(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.token || !editingWorkItem) return;

    if (editingWorkItem.type === "SUBTASK" && !editingWorkItem.parentId) {
      setError("Parent work item is required for Sub-task.");
      return;
    }

    try {
      await updateWorkItem(
        editingWorkItem.id,
        {
          title: editingWorkItem.title,
          description: editingWorkItem.description,
          type: editingWorkItem.type as WorkItemInput["type"],
          status: editingWorkItem.status,
          priority: editingWorkItem.priority as WorkItemInput["priority"],
          assigneeId: editingWorkItem.assigneeId ? Number(editingWorkItem.assigneeId) : null,
          sprintId: editingWorkItem.sprintId ? Number(editingWorkItem.sprintId) : null,
          parentId: editingWorkItem.parentId ? Number(editingWorkItem.parentId) : null,
          storyPoints: editingWorkItem.storyPoints || null,
          startDate: editingWorkItem.startDate || null,
          dueDate: editingWorkItem.dueDate || null,
        },
        session.token
      );
      setEditingWorkItem(null);
      await loadProject();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update work item."));
    }
  }

  async function handleDeleteWorkItem(id: number) {
    if (!session?.token) return;
    if (!window.confirm("Are you sure you want to delete this work item?")) return;
    try {
      await deleteWorkItem(id, session.token);
      if (editingWorkItem?.id === id) setEditingWorkItem(null);
      await loadProject();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete work item."));
    }
  }

  const workItems = project?.workItems || [];
  const backlogItems = workItems.filter((item) => !item.sprint);
  const epicItems = workItems.filter((item) => item.type === "EPIC");

  /* Filter work items */
  const filteredWorkItems = workItems.filter((item) => {
    if (searchFilter && !item.title.toLowerCase().includes(searchFilter.toLowerCase())) {
      return false;
    }
    if (typeFilter && item.type !== typeFilter) {
      return false;
    }
    if (statusFilter && item.status !== statusFilter) {
      return false;
    }
    if (sprintFilter) {
      if (sprintFilter === "backlog" && item.sprint !== null) return false;
      if (sprintFilter !== "backlog" && String(item.sprint?.id) !== sprintFilter) return false;
    }
    return true;
  });

  /* Report metrics */
  const statusCounts = {
    TODO: workItems.filter((i) => i.status === "TODO").length,
    IN_PROGRESS: workItems.filter((i) => i.status === "IN_PROGRESS").length,
    IN_REVIEW: workItems.filter((i) => i.status === "IN_REVIEW").length,
    DONE: workItems.filter((i) => i.status === "DONE").length,
    BLOCKED: workItems.filter((i) => i.status === "BLOCKED").length,
  };

  const typeCounts = {
    EPIC: epicItems.length,
    STORY: workItems.filter((i) => i.type === "STORY").length,
    TASK: workItems.filter((i) => i.type === "TASK").length,
    FEATURE: workItems.filter((i) => i.type === "FEATURE").length,
    BUG: workItems.filter((i) => i.type === "BUG").length,
    SUBTASK: workItems.filter((i) => i.type === "SUBTASK").length,
  };

  const projectKey = `PRJ-${project?.id || ""}`;

  return (
    <DashboardShell>
      {/* Breadcrumb Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", color: "#64748b", marginBottom: "12px", fontWeight: 600 }}>
        <button
          type="button"
          onClick={() => router.push("/dashboard/projects")}
          style={{ background: "none", border: "none", color: "#ea580c", padding: 0, cursor: "pointer", fontWeight: 700 }}
        >
          Projects
        </button>
        <span>/</span>
        <span style={{ color: "#0f172a", fontWeight: 700 }}>
          {project?.name || "Project"} ({project?.key || `PRJ-${project?.id || ""}`})
        </span>
        <span>/</span>
        <span style={{ color: "#ea580c", textTransform: "capitalize", fontWeight: 700 }}>
          {activeTab}
        </span>
      </div>

      <button className="back-button" onClick={() => router.push("/dashboard/projects")}>
        ← Back to projects
      </button>

      {error ? (
        <p className="error-message">{error}</p>
      ) : !project ? (
        <p className="workspace-list-empty">Loading project details...</p>
      ) : (
        <>
          {/* Project Header */}
          <div className="welcome" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <p className="eyebrow">PROJECT WORKSPACE</p>
              <h1>{project.name}</h1>
              <p>{project.description || "No project description."}</p>
            </div>

            <div className="sprint-action-group" style={{ marginTop: "8px" }}>
              <button
                type="button"
                className="sprint-btn"
                style={{ backgroundColor: "#8b5cf6", color: "#fff", borderColor: "#7c3aed" }}
                onClick={() => {
                  setShowCreateEpic(!showCreateEpic);
                  setShowCreateWorkItem(false);
                  setShowCreateSprint(false);
                }}
              >
                ⚡ + Create Epic
              </button>
            </div>
          </div>

          {/* Project Summary Pills */}
          <div className="project-detail-summary">
            <span>
              <strong>Status</strong>
              <span className="jira-status">{project.status}</span>
            </span>
            <span>
              <strong>Reporter / Owner</strong>
              {project.createdBy.name}
            </span>
            <span>
              <strong>Timeline</strong>
              {formatDate(project.startDate)} - {formatDate(project.endDate)}
            </span>
            <span>
              <strong>Sprints</strong>
              {project.sprints.length} total
            </span>
            <span>
              <strong>Work Items</strong>
              {project.workItems.length} items
            </span>
            <span>
              <strong>Team</strong>
              {project.members.length} members
            </span>
          </div>

          {/* Navigation Tabs Bar */}
          <div className="project-workspace-tabs">
            <button
              type="button"
              className={`workspace-tab-btn ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${activeTab === "backlog" ? "active" : ""}`}
              onClick={() => setActiveTab("backlog")}
            >
              Backlog <span className="tab-count">{backlogItems.length}</span>
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${activeTab === "board" ? "active" : ""}`}
              onClick={() => setActiveTab("board")}
            >
              Board
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${activeTab === "sprints" ? "active" : ""}`}
              onClick={() => setActiveTab("sprints")}
            >
              Sprints <span className="tab-count">{project.sprints.length}</span>
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${activeTab === "workItems" ? "active" : ""}`}
              onClick={() => setActiveTab("workItems")}
            >
              📋 Work Items <span className="tab-count">{project.workItems.length}</span>
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${activeTab === "epics" ? "active" : ""}`}
              onClick={() => setActiveTab("epics")}
            >
              Epics <span className="tab-count">{epicItems.length}</span>
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${activeTab === "members" ? "active" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              Members <span className="tab-count">{project.members.length}</span>
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${activeTab === "reports" ? "active" : ""}`}
              onClick={() => setActiveTab("reports")}
            >
              Reports
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${activeTab === "activity" ? "active" : ""}`}
              onClick={() => setActiveTab("activity")}
            >
              Activity
            </button>
          </div>

          {sprintMessage && <p className="success-message">{sprintMessage}</p>}
          {workItemMessage && <p className="success-message">{workItemMessage}</p>}

          {/* Create Epic Form */}
          {showCreateEpic && (
            <form className="enhanced-sprint-form" onSubmit={handleCreateEpic} style={{ borderLeft: "4px solid #8b5cf6" }}>
              <h3 style={{ gridColumn: "1 / -1", margin: "0 0 8px", fontSize: "1.1rem", color: "#6d28d9" }}>
                ⚡ Create New Epic in {project.name}
              </h3>
              <label style={{ gridColumn: "span 2" }}>
                Epic Name *
                <input
                  type="text"
                  placeholder="e.g. User Authentication & Security"
                  value={epicForm.name}
                  onChange={(e) => setEpicForm({ ...epicForm, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Priority
                <select
                  value={epicForm.priority}
                  onChange={(e) => setEpicForm({ ...epicForm, priority: e.target.value })}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </label>
              <label>
                Assignee (Project Members)
                <select
                  value={epicForm.assigneeId}
                  onChange={(e) => setEpicForm({ ...epicForm, assigneeId: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {project.members.map(({ user }) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start Date (Optional)
                <input
                  type="date"
                  value={epicForm.startDate}
                  onChange={(e) => setEpicForm({ ...epicForm, startDate: e.target.value })}
                />
              </label>
              <label>
                Due Date (Optional)
                <input
                  type="date"
                  value={epicForm.dueDate}
                  onChange={(e) => setEpicForm({ ...epicForm, dueDate: e.target.value })}
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Epic Description
                <textarea
                  placeholder="High-level goal or narrative for this epic..."
                  value={epicForm.description}
                  onChange={(e) => setEpicForm({ ...epicForm, description: e.target.value })}
                />
              </label>
              <div className="enhanced-sprint-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: "auto", margin: 0 }}
                  onClick={() => setShowCreateEpic(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sprint-btn" style={{ backgroundColor: "#8b5cf6", color: "#fff" }}>
                  Create Epic
                </button>
              </div>
            </form>
          )}

          {/* Create Sprint Modal/Form */}
          {showCreateSprint && (
            <form className="enhanced-sprint-form" onSubmit={handleCreateSprint}>
              <h3 style={{ gridColumn: "1 / -1", margin: "0 0 8px", fontSize: "1.1rem" }}>
                Create New Sprint in {project.name}
              </h3>
              <label>
                Sprint Name *
                <input
                  type="text"
                  placeholder="e.g. Sprint 1 - Core Auth"
                  value={sprintForm.name}
                  onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Iteration Cadence
                <select
                  value={sprintForm.type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    if (newType !== "MANUAL") {
                      const auto = getDatesForCadence(newType);
                      setSprintForm({ ...sprintForm, type: newType, startDate: auto.startDate, endDate: auto.endDate });
                    } else {
                      setSprintForm({ ...sprintForm, type: newType });
                    }
                  }}
                >
                  <option value="WEEKLY">Weekly (7 Days)</option>
                  <option value="FORTNIGHTLY">Fortnightly (15 Days)</option>
                  <option value="MONTHLY">Monthly (30 Days)</option>
                  <option value="MANUAL">Custom Schedule (Manual Dates)</option>
                </select>
              </label>
              <label>
                Start Date {sprintForm.type === "MANUAL" ? "*" : "(Auto-calculated)"}
                <input
                  type="date"
                  value={sprintForm.startDate}
                  onChange={(e) => setSprintForm({ ...sprintForm, startDate: e.target.value })}
                  required={sprintForm.type === "MANUAL"}
                />
              </label>
              <label>
                End Date {sprintForm.type === "MANUAL" ? "*" : "(Auto-calculated)"}
                <input
                  type="date"
                  value={sprintForm.endDate}
                  onChange={(e) => setSprintForm({ ...sprintForm, endDate: e.target.value })}
                  required={sprintForm.type === "MANUAL"}
                />
              </label>
              <div className="enhanced-sprint-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: "auto", margin: 0 }}
                  onClick={() => setShowCreateSprint(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sprint-btn sprint-btn-primary">
                  Create Sprint
                </button>
              </div>
            </form>
          )}

          {/* Create Work Item Form */}
          {showCreateWorkItem && (
            <form className="enhanced-sprint-form" onSubmit={handleCreateWorkItem}>
              <h3 style={{ gridColumn: "1 / -1", margin: "0 0 8px", fontSize: "1.1rem" }}>
                Create Work Item in {project.name}
              </h3>
              <label>
                Issue Type
                <select
                  value={workItemForm.type}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, type: e.target.value })}
                >
                  <option value="STORY">Story</option>
                  <option value="TASK">Task</option>
                  <option value="FEATURE">Feature</option>
                  <option value="BUG">Bug</option>
                  <option value="SUBTASK">Sub-task</option>
                </select>
              </label>
              <label style={{ gridColumn: "span 2" }}>
                Title *
                <input
                  type="text"
                  placeholder="Short summary of work item..."
                  value={workItemForm.title}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, title: e.target.value })}
                  required
                />
              </label>
              <label>
                Priority
                <select
                  value={workItemForm.priority}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, priority: e.target.value })}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </label>
              <MultiAssigneeSelector
                members={project.members.map((m) => m.user)}
                selectedIds={workItemForm.assigneeIds}
                onChange={(ids) => setWorkItemForm({ ...workItemForm, assigneeIds: ids, assigneeId: ids[0] ? String(ids[0]) : "" })}
                label="Assignees (Multiple Select)"
              />
              <label>
                Sprint (Optional)
                <select
                  value={workItemForm.sprintId}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, sprintId: e.target.value })}
                >
                  <option value="">Backlog (No Sprint)</option>
                  {project.sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name} ({sprint.status})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ border: workItemForm.type === "SUBTASK" && !workItemForm.parentId ? "2px solid #ef4444" : "1px solid var(--line)", padding: "4px", borderRadius: "8px" }}>
                Parent Work Item {workItemForm.type === "SUBTASK" ? "* (Required for Sub-task)" : "(Optional)"}
                <select
                  value={workItemForm.parentId}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, parentId: e.target.value })}
                  required={workItemForm.type === "SUBTASK"}
                >
                  <option value="">{workItemForm.type === "SUBTASK" ? "-- Select Parent Item --" : "None (Top Level)"}</option>
                  {project.workItems
                    .filter((item) => item.type !== "SUBTASK")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        [{item.type}] {item.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Effort / Story Points
                <select
                  value={workItemForm.storyPoints}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, storyPoints: e.target.value })}
                >
                  <option value="">None / Unestimated</option>
                  <option value="4-5 hrs">4-5 hrs</option>
                  <option value="8-10 hrs">8-10 hrs</option>
                  <option value="12-15 hrs">12-15 hrs</option>
                  <option value="20-25 hrs">20-25 hrs</option>
                  <option value="32-40 hrs">32-40 hrs</option>
                  <option value="52-65 hrs">52-65 hrs</option>
                </select>
              </label>
              <label>
                Start Date (Optional)
                <input
                  type="date"
                  value={workItemForm.startDate}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, startDate: e.target.value })}
                />
              </label>
              <label>
                Due Date (Optional)
                <input
                  type="date"
                  value={workItemForm.dueDate}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, dueDate: e.target.value })}
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Description
                <textarea
                  placeholder="Detailed description of the issue or task..."
                  value={workItemForm.description}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, description: e.target.value })}
                />
              </label>
              <div className="enhanced-sprint-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: "auto", margin: 0 }}
                  onClick={() => setShowCreateWorkItem(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sprint-btn sprint-btn-success">
                  Create Work Item
                </button>
              </div>
            </form>
          )}

          {/* Edit Work Item Modal/Form */}
          {editingWorkItem && (
            <form className="enhanced-sprint-form" onSubmit={handleSaveEditWorkItem} style={{ border: "2px solid #3b82f6" }}>
              <h3 style={{ gridColumn: "1 / -1", margin: "0 0 8px", fontSize: "1.1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Edit Work Item #{editingWorkItem.id}</span>
                <span className="type-badge type-badge-story">{editingWorkItem.type}</span>
              </h3>
              <label>
                Issue Type
                <select
                  value={editingWorkItem.type}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, type: e.target.value })}
                >
                  <option value="STORY">Story</option>
                  <option value="TASK">Task</option>
                  <option value="FEATURE">Feature</option>
                  <option value="BUG">Bug</option>
                  <option value="SUBTASK">Sub-task</option>
                  <option value="EPIC">Epic</option>
                </select>
              </label>
              <label style={{ gridColumn: "span 2" }}>
                Title *
                <input
                  type="text"
                  value={editingWorkItem.title}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, title: e.target.value })}
                  required
                />
              </label>
              <label>
                Status
                <select
                  value={editingWorkItem.status}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, status: e.target.value })}
                >
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="IN_REVIEW">In Review</option>
                  <option value="DONE">Done</option>
                  <option value="BLOCKED">Blocked</option>
                </select>
              </label>
              <label>
                Priority
                <select
                  value={editingWorkItem.priority}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, priority: e.target.value })}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </label>
              <MultiAssigneeSelector
                members={project.members.map((m) => m.user)}
                selectedIds={editingWorkItem.assigneeIds || []}
                onChange={(ids) => setEditingWorkItem({ ...editingWorkItem, assigneeIds: ids, assigneeId: ids[0] ? String(ids[0]) : "" })}
                label="Assignees (Multiple Select)"
              />
              <label>
                Sprint
                <select
                  value={editingWorkItem.sprintId}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, sprintId: e.target.value })}
                >
                  <option value="">Backlog (No Sprint)</option>
                  {project.sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name} ({sprint.status})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ border: editingWorkItem.type === "SUBTASK" && !editingWorkItem.parentId ? "2px solid #ef4444" : "1px solid var(--line)", padding: "4px", borderRadius: "8px" }}>
                Parent Work Item {editingWorkItem.type === "SUBTASK" ? "* (Required)" : "(Optional)"}
                <select
                  value={editingWorkItem.parentId}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, parentId: e.target.value })}
                  required={editingWorkItem.type === "SUBTASK"}
                >
                  <option value="">{editingWorkItem.type === "SUBTASK" ? "-- Select Parent Item --" : "None (Top Level)"}</option>
                  {project.workItems
                    .filter((item) => item.id !== editingWorkItem.id && item.type !== "SUBTASK")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        [{item.type}] {item.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Effort / Story Points
                <select
                  value={editingWorkItem.storyPoints}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, storyPoints: e.target.value })}
                >
                  <option value="">None / Unestimated</option>
                  <option value="4-5 hrs">4-5 hrs</option>
                  <option value="8-10 hrs">8-10 hrs</option>
                  <option value="12-15 hrs">12-15 hrs</option>
                  <option value="20-25 hrs">20-25 hrs</option>
                  <option value="32-40 hrs">32-40 hrs</option>
                  <option value="52-65 hrs">52-65 hrs</option>
                </select>
              </label>
              <label>
                Start Date
                <input
                  type="date"
                  value={editingWorkItem.startDate}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, startDate: e.target.value })}
                />
              </label>
              <label>
                Due Date
                <input
                  type="date"
                  value={editingWorkItem.dueDate}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, dueDate: e.target.value })}
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Description
                <textarea
                  placeholder="Detailed description of work item..."
                  value={editingWorkItem.description}
                  onChange={(e) => setEditingWorkItem({ ...editingWorkItem, description: e.target.value })}
                />
              </label>
              <div className="enhanced-sprint-form-actions" style={{ justifyContent: "space-between" }}>
                <button
                  type="button"
                  className="sprint-btn"
                  style={{ backgroundColor: "#ef4444", color: "#fff" }}
                  onClick={() => handleDeleteWorkItem(editingWorkItem.id)}
                >
                  🗑️ Delete
                </button>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ width: "auto", margin: 0 }}
                    onClick={() => setEditingWorkItem(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="sprint-btn sprint-btn-primary">
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* View Sprint Modal */}
          {selectedSprintForView && (() => {
            const selectedSprintItems = workItems.filter((item) => item.sprint?.id === selectedSprintForView.id);
            const durationDays = Math.max(
              1,
              Math.round(
                (new Date(selectedSprintForView.endDate).getTime() - new Date(selectedSprintForView.startDate).getTime()) /
                (1000 * 60 * 60 * 24)
              )
            ) || (selectedSprintForView.type === "WEEKLY" ? 7 : selectedSprintForView.type === "MONTHLY" ? 30 : 15);

            const totalPlanned = selectedSprintItems.length;
            const completedCount = selectedSprintItems.filter((i) => i.status === "DONE").length;
            const remainingCount = selectedSprintItems.filter((i) => ["TODO", "IN_PROGRESS", "IN_REVIEW"].includes(i.status)).length;
            const blockedCount = selectedSprintItems.filter((i) => i.status === "BLOCKED").length;

            const getItemPoints = (type: string) => (type === "EPIC" ? 5 : type === "STORY" ? 3 : type === "TASK" ? 2 : 1);
            const totalPts = selectedSprintItems.reduce((acc, i) => acc + getItemPoints(i.type), 0);
            const completedPts = selectedSprintItems.filter((i) => i.status === "DONE").reduce((acc, i) => acc + getItemPoints(i.type), 0);
            const remainingPts = totalPts - completedPts;
            const estHoursMin = totalPts * 4;
            const estHoursMax = totalPts * 5;
            const progressPercent = totalPts > 0 ? Math.round((completedPts / totalPts) * 100) : (totalPlanned > 0 ? Math.round((completedCount / totalPlanned) * 100) : 0);

            return (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                  padding: "20px",
                }}
                onClick={() => setSelectedSprintForView(null)}
              >
                <div
                  style={{
                    backgroundColor: "var(--card-bg, #ffffff)",
                    borderRadius: "14px",
                    width: "100%",
                    maxWidth: "920px",
                    maxHeight: "92vh",
                    overflowY: "auto",
                    padding: "28px",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                    color: "var(--foreground, #1e293b)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--orange)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Sprint Details · {project.name}
                      </span>
                      <h2 style={{ margin: "4px 0 0", fontSize: "1.6rem", fontWeight: 800 }}>{selectedSprintForView.name}</h2>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ width: "auto", padding: "6px 14px", margin: 0 }}
                      onClick={() => setSelectedSprintForView(null)}
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div className="project-detail-summary" style={{ marginBottom: "20px" }}>
                    <span>
                      <strong>Status</strong>
                      <span
                        className={`jira-status ${selectedSprintForView.status === "ACTIVE"
                          ? "status-in_progress"
                          : selectedSprintForView.status === "COMPLETED"
                            ? "status-done"
                            : selectedSprintForView.status === "CANCELLED"
                              ? "status-blocked"
                              : "status-todo"
                          }`}
                      >
                        {selectedSprintForView.status}
                      </span>
                    </span>
                    <span>
                      <strong>Cadence / Type</strong>
                      {selectedSprintForView.type}
                    </span>
                    <span>
                      <strong>Timeline</strong>
                      {formatDate(selectedSprintForView.startDate)} - {formatDate(selectedSprintForView.endDate)}
                    </span>
                    <span>
                      <strong>Total Work Items</strong>
                      {totalPlanned} items
                    </span>
                  </div>

                  {/* SPRINT PERFORMANCE REPORT CARD */}
                  <div style={{
                    background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    marginBottom: "24px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--orange)" }}>
                        📊 Sprint Report & Metrics
                      </h4>
                      <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#0f172a" }}>
                        Progress: {progressPercent}%
                      </span>
                    </div>

                    {/* Completion Progress Bar */}
                    <div style={{ width: "100%", height: "10px", backgroundColor: "#e2e8f0", borderRadius: "5px", overflow: "hidden", marginBottom: "16px" }}>
                      <div style={{ width: `${progressPercent}%`, height: "100%", backgroundColor: progressPercent === 100 ? "#10b981" : "#f97316", transition: "width 0.4s ease" }} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
                      <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <small style={{ color: "#64748b", fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Sprint Duration</small>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>{durationDays} Days</div>
                      </div>
                      <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <small style={{ color: "#64748b", fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Planned Work</small>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>{totalPlanned} Items ({totalPts} pts)</div>
                      </div>
                      <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <small style={{ color: "#64748b", fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Completed Work</small>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#10b981", marginTop: "2px" }}>{completedCount} Items ({completedPts} pts)</div>
                      </div>
                      <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <small style={{ color: "#64748b", fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Remaining Work</small>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#ea580c", marginTop: "2px" }}>{remainingCount} Items ({remainingPts} pts)</div>
                      </div>
                      <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <small style={{ color: "#64748b", fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Blocked Work</small>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#ef4444", marginTop: "2px" }}>{blockedCount} Items</div>
                      </div>
                      <div style={{ background: "#fff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <small style={{ color: "#64748b", fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Estimated Hours</small>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#3b82f6", marginTop: "2px" }}>{estHoursMin}–{estHoursMax} hrs</div>
                      </div>
                    </div>
                  </div>

                  {/* ACTION CONTROLS */}
                  <div style={{ display: "flex", gap: "10px", marginBottom: "24px", flexWrap: "wrap" }}>
                    {selectedSprintForView.status === "PLANNED" && (
                      <button
                        type="button"
                        className="sprint-btn sprint-btn-primary"
                        onClick={() => handleUpdateSprintStatus(selectedSprintForView.id, "ACTIVE")}
                      >
                        ▶ Start Sprint
                      </button>
                    )}
                    {selectedSprintForView.status === "ACTIVE" && (
                      <button
                        type="button"
                        className="sprint-btn sprint-btn-success"
                        onClick={() => handleUpdateSprintStatus(selectedSprintForView.id, "COMPLETED")}
                      >
                        ✓ Complete Sprint
                      </button>
                    )}
                    {selectedSprintForView.status !== "COMPLETED" && selectedSprintForView.status !== "CANCELLED" && (
                      <button
                        type="button"
                        className="sprint-btn sprint-btn-danger"
                        onClick={() => {
                          if (confirm("Are you sure you want to cancel this sprint?")) {
                            handleUpdateSprintStatus(selectedSprintForView.id, "CANCELLED");
                          }
                        }}
                      >
                        Cancel Sprint
                      </button>
                    )}
                    <button
                      type="button"
                      className="sprint-btn"
                      onClick={() => {
                        setWorkItemForm((prev) => ({ ...prev, sprintId: String(selectedSprintForView.id) }));
                        setShowCreateWorkItem(true);
                        setSelectedSprintForView(null);
                      }}
                    >
                      + Add Work Item to Sprint
                    </button>
                  </div>

                  {/* WORK ITEMS TABLE WITH ASSIGNEE & COMMENTS INTEGRATION */}
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "12px" }}>Sprint Work Items</h3>
                  {selectedSprintItems.length > 0 ? (
                    <div className="workspace-table-scroll">
                      <table className="workspace-table">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Priority</th>
                            <th>Assignee</th>
                            <th>Comments</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSprintItems.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <TypeBadge type={item.type as WorkItemType} />
                              </td>
                              <td>
                                <strong
                                  style={{ cursor: "pointer", color: "var(--orange)" }}
                                  onClick={() => setSelectedWorkItemId(selectedWorkItemId === item.id ? null : item.id)}
                                >
                                  {item.title} 💬
                                </strong>
                              </td>
                              <td>
                                <select
                                  className="jira-status-select"
                                  value={item.status}
                                  onChange={(e) => handleQuickStatusChange(item.id, e.target.value)}
                                >
                                  <option value="TODO">To Do</option>
                                  <option value="IN_PROGRESS">In Progress</option>
                                  <option value="IN_REVIEW">In Review</option>
                                  <option value="DONE">Done</option>
                                  <option value="BLOCKED">Blocked</option>
                                </select>
                              </td>
                              <td>
                                <PriorityPill priority={item.priority as WorkItemPriority} />
                              </td>
                              <td>
                                <select
                                  className="table-select"
                                  value={item.assignee?.id || ""}
                                  onChange={async (e) => {
                                    if (!session?.token) return;
                                    const nextAssigneeId = e.target.value ? Number(e.target.value) : null;
                                    await updateWorkItem(item.id, { assigneeId: nextAssigneeId }, session.token);
                                    await loadProject();
                                  }}
                                >
                                  <option value="">Unassigned</option>
                                  {project.members.map(({ user }) => (
                                    <option key={user.id} value={user.id}>
                                      {user.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="sprint-btn"
                                  onClick={() => setSelectedWorkItemId(selectedWorkItemId === item.id ? null : item.id)}
                                >
                                  {selectedWorkItemId === item.id ? "Hide Comments" : "View Comments"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="workspace-list-empty">No work items assigned to this sprint yet.</p>
                  )}
                </div>
              </div>
            );
          })()}



          {/* TAB CONTENT RENDERING */}

          {/* 1. OVERVIEW TAB */}
          {activeTab === "overview" && (
            <>
              <div className="project-grid" style={{ marginBottom: "24px" }}>
                <div className="project-card">
                  <div className="project-card-head">
                    <span className="project-mark">⚡</span>
                    <span className="jira-status">Active Sprints</span>
                  </div>
                  <h2>{project.sprints.filter((s) => s.status === "ACTIVE").length} Sprints Running</h2>
                  <p>Active sprint iterations currently in progress.</p>
                </div>
                <div className="project-card">
                  <div className="project-card-head">
                    <span className="project-mark">📋</span>
                    <span className="jira-status">{workItems.length} Total</span>
                  </div>
                  <h2>{statusCounts.DONE} / {workItems.length} Completed</h2>
                  <p>Work item completion count for project.</p>
                </div>
                <div className="project-card">
                  <div className="project-card-head">
                    <span className="project-mark">👥</span>
                    <span className="jira-status">{project.members.length} Members</span>
                  </div>
                  <h2>{project.members.length} Assigned Team</h2>
                  <p>Contributors assigned to this project.</p>
                </div>
              </div>

              <section className="project-detail-section">
                <div className="section-heading">
                  <h2>Active & Planned Sprints</h2>
                  <button className="text-button" onClick={() => setActiveTab("sprints")}>
                    View All Sprints ({project.sprints.length}) →
                  </button>
                </div>
                {project.sprints.length ? (
                  <div className="workspace-list-card">
                    <table className="workspace-table">
                      <thead>
                        <tr>
                          <th>Sprint Name</th>
                          <th>Status</th>
                          <th>Type</th>
                          <th>Duration</th>
                          <th>Work Items</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.sprints.slice(0, 5).map((sprint) => (
                          <tr key={sprint.id}>
                            <td>
                              <strong
                                style={{ cursor: "pointer", color: "var(--orange)" }}
                                onClick={() => router.push(`/dashboard/sprints/${sprint.id}`)}
                              >
                                {sprint.name} ↗
                              </strong>
                            </td>
                            <td>
                              <span className="jira-status">{sprint.status}</span>
                            </td>
                            <td>{sprint.type}</td>
                            <td>
                              {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
                            </td>
                            <td>
                              <strong>{sprint._count.workItems}</strong> items
                            </td>
                            <td>
                              <button
                                type="button"
                                className="sprint-btn"
                                onClick={() => router.push(`/dashboard/sprints/${sprint.id}`)}
                              >
                                View Sprint
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="workspace-list-empty">No sprints created yet.</p>
                )}
              </section>

              {/* Overview Epics Table (Capped at 5 rows) */}
              <section className="project-detail-section" style={{ marginTop: "24px" }}>
                <div className="section-heading">
                  <h2>Project Epics</h2>
                  <button className="text-button" onClick={() => setActiveTab("epics")}>
                    View All Epics ({epicItems.length}) →
                  </button>
                </div>
                {epicItems.length ? (
                  <div className="workspace-list-card">
                    <table className="workspace-table">
                      <thead>
                        <tr>
                          <th>Epic Title</th>
                          <th>Status</th>
                          <th>Priority</th>
                          <th>Assignee</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {epicItems.slice(0, 5).map((epic) => (
                          <tr key={epic.id}>
                            <td>
                              <strong
                                style={{ cursor: "pointer", color: "var(--orange)" }}
                                onClick={() => router.push(`/dashboard/epics/${epic.id}`)}
                              >
                                [EPIC] {epic.title} ↗
                              </strong>
                            </td>
                            <td>
                              <span className="jira-status">{epic.status}</span>
                            </td>
                            <td>
                              <span className="priority-pill">{epic.priority}</span>
                            </td>
                            <td>{epic.assignee?.name || "Unassigned"}</td>
                            <td>
                              <button
                                type="button"
                                className="sprint-btn sprint-btn-primary"
                                onClick={() => router.push(`/dashboard/epics/${epic.id}`)}
                              >
                                View Epic ↗
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="workspace-list-empty">No epics created for this project yet.</p>
                )}
              </section>
            </>
          )}

          {/* 2. BACKLOG TAB */}
          {activeTab === "backlog" && (
            <section className="project-detail-section">
              <div className="section-heading">
                <h2>Project Backlog</h2>
                <button
                  type="button"
                  className="sprint-btn sprint-btn-success"
                  onClick={() => {
                    setWorkItemForm((prev) => ({ ...prev, sprintId: "" }));
                    setShowCreateWorkItem(true);
                  }}
                >
                  + Add to Backlog
                </button>
              </div>

              {backlogItems.length ? (
                <div className="workspace-list-card">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Assignee</th>
                        <th>Assign to Sprint</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backlogItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className="type-badge type-badge-story">{item.type}</span>
                          </td>
                          <td>
                            <strong>{item.title}</strong>
                          </td>
                          <td>
                            <select
                              className="table-select"
                              value={item.status}
                              onChange={(e) => handleQuickStatusChange(item.id, e.target.value)}
                            >
                              <option value="TODO">To Do</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="IN_REVIEW">In Review</option>
                              <option value="DONE">Done</option>
                              <option value="BLOCKED">Blocked</option>
                            </select>
                          </td>
                          <td>
                            <span className="priority-pill">{item.priority}</span>
                          </td>
                          <td>{renderAssignees(item)}</td>
                          <td>
                            <select
                              className="table-select"
                              style={{ borderColor: "var(--orange)", fontWeight: 600 }}
                              value=""
                              onChange={async (e) => {
                                if (!session?.token || !e.target.value) return;
                                await updateWorkItemSprint(item.id, Number(e.target.value), session.token);
                                await loadProject();
                              }}
                            >
                              <option value="">Move to Sprint...</option>
                              {project.sprints.map((sprint) => (
                                <option key={sprint.id} value={sprint.id}>
                                  {sprint.name} ({sprint.status})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <button
                              type="button"
                              className="sprint-btn sprint-btn-secondary"
                              style={{ fontSize: "0.76rem", padding: "4px 8px" }}
                              title="View/Edit Work Item"
                              onClick={() => {
                                const currentAssigneeIds = Array.isArray((item as any).assignees) && (item as any).assignees.length > 0
                                  ? (item as any).assignees.map((a: any) => a.userId || a.user?.id).filter(Boolean)
                                  : (item.assignee ? [item.assignee.id] : []);
                                setEditingWorkItem({
                                  id: item.id,
                                  title: item.title,
                                  description: (item as any).description || "",
                                  type: item.type,
                                  status: item.status,
                                  priority: item.priority,
                                  assigneeId: item.assignee ? String(item.assignee.id) : "",
                                  assigneeIds: currentAssigneeIds,
                                  sprintId: item.sprint ? String(item.sprint.id) : "",
                                  parentId: (item as any).parentId ? String((item as any).parentId) : "",
                                  storyPoints: (item as any).storyPoints || "",
                                  startDate: (item as any).startDate ? String((item as any).startDate).split("T")[0] : "",
                                  dueDate: (item as any).dueDate ? String((item as any).dueDate).split("T")[0] : "",
                                });
                              }}
                            >
                              👁️ View / Edit
                            </button>
                            <button
                              type="button"
                              className="sprint-btn"
                              style={{ fontSize: "0.76rem", padding: "4px 8px", backgroundColor: "#ef4444", color: "#fff" }}
                              title="Delete Work Item"
                              onClick={() => handleDeleteWorkItem(item.id)}
                            >
                              🗑️ Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="workspace-list-empty">No unassigned items in backlog. All items are allocated to sprints.</p>
              )}
            </section>
          )}

          {/* 3. KANBAN BOARD TAB */}
          {activeTab === "board" && (
            <div className="jira-board-grid">
              {(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"] as const).map((colStatus) => {
                const columnItems = workItems.filter((item) => item.status === colStatus);
                return (
                  <div key={colStatus} className="jira-board-column">
                    <div className="jira-column-header">
                      <span>{colStatus.replace("_", " ")}</span>
                      <span className="tab-count">{columnItems.length}</span>
                    </div>

                    {columnItems.map((item) => (
                      <div key={item.id} className="jira-board-card">
                        <div className="jira-board-card-header">
                          <span
                            className={`type-badge ${item.type === "EPIC"
                              ? "type-badge-epic"
                              : item.type === "BUG"
                                ? "type-badge-bug"
                                : "type-badge-story"
                              }`}
                          >
                            {item.type}
                          </span>
                          <span className="priority-pill">{item.priority}</span>
                        </div>
                        <strong style={{ fontSize: "0.88rem" }}>{item.title}</strong>
                        <div className="jira-board-card-footer">
                          <span>{item.sprint?.name || "Backlog"}</span>
                          <select
                            className="table-select"
                            style={{ fontSize: "0.72rem", padding: "2px 4px" }}
                            value={item.status}
                            onChange={(e) => handleQuickStatusChange(item.id, e.target.value)}
                          >
                            <option value="TODO">TO DO</option>
                            <option value="IN_PROGRESS">IN PROGRESS</option>
                            <option value="IN_REVIEW">IN REVIEW</option>
                            <option value="DONE">DONE</option>
                            <option value="BLOCKED">BLOCKED</option>
                          </select>
                        </div>
                      </div>
                    ))}

                    {columnItems.length === 0 && (
                      <p style={{ fontSize: "0.78rem", color: "var(--muted)", textAlign: "center", margin: "auto 0" }}>
                        No items
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 4. SPRINTS TAB */}
          {activeTab === "sprints" && (
            <section className="project-detail-section">
              <div className="section-heading">
                <h2>Project Sprints</h2>
                <button
                  type="button"
                  className="sprint-btn sprint-btn-primary"
                  onClick={() => setShowCreateSprint(true)}
                >
                  + Create Sprint
                </button>
              </div>

              {project.sprints.length ? (
                <div className="workspace-list-card">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Sprint Name</th>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Duration</th>
                        <th>Work Items</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.sprints.map((sprint) => (
                        <tr key={sprint.id}>
                          <td>
                            <strong
                              style={{ cursor: "pointer", color: "var(--orange)" }}
                              onClick={() => router.push(`/dashboard/sprints/${sprint.id}`)}
                            >
                              {sprint.name} ↗
                            </strong>
                          </td>
                          <td>
                            <span
                              className={`jira-status ${sprint.status === "ACTIVE"
                                ? "status-in_progress"
                                : sprint.status === "COMPLETED"
                                  ? "status-done"
                                  : sprint.status === "CANCELLED"
                                    ? "status-blocked"
                                    : "status-todo"
                                }`}
                            >
                              {sprint.status}
                            </span>
                          </td>
                          <td>{sprint.type}</td>
                          <td>
                            {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
                          </td>
                          <td>
                            <strong>{sprint._count.workItems}</strong> items
                          </td>
                          <td>
                            <div className="sprint-action-group">
                              <button
                                type="button"
                                className="sprint-btn"
                                onClick={() => router.push(`/dashboard/sprints/${sprint.id}`)}
                              >
                                View Sprint
                              </button>
                              {sprint.status === "PLANNED" && (
                                <button
                                  type="button"
                                  className="sprint-btn sprint-btn-primary"
                                  onClick={() => handleUpdateSprintStatus(sprint.id, "ACTIVE")}
                                >
                                  Start Sprint
                                </button>
                              )}
                              {sprint.status === "ACTIVE" && (
                                <button
                                  type="button"
                                  className="sprint-btn sprint-btn-success"
                                  onClick={() => handleUpdateSprintStatus(sprint.id, "COMPLETED")}
                                >
                                  Complete Sprint
                                </button>
                              )}
                              {sprint.status !== "COMPLETED" && sprint.status !== "CANCELLED" && (
                                <button
                                  type="button"
                                  className="sprint-btn sprint-btn-danger"
                                  onClick={async () => {
                                    if (confirm(`Are you sure you want to delete sprint "${sprint.name}"?`)) {
                                      try {
                                        await deleteSprint(sprint.id, session.token);
                                        await loadProject();
                                      } catch (err) {
                                        setSprintMessage(getErrorMessage(err, "Failed to delete sprint."));
                                      }
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="workspace-list-empty">No sprints created for this project yet.</p>
              )}
            </section>
          )}

          {/* 5. WORK ITEMS TAB (All Types: Story, Task, Feature, Bug, Subtask, Epic) */}
          {activeTab === "workItems" && (
            <section className="project-detail-section">
              <div className="section-heading">
                <h2>All Project Work Items</h2>
                <button
                  type="button"
                  className="sprint-btn sprint-btn-success"
                  onClick={() => setShowCreateWorkItem(true)}
                >
                  + Add Work Item
                </button>
              </div>

              {/* Enhanced Dynamic Filter Controls */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: "20px",
                  padding: "10px 14px",
                  background: "var(--card-bg, #ffffff)",
                  borderRadius: "10px",
                  border: "1px solid var(--line, #e2e8f0)",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                }}
              >
                <div style={{ position: "relative", width: "240px" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "0.85rem",
                      color: "var(--muted, #64748b)",
                      pointerEvents: "none",
                    }}
                  >
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Search work items..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "7px 12px 7px 32px",
                      borderRadius: "6px",
                      border: "1px solid var(--line, #cbd5e1)",
                      fontSize: "0.85rem",
                      outline: "none",
                      backgroundColor: "var(--bg, #f8fafc)",
                      color: "inherit",
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted, #64748b)" }}>Type:</span>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--line, #cbd5e1)",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                      backgroundColor: "var(--bg, #f8fafc)",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">All Types</option>
                    <option value="STORY">Story</option>
                    <option value="TASK">Task</option>
                    <option value="FEATURE">Feature</option>
                    <option value="BUG">Bug</option>
                    <option value="SUBTASK">Subtask</option>
                    <option value="EPIC">Epic</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted, #64748b)" }}>Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--line, #cbd5e1)",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                      backgroundColor: "var(--bg, #f8fafc)",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">All Statuses</option>
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="IN_REVIEW">In Review</option>
                    <option value="DONE">Done</option>
                    <option value="BLOCKED">Blocked</option>
                  </select>
                </div>

                {(searchFilter || typeFilter || statusFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchFilter("");
                      setTypeFilter("");
                      setStatusFilter("");
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#ef4444",
                      backgroundColor: "#fef2f2",
                      cursor: "pointer",
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    ✕ Clear Filters
                  </button>
                )}
              </div>

              <div className="workspace-list-card">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Work Item</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Sprint</th>
                      <th>Assignee</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="type-badge type-badge-story">{item.type}</span>
                        </td>
                        <td>
                          <strong>{item.title}</strong>
                        </td>
                        <td>
                          <select
                            className="table-select"
                            value={item.status}
                            onChange={(e) => handleQuickStatusChange(item.id, e.target.value)}
                          >
                            <option value="TODO">To Do</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="IN_REVIEW">In Review</option>
                            <option value="DONE">Done</option>
                            <option value="BLOCKED">Blocked</option>
                          </select>
                        </td>
                        <td>
                          <span className="priority-pill">{item.priority}</span>
                        </td>
                        <td>{item.sprint ? item.sprint.name : "Backlog"}</td>
                        <td>{renderAssignees(item)}</td>
                        <td style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button
                            type="button"
                            className="sprint-btn sprint-btn-secondary"
                            style={{ fontSize: "0.76rem", padding: "4px 8px" }}
                            title="View/Edit Work Item"
                            onClick={() => {
                              const currentAssigneeIds = Array.isArray((item as any).assignees) && (item as any).assignees.length > 0
                                ? (item as any).assignees.map((a: any) => a.userId || a.user?.id).filter(Boolean)
                                : (item.assignee ? [item.assignee.id] : []);
                              setEditingWorkItem({
                                id: item.id,
                                title: item.title,
                                description: (item as any).description || "",
                                type: item.type,
                                status: item.status,
                                priority: item.priority,
                                assigneeId: item.assignee ? String(item.assignee.id) : "",
                                assigneeIds: currentAssigneeIds,
                                sprintId: item.sprint ? String(item.sprint.id) : "",
                                parentId: (item as any).parentId ? String((item as any).parentId) : "",
                                storyPoints: (item as any).storyPoints || "",
                                startDate: (item as any).startDate ? String((item as any).startDate).split("T")[0] : "",
                                dueDate: (item as any).dueDate ? String((item as any).dueDate).split("T")[0] : "",
                              });
                            }}
                          >
                            👁️ View
                          </button>
                          {item.type !== "SUBTASK" && (
                            <button
                              type="button"
                              className="sprint-btn"
                              style={{ fontSize: "0.76rem", padding: "4px 8px" }}
                              onClick={() => {
                                setWorkItemForm((prev) => ({
                                  ...prev,
                                  type: "SUBTASK",
                                  parentId: String(item.id),
                                }));
                                setShowCreateWorkItem(true);
                              }}
                            >
                              + Subtask
                            </button>
                          )}
                          <button
                            type="button"
                            className="sprint-btn"
                            style={{ fontSize: "0.76rem", padding: "4px 8px", backgroundColor: "#252321ff", color: "#fff" }}
                            title="Delete Work Item"
                            onClick={() => handleDeleteWorkItem(item.id)}
                          >
                            🗑️ Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 6. EPICS TAB */}
          {activeTab === "epics" && (
            <section className="project-detail-section">
              <div className="section-heading">
                <h2>Project Epics</h2>
                <button
                  type="button"
                  className="sprint-btn sprint-btn-primary"
                  onClick={() => setShowCreateEpic(true)}
                >
                  ⚡ + Create Epic
                </button>
              </div>

              {epicItems.length ? (
                <div className="workspace-list-card">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Epic Title</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Assignee</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {epicItems.map((epic) => (
                        <tr key={epic.id}>
                          <td>
                            <strong
                              style={{ cursor: "pointer", color: "var(--orange)" }}
                              onClick={() => router.push(`/dashboard/epics/${epic.id}`)}
                            >
                              [EPIC] {epic.title} ↗
                            </strong>
                          </td>
                          <td>
                            <span className="jira-status">{epic.status}</span>
                          </td>
                          <td>
                            <span className="priority-pill">{epic.priority}</span>
                          </td>
                          <td>{epic.assignee?.name || "Unassigned"}</td>
                          <td style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <button
                              type="button"
                              className="sprint-btn sprint-btn-primary"
                              onClick={() => router.push(`/dashboard/epics/${epic.id}`)}
                            >
                              View Epic ↗
                            </button>
                            <button
                              type="button"
                              className="sprint-btn sprint-btn-success"
                              onClick={() => {
                                setShowCreateSprint(true);
                                setSprintMessage(`Creating Sprint for Epic: ${epic.title}`);
                              }}
                            >
                              + Create Sprint
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="workspace-list-empty">No Epics defined for this project yet.</p>
              )}
            </section>
          )}

          {/* 7. MEMBERS TAB */}
          {activeTab === "members" && (
            <section className="project-detail-section">
              <div className="section-heading">
                <h2>Project Team Management</h2>
                <span>{project.members.length} members assigned</span>
              </div>

              <div className="team-editor" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", background: "var(--card-bg, #ffffff)", padding: "16px", borderRadius: "12px", border: "1px solid var(--line, #e2e8f0)" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--fg, #0f172a)" }}>Project Members</h3>
                  <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--muted, #64748b)" }}>
                    Manage assignees and team access for this project ({memberIds.length} members selected)
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {memberMessage && <span style={{ fontSize: "0.82rem", color: "#10b981", fontWeight: 700 }}>✓ {memberMessage}</span>}
                  <button
                    type="button"
                    className="sprint-btn sprint-btn-success"
                    style={{ padding: "8px 16px", borderRadius: "8px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    onClick={() => {
                      setTempMemberIds(memberIds);
                      setMemberSearch("");
                      setShowMemberModal(true);
                    }}
                  >
                    <span>+</span> Add Team Members
                  </button>
                </div>
              </div>

              {/* Add Team Members Modal Dialog */}
              {showMemberModal && (
                <div
                  className="jira-modal-backdrop"
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 9999,
                    padding: "16px",
                  }}
                  onClick={() => setShowMemberModal(false)}
                >
                  <div
                    style={{
                      maxWidth: "480px",
                      width: "100%",
                      backgroundColor: "#ffffff",
                      borderRadius: "16px",
                      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                      overflow: "hidden",
                      border: "1px solid #cbd5e1",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Modal Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                      <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                        👥 Add Team Members
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowMemberModal(false)}
                        style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#64748b", padding: "2px 6px" }}
                        title="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Modal Content */}
                    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                      {/* Search Bar */}
                      <input
                        type="text"
                        placeholder="🔍 Search employee..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.85rem",
                          outline: "none",
                          color: "#0f172a",
                        }}
                      />

                      {(() => {
                        const filteredUsers = project.availableUsers.filter((u) => {
                          if (!memberSearch.trim()) return true;
                          const q = memberSearch.toLowerCase();
                          return u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
                        });
                        const allSelected = filteredUsers.length > 0 && filteredUsers.every((u) => tempMemberIds.includes(u.id));

                        return (
                          <>
                            {/* Select All Checkbox */}
                            <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#f1f5f9", borderRadius: "10px", cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const newIds = Array.from(new Set([...tempMemberIds, ...filteredUsers.map((u) => u.id)]));
                                    setTempMemberIds(newIds);
                                  } else {
                                    const filteredUserIds = new Set(filteredUsers.map((u) => u.id));
                                    setTempMemberIds(tempMemberIds.filter((id) => !filteredUserIds.has(id)));
                                  }
                                }}
                                style={{ width: "16px", height: "16px", accentColor: "#f97316", cursor: "pointer" }}
                              />
                              <span>Select all ({filteredUsers.length} employees)</span>
                            </label>

                            {/* Employee List */}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                                maxHeight: "240px",
                                overflowY: "auto",
                                paddingRight: "4px",
                              }}
                            >
                              {filteredUsers.length ? (
                                filteredUsers.map((u) => {
                                  const isChecked = tempMemberIds.includes(u.id);
                                  const assignedMember = project.members.find((m) => m.user.id === u.id);
                                  const designationName = assignedMember?.user.designation?.name || "Employee";

                                  return (
                                    <label
                                      key={u.id}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "10px",
                                        padding: "8px 12px",
                                        borderRadius: "10px",
                                        border: isChecked ? "1px solid #f97316" : "1px solid #e2e8f0",
                                        backgroundColor: isChecked ? "#fff7ed" : "#ffffff",
                                        cursor: "pointer",
                                        transition: "all 0.15s ease",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setTempMemberIds([...tempMemberIds, u.id]);
                                            } else {
                                              setTempMemberIds(tempMemberIds.filter((id) => id !== u.id));
                                            }
                                          }}
                                          style={{ width: "16px", height: "16px", accentColor: "#f97316", cursor: "pointer" }}
                                        />
                                        <span style={{ fontSize: "1rem" }}>👤</span>
                                        <span style={{ fontSize: "0.85rem", fontWeight: isChecked ? 700 : 500, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {u.name}
                                        </span>
                                      </div>
                                      <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "12px", whiteSpace: "nowrap" }}>
                                        {designationName}
                                      </span>
                                    </label>
                                  );
                                })
                              ) : (
                                <p style={{ textAlign: "center", color: "#64748b", fontSize: "0.85rem", padding: "16px" }}>No matching employees found.</p>
                              )}
                            </div>

                            {/* Members selected counter */}
                            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f97316", paddingTop: "2px" }}>
                              {tempMemberIds.length} members selected
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Modal Footer */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 20px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                      <button
                        type="button"
                        onClick={() => setShowMemberModal(false)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#334155",
                          fontWeight: 600,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setMemberIds(tempMemberIds);
                          setShowMemberModal(false);
                          if (session?.token && project) {
                            try {
                              await updateProjectMembers(project.id, tempMemberIds, session.token);
                              setMemberMessage("Team updated successfully!");
                              setTimeout(() => setMemberMessage(""), 4000);
                            } catch (err) {
                              console.error("Failed to update members:", err);
                            }
                          }
                        }}
                        style={{
                          padding: "8px 18px",
                          borderRadius: "8px",
                          border: "none",
                          background: "linear-gradient(to right, #f97316, #f59e0b)",
                          color: "#ffffff",
                          fontWeight: 700,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                        }}
                      >
                        Add {tempMemberIds.length} Members
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="workspace-list-card" style={{ marginTop: "16px" }}>
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Email</th>
                      <th>Designation</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {project.members
                      .filter(({ user }) => memberIds.includes(user.id))
                      .map(({ user }) => (
                        <tr key={user.id}>
                          <td>
                            <strong>{user.name}</strong>
                          </td>
                          <td>{user.email}</td>
                          <td>{user.designation?.name || "Member"}</td>
                          <td>
                            <span className="jira-status">{user.status}</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="text-button danger-button"
                              onClick={() => removeMember(user.id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 8. REPORTS TAB */}
          {activeTab === "reports" && (
            <div className="reports-grid">
              <div className="report-card">
                <h3>Work Items by Status</h3>
                <div className="report-metric-list">
                  {Object.entries(statusCounts).map(([status, count]) => {
                    const pct = workItems.length ? Math.round((count / workItems.length) * 100) : 0;
                    return (
                      <div key={status} style={{ display: "grid", gap: "4px" }}>
                        <div className="report-metric-row">
                          <span>{status.replace("_", " ")}</span>
                          <strong>{count} ({pct}%)</strong>
                        </div>
                        <div className="report-bar-bg">
                          <div className="report-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="report-card">
                <h3>Work Items by Type</h3>
                <div className="report-metric-list">
                  {Object.entries(typeCounts).map(([type, count]) => {
                    const pct = workItems.length ? Math.round((count / workItems.length) * 100) : 0;
                    return (
                      <div key={type} style={{ display: "grid", gap: "4px" }}>
                        <div className="report-metric-row">
                          <span>{type}</span>
                          <strong>{count} ({pct}%)</strong>
                        </div>
                        <div className="report-bar-bg">
                          <div className="report-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="report-card">
                <h3>Project Metadata & Reporter</h3>
                <div className="report-metric-list">
                  <div className="report-metric-row">
                    <span>Project Key</span>
                    <strong>{projectKey}</strong>
                  </div>
                  <div className="report-metric-row">
                    <span>Created / Reporter</span>
                    <strong>{project.createdBy.name}</strong>
                  </div>
                  <div className="report-metric-row">
                    <span>Reporter Email</span>
                    <strong>{project.createdBy.email}</strong>
                  </div>
                  <div className="report-metric-row">
                    <span>Start Date</span>
                    <strong>{formatDate(project.startDate)}</strong>
                  </div>
                  <div className="report-metric-row">
                    <span>End Date</span>
                    <strong>{formatDate(project.endDate)}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 9. ACTIVITY TAB */}
          {activeTab === "activity" && (
            <section className="project-detail-section">
              <div className="section-heading">
                <h2>Project Activity Feed</h2>
                <span>Recent project events</span>
              </div>
              <div className="workspace-list-card" style={{ padding: "16px" }}>
                <p style={{ fontSize: "0.86rem", color: "var(--ink)", margin: "0 0 12px" }}>
                  • Project <strong>{project.name}</strong> workspace active.
                </p>
                <p style={{ fontSize: "0.86rem", color: "var(--ink)", margin: "0 0 12px" }}>
                  • Created by reporter <strong>{project.createdBy.name}</strong> ({project.createdBy.email}).
                </p>
                <p style={{ fontSize: "0.86rem", color: "var(--ink)", margin: "0 0 12px" }}>
                  • <strong>{project.sprints.length}</strong> sprints currently tracked.
                </p>
                <p style={{ fontSize: "0.86rem", color: "var(--ink)", margin: "0" }}>
                  • <strong>{project.workItems.length}</strong> total work items logged.
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </DashboardShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Sprint Details                                                             */
/* -------------------------------------------------------------------------- */

export function SprintDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const { session, isLoading } = useAuth();
  const commentSectionRef = useRef<HTMLDivElement>(null);

  const [sprint, setSprint] =
    useState<SprintDetails | null>(null);

  const [error, setError] = useState("");

  const [showCreate, setShowCreate] =
    useState(false);

  const [selectedWorkItemId, setSelectedWorkItemId] =
    useState<number | null>(null);

  const [comment, setComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const [workItemForm, setWorkItemForm] =
    useState({
      type: "TASK",
      title: "",
      description: "",
      priority: "MEDIUM",
      assigneeId: "",
      assigneeIds: [] as number[],
      parentId: "",
      storyPoints: "",
      startDate: "",
      dueDate: "",
    });

  const handleOpenComments = (itemId: number) => {
    setSelectedWorkItemId(itemId);
    setTimeout(() => {
      commentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  const refresh = useCallback(async () => {
    if (!session?.token || !params.id) return;

    const { sprint: nextSprint } =
      await getSprint(
        Number(params.id),
        session.token,
      );

    setSprint(nextSprint);
  }, [params.id, session?.token]);

  async function handleSprintStatusUpdate(status: "ACTIVE" | "COMPLETED" | "CANCELLED") {
    if (!session?.token || !sprint) return;
    try {
      await updateSprintStatus(sprint.id, status, session.token);
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update sprint status."));
    }
  }

  async function handleDeleteSprint() {
    if (!session?.token || !sprint) return;
    if (!confirm(`Are you sure you want to delete sprint "${sprint.name}"?`)) return;
    try {
      await deleteSprint(sprint.id, session.token);
      router.push(`/dashboard/projects/${sprint.project.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete sprint."));
    }
  }

  useEffect(() => {
    if (!session?.token || !params.id) return;

    getSprint(
      Number(params.id),
      session.token,
    )
      .then(({ sprint: nextSprint }) => {
        setSprint(nextSprint);
      })
      .catch((requestError) => {
        setError(
          getErrorMessage(
            requestError,
            "Unable to load sprint.",
          ),
        );
      });
  }, [params.id, session?.token]);

  if (isLoading || !session) {
    return (
      <main className="route-loading">
        Loading sprint...
      </main>
    );
  }

  async function createItem(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (
      !session?.token ||
      !sprint ||
      !workItemForm.title.trim()
    ) {
      return;
    }

    try {
      await createWorkItem(
        {
          projectId: sprint.project.id,
          sprintId: sprint.id,
          type: workItemForm.type as WorkItemInput["type"],
          title: workItemForm.title.trim(),
          description: workItemForm.description,
          priority: workItemForm.priority as WorkItemInput["priority"],
          assigneeId: workItemForm.assigneeIds[0] || (workItemForm.assigneeId ? Number(workItemForm.assigneeId) : null),
          assigneeIds: workItemForm.assigneeIds,
          parentId: workItemForm.parentId ? Number(workItemForm.parentId) : null,
          storyPoints: workItemForm.storyPoints || null,
          startDate: workItemForm.startDate || null,
          dueDate: workItemForm.dueDate || null,
        },
        session.token,
      );

      setWorkItemForm({
        type: "TASK",
        title: "",
        description: "",
        priority: "MEDIUM",
        assigneeId: "",
        assigneeIds: [],
        parentId: "",
        storyPoints: "",
        startDate: "",
        dueDate: "",
      });

      setShowCreate(false);

      await refresh();
    } catch (error) {
      console.error(
        "Failed to create work item:",
        error,
      );

      setError(
        getErrorMessage(
          error,
          "Unable to create work item.",
        ),
      );
    }
  }

  function startSubtask(parentId: number) {
    setWorkItemForm({
      type: "SUBTASK",
      title: "",
      description: "",
      priority: "MEDIUM",
      assigneeId: "",
      parentId: String(parentId),
    });

    setShowCreate(true);
    setSelectedWorkItemId(parentId);
  }

  async function changeWorkItem(
    id: number,
    data: {
      status?: string;
      assigneeId?: number | null;
    },
  ) {
    if (!session?.token) return;

    try {
      await updateWorkItem(
        id,
        data,
        session.token,
      );

      await refresh();
    } catch (error) {
      console.error(
        "Failed to update work item:",
        error,
      );

      setError(
        getErrorMessage(
          error,
          "Unable to update work item.",
        ),
      );
    }
  }

  async function submitComment(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (
      !session?.token ||
      !selectedWorkItemId ||
      !comment.trim()
    ) {
      return;
    }

    try {
      setIsSubmittingComment(true);
      await addWorkItemComment(
        selectedWorkItemId,
        comment.trim(),
        session.token,
      );

      setComment("");
      await refresh();
    } catch (error) {
      console.error(
        "Failed to add comment:",
        error,
      );

      setError(
        getErrorMessage(
          error,
          "Unable to add comment.",
        ),
      );
    } finally {
      setIsSubmittingComment(false);
    }
  }

  async function handleDeleteComment(commentId: number) {
    if (!session?.token) return;
    if (!window.confirm("Are you sure you want to delete this comment?")) return;

    try {
      await deleteWorkItemComment(commentId, session.token);
      await refresh();
    } catch (error) {
      console.error("Failed to delete comment:", error);
      setError(getErrorMessage(error, "Unable to delete comment."));
    }
  }

  const selectedItem =
    sprint?.workItems.find(
      (item) =>
        item.id === selectedWorkItemId,
    );

  return (
    <DashboardShell>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {sprint?.project?.id && (
          <button
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs shadow-xs transition-all cursor-pointer"
            onClick={() => router.push(`/dashboard/projects/${sprint.project.id}`)}
          >
            ← Back ({sprint.project.name})
          </button>
        )}
        <button
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs transition-all cursor-pointer"
          onClick={() => router.push("/dashboard/projects")}
        >
          All Projects
        </button>
      </div>

      {error ? (
        <p className="error-message">{error}</p>
      ) : !sprint ? (
        <p className="workspace-list-empty">
          Loading sprint details...
        </p>
      ) : (
        <>
          <div className="welcome">
            <p className="eyebrow">
              SPRINT DETAILS
            </p>

            <h1>{sprint.name}</h1>

            <p>
              {sprint.project.name} ·{" "}
              {sprint.description ||
                "No sprint description."}
            </p>
          </div>

          <div className="project-detail-summary">
            <span>
              <strong>Status</strong>
              <span
                className={`jira-status ${sprint.status === "ACTIVE"
                  ? "status-in_progress"
                  : sprint.status === "COMPLETED"
                    ? "status-done"
                    : sprint.status === "CANCELLED"
                      ? "status-blocked"
                      : "status-todo"
                  }`}
              >
                {sprint.status}
              </span>
            </span>

            <span>
              <strong>Type</strong>
              {sprint.type}
            </span>

            <span>
              <strong>Dates</strong>
              {formatDate(
                sprint.startDate,
              )}{" "}
              -{" "}
              {formatDate(
                sprint.endDate,
              )}
            </span>

            <span>
              <strong>Created by</strong>
              {sprint.createdBy.name}
            </span>
          </div>

          <div className="workspace-submenu">
            {sprint.status === "PLANNED" && (
              <button
                className="sprint-btn sprint-btn-primary"
                onClick={() => handleSprintStatusUpdate("ACTIVE")}
              >
                ▶ Start Sprint
              </button>
            )}

            {sprint.status === "ACTIVE" && (
              <button
                className="sprint-btn sprint-btn-success"
                onClick={() => handleSprintStatusUpdate("COMPLETED")}
              >
                ✓ Complete Sprint
              </button>
            )}

            <button
              className="sprint-btn sprint-btn-success"
              onClick={() => setShowCreate(!showCreate)}
            >
              + Add Work Item
            </button>

            {sprint.status !== "COMPLETED" && sprint.status !== "CANCELLED" && (
              <button
                className="sprint-btn sprint-btn-danger"
                onClick={handleDeleteSprint}
              >
                🗑️ Delete Sprint
              </button>
            )}

            <button
              className="text-button"
              onClick={() =>
                router.push(
                  `/dashboard/projects/${sprint.project.id}`,
                )
              }
            >
              View project
            </button>
          </div>

          {/* SPRINT PERFORMANCE REPORT CARD */}
          {(() => {
            const sprintItems = sprint.workItems || [];
            const durationDays = Math.max(
              1,
              Math.round(
                (new Date(sprint.endDate).getTime() - new Date(sprint.startDate).getTime()) /
                (1000 * 60 * 60 * 24)
              )
            ) || (sprint.type === "WEEKLY" ? 7 : sprint.type === "MONTHLY" ? 30 : 15);

            const totalPlanned = sprintItems.length;
            const completedCount = sprintItems.filter((i) => i.status === "DONE").length;
            const remainingCount = sprintItems.filter((i) => ["TODO", "IN_PROGRESS", "IN_REVIEW"].includes(i.status)).length;
            const blockedCount = sprintItems.filter((i) => i.status === "BLOCKED").length;

            const getItemPoints = (type: string) => (type === "EPIC" ? 5 : type === "STORY" ? 3 : type === "TASK" ? 2 : 1);
            const totalPts = sprintItems.reduce((acc, i) => acc + getItemPoints(i.type), 0);
            const completedPts = sprintItems.filter((i) => i.status === "DONE").reduce((acc, i) => acc + getItemPoints(i.type), 0);
            const remainingPts = totalPts - completedPts;
            const estHoursMin = totalPts * 4;
            const estHoursMax = totalPts * 5;
            const progressPercent = totalPts > 0 ? Math.round((completedPts / totalPts) * 100) : (totalPlanned > 0 ? Math.round((completedCount / totalPlanned) * 100) : 0);

            return (
              <div style={{
                background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "18px 22px",
                margin: "20px 0 24px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--orange)" }}>
                    📊 Sprint Performance Report
                  </h4>
                  <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "#0f172a" }}>
                    Progress: {progressPercent}%
                  </span>
                </div>

                <div style={{ width: "100%", height: "10px", backgroundColor: "#e2e8f0", borderRadius: "5px", overflow: "hidden", marginBottom: "16px" }}>
                  <div style={{ width: `${progressPercent}%`, height: "100%", backgroundColor: progressPercent === 100 ? "#10b981" : "#f97316", transition: "width 0.4s ease" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px" }}>
                  <div style={{ background: "#fff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <small style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Sprint Duration</small>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>{durationDays} Days</div>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <small style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Planned Work</small>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>{totalPlanned} Items ({totalPts} pts)</div>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <small style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Completed Work</small>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#10b981", marginTop: "2px" }}>{completedCount} Items ({completedPts} pts)</div>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <small style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Remaining Work</small>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ea580c", marginTop: "2px" }}>{remainingCount} Items ({remainingPts} pts)</div>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <small style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Blocked Work</small>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ef4444", marginTop: "2px" }}>{blockedCount} Items</div>
                  </div>
                  <div style={{ background: "#fff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <small style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, display: "block" }}>Estimated Hours</small>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#3b82f6", marginTop: "2px" }}>{estHoursMin}–{estHoursMax} hrs</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Enhanced Create Work Item Form Sync */}
          {showCreate && (
            <form
              className="enhanced-sprint-form"
              onSubmit={createItem}
              style={{ borderLeft: "4px solid #10b981", marginBottom: "24px" }}
            >
              <h3 style={{ gridColumn: "1 / -1", margin: "0 0 8px", fontSize: "1.1rem", color: "#059669" }}>
                ✨ Create Work Item in {sprint.name}
              </h3>
              <label>
                Issue Type
                <select
                  value={workItemForm.type}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, type: e.target.value })}
                >
                  <option value="STORY">Story</option>
                  <option value="TASK">Task</option>
                  <option value="FEATURE">Feature</option>
                  <option value="BUG">Bug</option>
                  <option value="SUBTASK">Sub-task</option>
                  <option value="EPIC">Epic</option>
                </select>
              </label>
              <label style={{ gridColumn: "span 2" }}>
                Title *
                <input
                  type="text"
                  placeholder="Short summary of work item..."
                  value={workItemForm.title}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, title: e.target.value })}
                  required
                />
              </label>
              <label>
                Priority
                <select
                  value={workItemForm.priority}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, priority: e.target.value })}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </label>
              <MultiAssigneeSelector
                members={sprint.members}
                selectedIds={workItemForm.assigneeIds}
                onChange={(ids) => setWorkItemForm({ ...workItemForm, assigneeIds: ids, assigneeId: ids[0] ? String(ids[0]) : "" })}
                label="Assignees (Multiple Select)"
              />
              <label style={{ border: workItemForm.type === "SUBTASK" && !workItemForm.parentId ? "2px solid #ef4444" : "1px solid var(--line)", padding: "4px", borderRadius: "8px" }}>
                Parent Work Item {workItemForm.type === "SUBTASK" ? "* (Required for Sub-task)" : "(Optional)"}
                <select
                  value={workItemForm.parentId}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, parentId: e.target.value })}
                  required={workItemForm.type === "SUBTASK"}
                >
                  <option value="">{workItemForm.type === "SUBTASK" ? "-- Select Parent Item --" : "None (Top Level)"}</option>
                  {sprint.workItems
                    .filter((item) => item.type !== "SUBTASK")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        [{item.type}] {item.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Effort / Story Points
                <select
                  value={workItemForm.storyPoints}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, storyPoints: e.target.value })}
                >
                  <option value="">None / Unestimated</option>
                  <option value="4-5 hrs">4-5 hrs</option>
                  <option value="8-10 hrs">8-10 hrs</option>
                  <option value="12-15 hrs">12-15 hrs</option>
                  <option value="20-25 hrs">20-25 hrs</option>
                  <option value="32-40 hrs">32-40 hrs</option>
                  <option value="52-65 hrs">52-65 hrs</option>
                </select>
              </label>
              <label>
                Start Date (Optional)
                <input
                  type="date"
                  value={workItemForm.startDate}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, startDate: e.target.value })}
                />
              </label>
              <label>
                Due Date (Optional)
                <input
                  type="date"
                  value={workItemForm.dueDate}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, dueDate: e.target.value })}
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Description
                <textarea
                  placeholder="Detailed description of work item..."
                  value={workItemForm.description}
                  onChange={(e) => setWorkItemForm({ ...workItemForm, description: e.target.value })}
                />
              </label>
              <div className="enhanced-sprint-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: "auto", margin: 0 }}
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sprint-btn sprint-btn-success">
                  Create Work Item
                </button>
              </div>
            </form>
          )}

          {/* Work Items */}
          <section className="project-detail-section">
            <div className="section-heading">
              <h2>Work items</h2>

              <span>
                {sprint.workItems.length} items
              </span>
            </div>

            {sprint.workItems.length ? (
              <div className="workspace-list-card">
                <div className="workspace-table-scroll">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Assignee</th>
                        <th>Reporter</th>
                        <th>Subtasks</th>
                        <th>Comments</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sprint.workItems.map(
                        (item) => (
                          <tr key={item.id} style={{ backgroundColor: selectedWorkItemId === item.id ? "#fff7ed" : "transparent" }}>
                            <td>
                              <button
                                className="table-link"
                                onClick={() => handleOpenComments(item.id)}
                              >
                                <strong>
                                  {item.title}
                                </strong>
                              </button>

                              {item.parent && (
                                <small className="table-subtext">
                                  Parent:{" "}
                                  {
                                    item.parent
                                      .title
                                  }
                                </small>
                              )}
                            </td>

                            <td>{item.type}</td>

                            <td>
                              <select
                                className="table-select"
                                value={
                                  item.status
                                }
                                onChange={(
                                  event,
                                ) =>
                                  changeWorkItem(
                                    item.id,
                                    {
                                      status:
                                        event
                                          .target
                                          .value,
                                    },
                                  )
                                }
                              >
                                <option value="TODO">
                                  TODO
                                </option>

                                <option value="IN_PROGRESS">
                                  IN_PROGRESS
                                </option>

                                <option value="IN_REVIEW">
                                  IN_REVIEW
                                </option>

                                <option value="DONE">
                                  DONE
                                </option>

                                <option value="BLOCKED">
                                  BLOCKED
                                </option>
                              </select>
                            </td>

                            <td>
                              {item.priority}
                            </td>

                            <td>
                              <select
                                className="table-select"
                                value={
                                  item.assignee
                                    ?.id || ""
                                }
                                onChange={(
                                  event,
                                ) =>
                                  changeWorkItem(
                                    item.id,
                                    {
                                      assigneeId:
                                        event
                                          .target
                                          .value
                                          ? Number(
                                            event
                                              .target
                                              .value,
                                          )
                                          : null,
                                    },
                                  )
                                }
                              >
                                <option value="">
                                  Unassigned
                                </option>

                                {sprint.members.map(
                                  (member) => (
                                    <option
                                      key={
                                        member.id
                                      }
                                      value={
                                        member.id
                                      }
                                    >
                                      {
                                        member.name
                                      }
                                    </option>
                                  ),
                                )}
                              </select>
                            </td>

                            <td>
                              {item.reporter
                                ?.name ||
                                "Not assigned"}
                            </td>

                            <td>
                              {
                                item._count
                                  .children
                              }
                            </td>

                            <td>
                              <button
                                type="button"
                                className="sprint-btn sprint-btn-secondary"
                                style={{
                                  fontSize: "0.78rem",
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  border: "1px solid var(--line, #cbd5e1)",
                                  backgroundColor: selectedWorkItemId === item.id ? "#ea580c" : "var(--bg, #f8fafc)",
                                  color: selectedWorkItemId === item.id ? "#ffffff" : "inherit",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  transition: "all 0.2s ease"
                                }}
                                onClick={() => handleOpenComments(item.id)}
                                title="Click to open comments"
                              >
                                {item._count.comments} {item._count.comments === 1 ? "Comment" : "Comments"}
                              </button>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="workspace-list-empty">
                No work items are assigned to
                this sprint yet.
              </p>
            )}
          </section>

          {/* Work Item Focus / Comments Panel */}
          {selectedWorkItemId &&
            selectedItem && (
              <section
                ref={commentSectionRef}
                className="work-item-focus"
                style={{
                  scrollMarginTop: "90px",
                  border: "2px solid var(--orange, #f97316)",
                  borderRadius: "12px",
                  boxShadow: "0 4px 12px rgba(249, 115, 22, 0.12)",
                  marginTop: "24px"
                }}
              >
                <div className="section-heading" style={{ borderBottom: "1px solid var(--line, #e2e8f0)", paddingBottom: "12px" }}>
                  <div>
                    <span className="type-badge type-badge-story" style={{ marginBottom: "6px", display: "inline-block" }}>
                      {selectedItem.type} #{selectedItem.id}
                    </span>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
                      {selectedItem.title}
                    </h2>
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    style={{ padding: "4px 12px", fontSize: "0.8rem" }}
                    onClick={() =>
                      setSelectedWorkItemId(
                        null,
                      )
                    }
                  >
                    Close ✕
                  </button>
                </div>

                <div className="work-item-focus-meta" style={{ padding: "12px 0", borderBottom: "1px solid var(--line, #e2e8f0)", marginBottom: "16px" }}>
                  <span>
                    <strong>Type</strong>
                    {selectedItem.type}
                  </span>

                  <span>
                    <strong>
                      Primary assignee
                    </strong>
                    {selectedItem.assignee
                      ?.name ||
                      "Unassigned"}
                  </span>

                  <span>
                    <strong>Subtasks</strong>
                    {
                      selectedItem._count
                        .children
                    }
                  </span>

                  <span>
                    <strong>Total Comments</strong>
                    {
                      selectedItem.comments?.length || 0
                    }
                  </span>
                </div>

                <div className="comment-panel">
                  <div className="section-heading" style={{ marginBottom: "16px" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                      Activity & Comments ({selectedItem.comments?.length || 0})
                    </h3>
                  </div>

                  <div className="comment-list" style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                    {selectedItem.comments
                      ?.length ? (
                      selectedItem.comments.map(
                        (item) => item.deletedAt ? (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              gap: "10px",
                              alignItems: "center",
                              padding: "10px 14px",
                              borderRadius: "10px",
                              backgroundColor: "#fef2f2",
                              border: "1px dashed #fca5a5",
                              color: "#991b1b",
                              fontSize: "0.85rem",
                            }}
                          >
                            <span style={{ fontSize: "1rem" }}>🚫</span>
                            <div>
                              <strong>Comment deleted</strong> by{" "}
                              <span style={{ fontWeight: 700, textDecoration: "underline" }}>
                                {item.deletedBy?.name || "User"}
                              </span>{" "}
                              on {new Date(item.deletedAt).toLocaleString()}
                            </div>
                          </div>
                        ) : (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              gap: "12px",
                              alignItems: "flex-start",
                              padding: "12px 14px",
                              borderRadius: "10px",
                              backgroundColor: "var(--bg, #f8fafc)",
                              border: "1px solid var(--line, #e2e8f0)",
                            }}
                          >
                            <div
                              style={{
                                width: "34px",
                                height: "34px",
                                borderRadius: "50%",
                                backgroundColor: "var(--orange, #f97316)",
                                color: "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                flexShrink: 0,
                              }}
                            >
                              {item.user?.name ? item.user.name.slice(0, 2).toUpperCase() : "U"}
                            </div>

                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <strong style={{ fontSize: "0.88rem", color: "inherit" }}>
                                    {item.user?.name || "Anonymous User"}
                                  </strong>
                                  <span style={{ fontSize: "0.75rem", color: "var(--muted, #64748b)" }}>
                                    {new Date(item.createdAt).toLocaleString()}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(item.id)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#ef4444",
                                    fontSize: "0.78rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                  title="Delete comment"
                                >
                                  🗑️ Delete
                                </button>
                              </div>

                              <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.45, color: "inherit", whiteSpace: "pre-wrap" }}>
                                {item.content}
                              </p>
                            </div>
                          </div>
                        ),
                      )
                    ) : (
                      <p className="workspace-list-empty" style={{ padding: "20px 0", textAlign: "center" }}>
                        No comments yet. Be the first to share an update!
                      </p>
                    )}
                  </div>

                  <form
                    className="comment-form"
                    onSubmit={submitComment}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      background: "#ffffff",
                      padding: "14px",
                      borderRadius: "10px",
                      border: "1px solid var(--line, #cbd5e1)",
                    }}
                  >
                    <textarea
                      value={comment}
                      onChange={(event) =>
                        setComment(
                          event.target.value,
                        )
                      }
                      placeholder="Write a comment or status update..."
                      required
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid var(--line, #cbd5e1)",
                        fontSize: "0.88rem",
                        resize: "vertical",
                        outline: "none",
                      }}
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="submit"
                        disabled={isSubmittingComment || !comment.trim()}
                        className="sprint-btn sprint-btn-primary"
                        style={{
                          padding: "8px 18px",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          cursor: isSubmittingComment ? "not-allowed" : "pointer",
                          opacity: isSubmittingComment || !comment.trim() ? 0.6 : 1,
                        }}
                      >
                        {isSubmittingComment ? "Posting..." : "Post Comment"}
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            )}
        </>
      )}
    </DashboardShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Jira Combined Workspace                                                   */
/* -------------------------------------------------------------------------- */

export function JiraProjectWorkspace() {
  const router = useRouter();
  const { session, isLoading } = useAuth();

  const [activeTab, setActiveTab] =
    useState<
      "backlog" | "board" | "sprints"
    >("backlog");

  const [searchQuery, setSearchQuery] =
    useState("");

  const [selectedProjectId, setSelectedProjectId] =
    useState<string>("ALL");

  const [showCreateModal, setShowCreateModal] =
    useState(false);

  const [showCreateSprintModal, setShowCreateSprintModal] =
    useState(false);

  const [projectsList, setProjectsList] =
    useState<
      Array<{
        id: number;
        name: string;
      }>
    >([]);

  const [sprints, setSprints] =
    useState<SprintItem[]>([]);

  const [targetSprintId, setTargetSprintId] =
    useState<number | null>(null);

  /*
   * Keep the original Jira demo items so the
   * backlog remains populated when the backend
   * does not expose work-item listing yet.
   */
  const [workItems, setWorkItems] =
    useState<JiraWorkItem[]>([
      {
        id: 101,
        key: "HRMS-1",
        title:
          "User Login & Registration API Validation",
        type: "TASK",
        status: "TODO",
        priority: "HIGH",
        sprintId: 1,
        parentTitle:
          "Authentication System",
        assigneeName:
          "Rahul Sharma",
        dueDate: "Sep 12",
      },

      {
        id: 102,
        key: "HRMS-2",
        title:
          "Design System Tokens & Tabular Views",
        type: "STORY",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        sprintId: 1,
        parentTitle:
          "Workspace UI Modernization",
        assigneeName:
          "Priya Patel",
        dueDate: "Sep 17",
      },

      {
        id: 103,
        key: "HRMS-3",
        title:
          "Fix Login Button Margin & Padding Overflow",
        type: "BUG",
        status: "DONE",
        priority: "CRITICAL",
        sprintId: 1,
        assigneeName:
          "Amit Kumar",
        dueDate: "Sep 10",
      },
    ]);

  const [form, setForm] =
    useState<{
      title: string;
      type: WorkItemType;
      priority: WorkItemPriority;
    }>({
      title: "",
      type: "TASK",
      priority: "MEDIUM",
    });

  const [sprintForm, setSprintForm] =
    useState({
      name: "",
      projectId: "",
      type: "WEEKLY",
    });

  const fetchWorkspaceData =
    useCallback(async () => {
      if (!session?.token) return;

      try {
        const [
          projRes,
          sprintRes,
        ] = await Promise.all([
          getWorkspaceList(
            "projects",
            session.token,
          ),

          getWorkspaceList(
            "sprints",
            session.token,
          ),
        ]);

        const formattedProjects =
          (projRes.items || []).map(
            (project) => ({
              id: Number(project.id),
              name: String(
                project.name,
              ),
            }),
          );

        setProjectsList(
          formattedProjects,
        );

        const formattedSprints =
          (sprintRes.items || []).map(
            (sprint) => ({
              id: Number(sprint.id),

              name: String(
                sprint.name,
              ),

              startDate:
                sprint.startDate
                  ? new Date(
                    String(
                      sprint.startDate,
                    ),
                  ).toLocaleDateString()
                  : "N/A",

              endDate:
                sprint.endDate
                  ? new Date(
                    String(
                      sprint.endDate,
                    ),
                  ).toLocaleDateString()
                  : "N/A",

              status:
                (sprint.status as SprintStatus) ||
                "PLANNED",

              project:
                String(
                  sprint.project || "",
                ),

              projectId:
                sprint.projectId
                  ? Number(
                    sprint.projectId,
                  )
                  : undefined,
            }),
          );

        if (formattedSprints.length > 0) {
          setSprints(
            formattedSprints,
          );
        } else {
          /*
           * Preserve original Jira UI fallback.
           * These are only visual fallback items
           * and are not backend records.
           */
          setSprints([
            {
              id: 1,
              name: "Sprint 1",
              startDate: "7 Sep",
              endDate: "21 Sep",
              status: "ACTIVE",
            },

            {
              id: 2,
              name: "Sprint 2",
              startDate: "22 Sep",
              endDate: "5 Oct",
              status: "PLANNED",
            },
          ]);
        }
      } catch (error) {
        console.error(
          "Failed to load workspace backlog data:",
          error,
        );
      }
    }, [session?.token]);

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
      return;
    }

    if (session?.token) {
      fetchWorkspaceData();
    }
  }, [
    isLoading,
    router,
    session,
    fetchWorkspaceData,
  ]);

  if (isLoading || !session) {
    return (
      <main className="route-loading">
        Loading Jira Workspace...
      </main>
    );
  }

  function handleCreateWorkItem(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (!form.title.trim()) return;

    const targetSprint =
      targetSprintId !== null
        ? sprints.find(
          (sprint) =>
            sprint.id ===
            targetSprintId,
        )
        : sprints[0];

    const newItem: JiraWorkItem = {
      id: Date.now(),

      key: `HRMS-${workItems.length + 1
        }`,

      title:
        form.title.trim(),

      type: form.type,

      status: "TODO",

      priority:
        form.priority,

      sprintId:
        targetSprint?.id || null,

      assigneeName:
        session?.user?.name || "Unassigned",
    };

    setWorkItems((current) => [
      newItem,
      ...current,
    ]);

    setForm({
      title: "",
      type: "TASK",
      priority: "MEDIUM",
    });

    setShowCreateModal(false);
    setTargetSprintId(null);
  }

  async function handleCreateSprint(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (
      !sprintForm.name.trim() ||
      !sprintForm.projectId ||
      !session?.token
    ) {
      return;
    }

    try {
      await createWorkspaceItem(
        "sprints",
        {
          name:
            sprintForm.name.trim(),

          projectId:
            sprintForm.projectId,

          type:
            sprintForm.type,
        },
        session.token,
      );

      setShowCreateSprintModal(
        false,
      );

      setSprintForm({
        name: "",
        projectId: "",
        type: "WEEKLY",
      });

      await fetchWorkspaceData();
    } catch (error) {
      console.error(
        "Failed to create sprint:",
        error,
      );

      alert(
        getErrorMessage(
          error,
          "Unable to create sprint.",
        ),
      );
    }
  }

  async function handleToggleSprintStatus(
    sprintId: number,
    currentStatus: string,
  ) {
    if (!session?.token) return;

    /*
     * Do not allow completed/cancelled sprints
     * to silently become active.
     */
    const nextStatus =
      currentStatus === "ACTIVE"
        ? "COMPLETED"
        : "ACTIVE";

    try {
      await updateSprintStatus(
        sprintId,
        nextStatus,
        session.token,
      );

      await fetchWorkspaceData();
    } catch (error) {
      console.error(
        "Failed to update sprint status:",
        error,
      );

      setSprints((current) =>
        current.map((sprint) =>
          sprint.id === sprintId
            ? {
              ...sprint,
              status:
                nextStatus as SprintStatus,
            }
            : sprint,
        ),
      );
    }
  }

  function handleStatusChange(
    itemId: number,
    newStatus: WorkItemStatus,
  ) {
    setWorkItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
            ...item,
            status: newStatus,
          }
          : item,
      ),
    );
  }

  const filteredItems =
    workItems.filter((item) => {
      const matchesSearch =
        item.title
          .toLowerCase()
          .includes(
            searchQuery.toLowerCase(),
          ) ||
        item.key
          .toLowerCase()
          .includes(
            searchQuery.toLowerCase(),
          );

      const matchesProject =
        selectedProjectId === "ALL";

      return (
        matchesSearch &&
        matchesProject
      );
    });

  return (
    <DashboardShell>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
          <span>
            Projects & Sprints
          </span>

          <span>/</span>

          <span className="text-slate-900 font-bold">
            Jira Backlog Workspace
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              HRMS Workspace Backlog
            </h1>

            {projectsList.length > 0 && (
              <select
                value={
                  selectedProjectId
                }
                onChange={(event) =>
                  setSelectedProjectId(
                    event.target.value,
                  )
                }
                className="h-8 px-3 rounded-lg border border-slate-300 text-xs font-bold bg-white text-slate-800"
              >
                <option value="ALL">
                  All Projects
                </option>

                {projectsList.map(
                  (project) => (
                    <option
                      key={project.id}
                      value={project.id}
                    >
                      {project.name}
                    </option>
                  ),
                )}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTargetSprintId(
                  null,
                );

                setShowCreateModal(
                  true,
                );
              }}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all"
            >
              + Create Issue
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6 flex items-center gap-6 text-xs font-bold">
        <button
          type="button"
          onClick={() =>
            setActiveTab("backlog")
          }
          className={`pb-3 transition-colors border-b-2 cursor-pointer ${activeTab === "backlog"
            ? "border-orange-500 text-orange-600"
            : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
        >
          Backlog ({sprints.length}{" "}
          Sprints)
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab("board")
          }
          className={`pb-3 transition-colors border-b-2 cursor-pointer ${activeTab === "board"
            ? "border-orange-500 text-orange-600"
            : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
        >
          Active Board
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab("sprints")
          }
          className={`pb-3 transition-colors border-b-2 cursor-pointer ${activeTab === "sprints"
            ? "border-orange-500 text-orange-600"
            : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
        >
          Sprint List View
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* BACKLOG                                                             */}
      {/* ------------------------------------------------------------------ */}

      {activeTab === "backlog" && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <input
              type="text"
              placeholder="Search backlog issues..."
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(
                  event.target.value,
                )
              }
              className="h-8 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white w-72"
            />

            <span className="text-xs font-semibold text-slate-500">
              {filteredItems.length}{" "}
              issues total
            </span>
          </div>

          {sprints.map((sprint) => {
            const sprintItems =
              filteredItems.filter(
                (item) =>
                  item.sprintId ===
                  sprint.id,
              );

            return (
              <div
                key={sprint.id}
                className="bg-white rounded-xl border border-slate-200 shadow-xs mb-6 overflow-hidden"
              >
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-extrabold text-slate-900">
                      {sprint.name}
                    </span>

                    {sprint.project && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-800 border border-orange-200">
                        {sprint.project}
                      </span>
                    )}

                    <span className="text-xs font-medium text-slate-500">
                      {sprint.startDate}{" "}
                      –{" "}
                      {sprint.endDate}{" "}
                      (
                      {
                        sprintItems.length
                      }{" "}
                      issues)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleToggleSprintStatus(
                        sprint.id,
                        sprint.status,
                      )
                    }
                    className={`px-3 py-1 rounded border text-xs font-bold transition-all ${sprint.status ===
                      "ACTIVE"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white border-slate-300 text-slate-800 hover:bg-slate-50"
                      }`}
                  >
                    {sprint.status ===
                      "ACTIVE"
                      ? "Complete Sprint"
                      : "Start Sprint"}
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {sprintItems.length ===
                    0 ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-400 font-medium">
                      No work items assigned
                      to this sprint yet.
                    </div>
                  ) : (
                    sprintItems.map(
                      (item) => (
                        <div
                          key={item.id}
                          className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-3">
                            <TypeBadge
                              type={
                                item.type
                              }
                            />

                            <span className="text-xs font-bold text-slate-500 uppercase">
                              {item.key}
                            </span>

                            <span className="text-xs font-bold text-slate-900">
                              {item.title}
                            </span>

                            {item.parentTitle && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {
                                  item.parentTitle
                                }
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <select
                              value={
                                item.status
                              }
                              onChange={(
                                event,
                              ) =>
                                handleStatusChange(
                                  item.id,
                                  event
                                    .target
                                    .value as WorkItemStatus,
                                )
                              }
                              className="h-7 px-2 rounded border border-slate-300 text-xs font-medium bg-white"
                            >
                              <option value="TODO">
                                To Do
                              </option>

                              <option value="IN_PROGRESS">
                                In Progress
                              </option>

                              <option value="REVIEW">
                                In Review
                              </option>

                              <option value="DONE">
                                Done
                              </option>

                              <option value="BLOCKED">
                                Blocked
                              </option>
                            </select>

                            <PriorityPill
                              priority={
                                item.priority
                              }
                            />

                            <span className="text-xs font-medium text-slate-500">
                              {
                                item.assigneeName
                              }
                            </span>
                          </div>
                        </div>
                      ),
                    )
                  )}
                </div>

                <div className="p-2 bg-slate-50/60 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetSprintId(
                        sprint.id,
                      );

                      setShowCreateModal(
                        true,
                      );
                    }}
                    className="px-3 py-1 text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                  >
                    + Create issue in{" "}
                    {sprint.name}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* BOARD                                                               */}
      {/* ------------------------------------------------------------------ */}

      {activeTab === "board" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(
            [
              "TODO",
              "IN_PROGRESS",
              "REVIEW",
              "DONE",
            ] as WorkItemStatus[]
          ).map((statusColumn) => {
            const columnItems =
              workItems.filter(
                (item) =>
                  item.status ===
                  statusColumn,
              );

            return (
              <div
                key={statusColumn}
                className="bg-slate-100 p-3 rounded-xl border border-slate-200"
              >
                <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
                  {statusColumn.replaceAll(
                    "_",
                    " ",
                  )}{" "}
                  ({columnItems.length})
                </h3>

                <div className="space-y-3">
                  {columnItems.map(
                    (item) => (
                      <div
                        key={item.id}
                        className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <TypeBadge
                            type={
                              item.type
                            }
                          />

                          <span className="text-[10px] font-bold text-slate-400">
                            {item.key}
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 mb-2">
                          {item.title}
                        </h4>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <PriorityPill
                            priority={
                              item.priority
                            }
                          />

                          <span className="text-[10px] font-semibold text-slate-500">
                            {
                              item.assigneeName
                            }
                          </span>
                        </div>

                        <select
                          value={
                            item.status
                          }
                          onChange={(event) =>
                            handleStatusChange(
                              item.id,
                              event
                                .target
                                .value as WorkItemStatus,
                            )
                          }
                          className="mt-2 w-full h-7 px-2 rounded border border-slate-300 text-xs"
                        >
                          <option value="TODO">
                            To Do
                          </option>

                          <option value="IN_PROGRESS">
                            In Progress
                          </option>

                          <option value="REVIEW">
                            In Review
                          </option>

                          <option value="DONE">
                            Done
                          </option>

                          <option value="BLOCKED">
                            Blocked
                          </option>
                        </select>
                      </div>
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SPRINT LIST                                                         */}
      {/* ------------------------------------------------------------------ */}

      {activeTab === "sprints" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold uppercase text-slate-600 tracking-wider">
                <th className="px-4 py-3">
                  Sprint Name
                </th>

                <th className="px-4 py-3">
                  Project
                </th>

                <th className="px-4 py-3">
                  Status
                </th>

                <th className="px-4 py-3">
                  Start Date
                </th>

                <th className="px-4 py-3">
                  End Date
                </th>

                <th className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs font-medium">
              {sprints.map(
                (sprint) => (
                  <tr
                    key={sprint.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {sprint.name}
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-700">
                      {sprint.project ||
                        "Unassigned"}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${sprint.status ===
                          "ACTIVE"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                      >
                        {
                          sprint.status
                        }
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {
                        sprint.startDate
                      }
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {sprint.endDate}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/dashboard/sprints/${sprint.id}`,
                            )
                          }
                          className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 font-bold text-xs"
                        >
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleToggleSprintStatus(
                              sprint.id,
                              sprint.status,
                            )
                          }
                          className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 font-bold text-xs"
                        >
                          {sprint.status ===
                            "ACTIVE"
                            ? "Complete"
                            : "Start"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CREATE SPRINT MODAL                                                 */}
      {/* ------------------------------------------------------------------ */}

      {showCreateSprintModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900">
                Create New Sprint
              </h3>

              <button
                type="button"
                onClick={() =>
                  setShowCreateSprintModal(
                    false,
                  )
                }
                className="text-slate-400 font-bold"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateSprint}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sprint Name
                </label>

                <input
                  type="text"
                  placeholder="e.g. Sprint 3"
                  value={
                    sprintForm.name
                  }
                  onChange={(event) =>
                    setSprintForm({
                      ...sprintForm,
                      name:
                        event.target
                          .value,
                    })
                  }
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Associated Project
                </label>

                <select
                  value={
                    sprintForm.projectId
                  }
                  onChange={(event) =>
                    setSprintForm({
                      ...sprintForm,
                      projectId:
                        event.target
                          .value,
                    })
                  }
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
                >
                  <option value="">
                    Select Project...
                  </option>

                  {projectsList.map(
                    (project) => (
                      <option
                        key={project.id}
                        value={
                          project.id
                        }
                      >
                        {project.name}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sprint Duration
                </label>

                <select
                  value={
                    sprintForm.type
                  }
                  onChange={(event) =>
                    setSprintForm({
                      ...sprintForm,
                      type:
                        event.target
                          .value,
                    })
                  }
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
                >
                  <option value="WEEKLY">
                    Weekly Sprint (7 Days)
                  </option>

                  <option value="MONTHLY">
                    Monthly Sprint (30 Days)
                  </option>

                  <option value="MANUAL">
                    Manual Schedule
                  </option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() =>
                    setShowCreateSprintModal(
                      false,
                    )
                  }
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-xs"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs"
                >
                  Save Sprint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CREATE ISSUE MODAL                                                  */}
      {/* ------------------------------------------------------------------ */}

      {showCreateModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900">
                Create Work Item Issue
              </h3>

              <button
                type="button"
                onClick={() =>
                  setShowCreateModal(
                    false,
                  )
                }
                className="text-slate-400 font-bold"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={
                handleCreateWorkItem
              }
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Issue Type
                </label>

                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      type:
                        event.target
                          .value as WorkItemType,
                    })
                  }
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
                >
                  <option value="EPIC">
                    EPIC
                  </option>

                  <option value="STORY">
                    STORY
                  </option>

                  <option value="TASK">
                    TASK
                  </option>

                  <option value="FEATURE">
                    FEATURE
                  </option>

                  <option value="BUG">
                    BUG
                  </option>

                  <option value="SUBTASK">
                    SUBTASK
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Summary Title
                </label>

                <input
                  type="text"
                  placeholder="Summary title..."
                  value={
                    form.title
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      title:
                        event.target
                          .value,
                    })
                  }
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Priority
                </label>

                <select
                  value={
                    form.priority
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      priority:
                        event.target
                          .value as WorkItemPriority,
                    })
                  }
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
                >
                  <option value="LOW">
                    LOW
                  </option>

                  <option value="MEDIUM">
                    MEDIUM
                  </option>

                  <option value="HIGH">
                    HIGH
                  </option>

                  <option value="CRITICAL">
                    CRITICAL
                  </option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() =>
                    setShowCreateModal(
                      false,
                    )
                  }
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-xs"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs"
                >
                  Save Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

export function EpicDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { session, isLoading } = useAuth();

  const [epicData, setEpicData] = useState<any>(null);
  const [members, setMembers] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  /* Edit Epic State */
  const [editingEpic, setEditingEpic] = useState<any>(null);

  /* Create Child Work Item under this Epic */
  const [showCreateChild, setShowCreateChild] = useState(false);
  const [childForm, setChildForm] = useState({
    type: "STORY",
    title: "",
    description: "",
    priority: "MEDIUM",
    assigneeId: "",
    assigneeIds: [] as number[],
    sprintId: "",
    storyPoints: "",
    startDate: "",
    dueDate: "",
    parentId: "",
  });

  /* View / Edit Child Work Item Modal state */
  const [editingChildItem, setEditingChildItem] = useState<{
    id: number;
    title: string;
    description: string;
    type: string;
    status: string;
    priority: string;
    assigneeId: string;
    sprintId: string;
    parentId: string;
    storyPoints: string;
    startDate: string;
    dueDate: string;
  } | null>(null);

  const loadEpicDetails = useCallback(async () => {
    if (!session?.token || !params.id) return;
    try {
      setLoading(true);
      const res = await getWorkItem(Number(params.id), session.token);
      setEpicData(res.item);
      setMembers(res.members || []);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load epic details."));
    } finally {
      setLoading(false);
    }
  }, [params.id, session?.token]);

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
      return;
    }
    loadEpicDetails();
  }, [isLoading, loadEpicDetails, router, session]);

  async function handleSaveEpic(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.token || !editingEpic) return;
    try {
      await updateWorkItem(
        editingEpic.id,
        {
          title: editingEpic.title,
          description: editingEpic.description,
          status: editingEpic.status,
          priority: editingEpic.priority,
          assigneeId: editingEpic.assigneeIds && editingEpic.assigneeIds.length > 0 ? editingEpic.assigneeIds[0] : (editingEpic.assigneeId ? Number(editingEpic.assigneeId) : null),
          assigneeIds: editingEpic.assigneeIds || [],
          startDate: editingEpic.startDate || null,
          dueDate: editingEpic.dueDate || null,
        },
        session.token
      );
      setEditingEpic(null);
      await loadEpicDetails();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update epic."));
    }
  }

  async function handleCreateChild(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.token || !epicData) return;

    const parentIdToUse = childForm.type === "SUBTASK"
      ? (childForm.parentId ? Number(childForm.parentId) : null)
      : epicData.id;

    if (childForm.type === "SUBTASK" && !parentIdToUse) {
      setError("Subtask requires selecting a parent work item.");
      return;
    }

    try {
      await createWorkItem(
        {
          projectId: epicData.projectId,
          parentId: parentIdToUse,
          type: childForm.type as WorkItemInput["type"],
          title: childForm.title,
          description: childForm.description,
          priority: childForm.priority as WorkItemInput["priority"],
          assigneeId: childForm.assigneeIds.length > 0 ? childForm.assigneeIds[0] : (childForm.assigneeId ? Number(childForm.assigneeId) : null),
          assigneeIds: childForm.assigneeIds,
          sprintId: childForm.sprintId ? Number(childForm.sprintId) : null,
          storyPoints: childForm.storyPoints || null,
          startDate: childForm.startDate || null,
          dueDate: childForm.dueDate || null,
        },
        session.token
      );
      setShowCreateChild(false);
      setChildForm({
        type: "STORY",
        title: "",
        description: "",
        priority: "MEDIUM",
        assigneeId: "",
        assigneeIds: [],
        sprintId: "",
        storyPoints: "",
        startDate: "",
        dueDate: "",
        parentId: "",
      });
      await loadEpicDetails();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create work item under epic."));
    }
  }

  async function handleDeleteChild(id: number) {
    if (!session?.token) return;
    if (!window.confirm("Are you sure you want to delete this work item?")) return;
    try {
      await deleteWorkItem(id, session.token);
      await loadEpicDetails();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete work item."));
    }
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="workspace-container">
          <p className="workspace-list-empty">Loading Epic Details...</p>
        </div>
      </DashboardShell>
    );
  }

  if (error || !epicData) {
    return (
      <DashboardShell>
        <div className="workspace-container">
          <p className="workspace-list-empty" style={{ color: "#ef4444" }}>{error || "Epic not found."}</p>
          <button
            type="button"
            className="secondary-button"
            style={{ width: "auto", margin: "16px auto 0" }}
            onClick={() => router.push("/dashboard/projects")}
          >
            ← Back to Projects
          </button>
        </div>
      </DashboardShell>
    );
  }

  const epicKey = epicData.project ? `${epicData.project.key}-${epicData.id}` : `EPIC-${epicData.id}`;
  const children = epicData.children || [];

  return (
    <DashboardShell>
      <div className="workspace-container">
        {/* Top Header / Breadcrumb */}
        <div className="workspace-top-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <nav style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "4px" }}>
              Project / {epicData.project?.name || "Workspace"} / Epics / <strong>{epicKey}</strong>
            </nav>
            <h1 className="workspace-title" style={{ margin: 0 }}>
              <span className="type-badge type-badge-epic" style={{ marginRight: "10px" }}>EPIC</span>
              {epicKey}: {epicData.title}
            </h1>
          </div>
          <button
            type="button"
            className="secondary-button"
            style={{ width: "auto" }}
            onClick={() => router.push(`/dashboard/projects/${epicData.projectId}`)}
          >
            ← Back to Project
          </button>
        </div>

        {/* Main Epic Card */}
        <div className="project-detail-section" style={{ border: "2px solid #a855f7", borderRadius: "12px", padding: "20px", marginBottom: "24px", background: "var(--card-bg)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <div>
              <h2 style={{ margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 700 }}>{epicData.title}</h2>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.95rem" }}>
                {epicData.description || "No description provided."}
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="sprint-btn sprint-btn-secondary"
                onClick={() =>
                  setEditingEpic({
                    id: epicData.id,
                    title: epicData.title,
                    description: epicData.description || "",
                    status: epicData.status,
                    priority: epicData.priority,
                    assigneeId: epicData.assignee ? String(epicData.assignee.id) : "",
                    startDate: epicData.startDate ? String(epicData.startDate).split("T")[0] : "",
                    dueDate: epicData.dueDate ? String(epicData.dueDate).split("T")[0] : "",
                  })
                }
              >
                ✏️ Edit Epic
              </button>
              <button
                type="button"
                className="sprint-btn sprint-btn-success"
                onClick={() => setShowCreateChild(true)}
              >
                + Add Work Item
              </button>
            </div>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "16px 0" }} />

          {/* Metadata Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", fontSize: "0.9rem" }}>
            <div>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase" }}>Assignee</span>
              <strong>{renderAssignees(epicData)}</strong>
            </div>
            <div>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase" }}>Priority</span>
              <span className="priority-pill">{epicData.priority}</span>
            </div>
            <div>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase" }}>Status</span>
              <span className="jira-status">{epicData.status}</span>
            </div>
            <div>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase" }}>Start Date</span>
              <strong>{epicData.startDate ? formatDate(epicData.startDate) : "Not Set"}</strong>
            </div>
            <div>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase" }}>Due Date</span>
              <strong>{epicData.dueDate ? formatDate(epicData.dueDate) : "Not Set"}</strong>
            </div>
          </div>
        </div>

        {/* Edit Epic Modal Form */}
        {editingEpic && (
          <form className="enhanced-sprint-form" onSubmit={handleSaveEpic} style={{ border: "2px solid #a855f7", marginBottom: "24px" }}>
            <h3 style={{ gridColumn: "1 / -1", margin: 0 }}>Edit Epic #{editingEpic.id}</h3>
            <label style={{ gridColumn: "span 2" }}>
              Epic Title *
              <input
                type="text"
                value={editingEpic.title}
                onChange={(e) => setEditingEpic({ ...editingEpic, title: e.target.value })}
                required
              />
            </label>
            <label>
              Status
              <select
                value={editingEpic.status}
                onChange={(e) => setEditingEpic({ ...editingEpic, status: e.target.value })}
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </label>
            <label>
              Priority
              <select
                value={editingEpic.priority}
                onChange={(e) => setEditingEpic({ ...editingEpic, priority: e.target.value })}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
            <MultiAssigneeSelector
              members={members}
              selectedIds={editingEpic.assigneeIds || []}
              onChange={(ids) => setEditingEpic({ ...editingEpic, assigneeIds: ids, assigneeId: ids[0] ? String(ids[0]) : "" })}
              label="Assignees (Multiple Select)"
            />
            <label>
              Start Date
              <input
                type="date"
                value={editingEpic.startDate}
                onChange={(e) => setEditingEpic({ ...editingEpic, startDate: e.target.value })}
              />
            </label>
            <label>
              Due Date
              <input
                type="date"
                value={editingEpic.dueDate}
                onChange={(e) => setEditingEpic({ ...editingEpic, dueDate: e.target.value })}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Description
              <textarea
                value={editingEpic.description}
                onChange={(e) => setEditingEpic({ ...editingEpic, description: e.target.value })}
              />
            </label>
            <div className="enhanced-sprint-form-actions" style={{ gridColumn: "1 / -1" }}>
              <button type="button" className="secondary-button" style={{ width: "auto", margin: 0 }} onClick={() => setEditingEpic(null)}>Cancel</button>
              <button type="submit" className="sprint-btn sprint-btn-primary">Save Epic</button>
            </div>
          </form>
        )}

        {/* Create Child Work Item Form */}
        {showCreateChild && (
          <form className="enhanced-sprint-form" onSubmit={handleCreateChild} style={{ border: "2px solid #3b82f6", marginBottom: "24px" }}>
            <h3 style={{ gridColumn: "1 / -1", margin: 0 }}>+ Add Work Item to Epic</h3>
            <label>
              Issue Type *
              <select
                value={childForm.type}
                onChange={(e) => {
                  const newType = e.target.value;
                  setChildForm((prev) => ({
                    ...prev,
                    type: newType,
                    parentId: newType === "SUBTASK" ? prev.parentId : "",
                  }));
                }}
              >
                <option value="STORY">Story</option>
                <option value="TASK">Task</option>
                <option value="FEATURE">Feature</option>
                <option value="BUG">Bug</option>
                <option value="SUBTASK">Subtask</option>
              </select>
            </label>
            <label style={{ gridColumn: "span 2" }}>
              Title *
              <input
                type="text"
                value={childForm.title}
                onChange={(e) => setChildForm({ ...childForm, title: e.target.value })}
                required
              />
            </label>
            {childForm.type === "SUBTASK" && (
              <label style={{ gridColumn: "1 / -1" }}>
                Parent Work Item *
                <select
                  value={childForm.parentId}
                  onChange={(e) => setChildForm({ ...childForm, parentId: e.target.value })}
                  required
                >
                  <option value="">-- Select Parent Work Item --</option>
                  {children
                    .filter((item: any) => item.type !== "SUBTASK")
                    .map((item: any) => (
                      <option key={item.id} value={item.id}>
                        [{item.type}] {item.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Priority
              <select
                value={childForm.priority}
                onChange={(e) => setChildForm({ ...childForm, priority: e.target.value })}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
            <MultiAssigneeSelector
              members={members}
              selectedIds={childForm.assigneeIds}
              onChange={(ids) => setChildForm({ ...childForm, assigneeIds: ids, assigneeId: ids[0] ? String(ids[0]) : "" })}
              label="Assignees (Multiple Select)"
            />
            <label>
              Story Points / Effort
              <select
                value={childForm.storyPoints}
                onChange={(e) => setChildForm({ ...childForm, storyPoints: e.target.value })}
              >
                <option value="">None / Unestimated</option>
                <option value="4-5 hrs">4-5 hrs</option>
                <option value="8-10 hrs">8-10 hrs</option>
                <option value="12-15 hrs">12-15 hrs</option>
                <option value="20-25 hrs">20-25 hrs</option>
                <option value="32-40 hrs">32-40 hrs</option>
                <option value="52-65 hrs">52-65 hrs</option>
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Description
              <textarea
                value={childForm.description}
                onChange={(e) => setChildForm({ ...childForm, description: e.target.value })}
              />
            </label>
            <div className="enhanced-sprint-form-actions" style={{ gridColumn: "1 / -1" }}>
              <button type="button" className="secondary-button" style={{ width: "auto", margin: 0 }} onClick={() => setShowCreateChild(false)}>Cancel</button>
              <button type="submit" className="sprint-btn sprint-btn-success">Create Item</button>
            </div>
          </form>
        )}

        {/* Child Work Items Table */}
        <section className="project-detail-section">
          <div className="section-heading">
            <h2>Work Items ({children.length})</h2>
          </div>

          {children.length ? (
            <div className="workspace-list-card">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Key / ID</th>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assignee</th>
                    <th>Sprint</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((item: any) => {
                    const itemKey = epicData.project ? `${epicData.project.key}-${item.id}` : `ITEM-${item.id}`;
                    return (
                      <tr key={item.id}>
                        <td><strong>{itemKey}</strong></td>
                        <td><strong>{item.title}</strong></td>
                        <td><span className="type-badge type-badge-story">{item.type}</span></td>
                        <td><span className="jira-status">{item.status}</span></td>
                        <td><span className="priority-pill">{item.priority}</span></td>
                        <td>{renderAssignees(item)}</td>
                        <td>{item.sprint?.name || "Backlog"}</td>
                        <td style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button
                            type="button"
                            className="sprint-btn sprint-btn-secondary"
                            style={{ fontSize: "0.76rem", padding: "4px 8px" }}
                            title="View/Edit Work Item"
                            onClick={() =>
                              setEditingChildItem({
                                id: item.id,
                                title: item.title,
                                description: item.description || "",
                                type: item.type,
                                status: item.status,
                                priority: item.priority,
                                assigneeId: item.assignee ? String(item.assignee.id) : "",
                                sprintId: item.sprint ? String(item.sprint.id) : "",
                                parentId: item.parentId ? String(item.parentId) : "",
                                storyPoints: item.storyPoints || "",
                                startDate: item.startDate ? String(item.startDate).split("T")[0] : "",
                                dueDate: item.dueDate ? String(item.dueDate).split("T")[0] : "",
                              })
                            }
                          >
                            👁️ View
                          </button>
                          <button
                            type="button"
                            className="sprint-btn"
                            style={{ fontSize: "0.76rem", padding: "4px 8px", backgroundColor: "#252321ff", color: "#fff" }}
                            onClick={() => handleDeleteChild(item.id)}
                          >
                            🗑️ Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="workspace-list-empty">No work items assigned to this Epic yet. Click '+ Add Work Item' to add one.</p>
          )}
        </section>

        {/* View / Edit Child Work Item Modal Overlay */}
        {editingChildItem && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(4px)",
              zIndex: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
            onClick={() => setEditingChildItem(null)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                maxWidth: "600px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                border: "1px solid var(--line)",
                padding: "24px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>View / Edit Work Item #{editingChildItem.id}</h3>
                <button type="button" className="text-button" onClick={() => setEditingChildItem(null)}>✕</button>
              </div>

              <form
                className="enhanced-sprint-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!session?.token || !editingChildItem) return;
                  try {
                    await updateWorkItem(
                      editingChildItem.id,
                      {
                        title: editingChildItem.title,
                        description: editingChildItem.description,
                        type: editingChildItem.type as WorkItemInput["type"],
                        status: editingChildItem.status,
                        priority: editingChildItem.priority as WorkItemInput["priority"],
                        assigneeId: editingChildItem.assigneeId ? Number(editingChildItem.assigneeId) : null,
                        sprintId: editingChildItem.sprintId ? Number(editingChildItem.sprintId) : null,
                        parentId: editingChildItem.parentId ? Number(editingChildItem.parentId) : null,
                        storyPoints: editingChildItem.storyPoints || null,
                        startDate: editingChildItem.startDate || null,
                        dueDate: editingChildItem.dueDate || null,
                      },
                      session.token
                    );
                    setEditingChildItem(null);
                    await loadEpicDetails();
                  } catch (err) {
                    setError(getErrorMessage(err, "Failed to update work item."));
                  }
                }}
              >
                <label style={{ gridColumn: "span 2" }}>
                  Title *
                  <input
                    type="text"
                    value={editingChildItem.title}
                    onChange={(e) => setEditingChildItem({ ...editingChildItem, title: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Issue Type
                  <select
                    value={editingChildItem.type}
                    onChange={(e) => setEditingChildItem({ ...editingChildItem, type: e.target.value })}
                  >
                    <option value="STORY">Story</option>
                    <option value="TASK">Task</option>
                    <option value="FEATURE">Feature</option>
                    <option value="BUG">Bug</option>
                    <option value="SUBTASK">Subtask</option>
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={editingChildItem.status}
                    onChange={(e) => setEditingChildItem({ ...editingChildItem, status: e.target.value })}
                  >
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="IN_REVIEW">In Review</option>
                    <option value="DONE">Done</option>
                    <option value="BLOCKED">Blocked</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={editingChildItem.priority}
                    onChange={(e) => setEditingChildItem({ ...editingChildItem, priority: e.target.value })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </label>
                <label>
                  Assignee
                  <select
                    value={editingChildItem.assigneeId}
                    onChange={(e) => setEditingChildItem({ ...editingChildItem, assigneeId: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {members.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Description
                  <textarea
                    value={editingChildItem.description}
                    onChange={(e) => setEditingChildItem({ ...editingChildItem, description: e.target.value })}
                  />
                </label>
                <div className="enhanced-sprint-form-actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="button" className="secondary-button" style={{ width: "auto", margin: 0 }} onClick={() => setEditingChildItem(null)}>Cancel</button>
                  <button type="submit" className="sprint-btn sprint-btn-primary">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

/*
 * Optional compatibility export.
 *
 * If existing route imports:
 *
 *   import { JiraCombinedWorkspace } from "...";
 *
 * it will continue to work.
 */
export const JiraCombinedWorkspace =
  JiraProjectWorkspace;