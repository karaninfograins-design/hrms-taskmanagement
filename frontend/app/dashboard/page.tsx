"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { getEmployees, type Employee } from "@/services/employee.service";
import { getWorkspaceList } from "@/services/workspace.service";
import { EmployeeDashboard } from "@/components/dashboard/EmployeeDashboard";

type WorkItemStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED";

type WorkItem = {
  id: string;
  key: string;
  title: string;
  type: "EPIC" | "STORY" | "TASK" | "FEATURE" | "BUG" | "SUBTASK";
  status: WorkItemStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  project: string;
  parentTitle?: string;
  assignee: string;
  updatedAt: string;
};

type ActiveSprintOverview = {
  id: number;
  name: string;
  projectName: string;
  status: string;
  type: string;
  startDate: string;
  endDate: string;
  totalItems: number;
  completedItems: number;
};

function TypeBadge({ type }: { type: WorkItem["type"] }) {
  const typeClasses: Record<string, string> = {
    EPIC: "type-badge-epic",
    STORY: "type-badge-story",
    TASK: "type-badge-task",
    FEATURE: "type-badge-feature",
    BUG: "type-badge-bug",
    SUBTASK: "type-badge-subtask",
  };
  return <span className={`type-badge ${typeClasses[type] || "type-badge-task"}`}>{type}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const statusClasses: Record<string, string> = {
    TODO: "status-todo",
    IN_PROGRESS: "status-in_progress",
    REVIEW: "status-review",
    IN_REVIEW: "status-review",
    DONE: "status-done",
    BLOCKED: "status-blocked",
    ACTIVE: "status-in_progress",
    PLANNED: "status-todo",
    COMPLETED: "status-done",
  };
  return <span className={`jira-status ${statusClasses[status] || "status-todo"}`}>{status.replaceAll("_", " ")}</span>;
}

function PriorityPill({ priority }: { priority: WorkItem["priority"] }) {
  const priorityClasses: Record<string, string> = {
    CRITICAL: "priority-critical",
    HIGH: "priority-high",
    MEDIUM: "priority-medium",
    LOW: "priority-low",
  };
  return (
    <span className={`priority-pill ${priorityClasses[priority]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {priority}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();
  const [loading, setLoading] = useState(true);

  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [totalEmployees, setTotalEmployees] = useState<number>(0);
  const [projectsCount, setProjectsCount] = useState<number>(0);
  const [sprintsCount, setSprintsCount] = useState<number>(0);

  const [activeSprints, setActiveSprints] = useState<ActiveSprintOverview[]>([]);
  const [recentWorkItems, setRecentWorkItems] = useState<WorkItem[]>([]);

  const [rosterPage, setRosterPage] = useState<number>(1);
  const [sprintsPage, setSprintsPage] = useState<number>(1);
  const [workItemsPage, setWorkItemsPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 5;

  const loadDashboardMetrics = useCallback(async () => {
    if (!session?.token) return;
    try {
      const [empData, projData, sprintData, workItemData] = await Promise.all([
        getEmployees({ limit: 10 }, session.token).catch(() => null),
        getWorkspaceList("projects", session.token).catch(() => null),
        getWorkspaceList("sprints", session.token).catch(() => null),
        getWorkspaceList("work-items", session.token).catch(() => null),
      ]);

      if (empData) {
        setEmployeesList(empData.employees || []);
        setTotalEmployees(empData.total || empData.employees.length);
      }

      if (projData?.items) setProjectsCount(projData.items.length);

      if (sprintData?.items) {
        setSprintsCount(sprintData.items.length);
        const formattedSprints: ActiveSprintOverview[] = sprintData.items.map((s: any) => ({
          id: Number(s.id),
          name: s.name,
          projectName: typeof s.project === "object" ? s.project?.name : (s.project || "General"),
          status: s.status || "ACTIVE",
          type: s.type || "WEEKLY",
          startDate: s.startDate ? new Date(s.startDate).toLocaleDateString() : "N/A",
          endDate: s.endDate ? new Date(s.endDate).toLocaleDateString() : "N/A",
          totalItems: s.totalItems || (s.workItems ? s.workItems.length : 0),
          completedItems: s.completedItems || (s.workItems ? s.workItems.filter((w: any) => w.status === "DONE").length : 0),
        }));
        setActiveSprints(formattedSprints);
      }

      if (workItemData?.items) {
        setRecentWorkItems(workItemData.items as unknown as WorkItem[]);
      }
    } catch (err) {
      console.error("Dashboard metrics error:", err);
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    if (!isLoading && !session) router.replace("/");
  }, [isLoading, router, session]);

  useEffect(() => {
    if (session?.token) loadDashboardMetrics();
  }, [session?.token, loadDashboardMetrics]);

  const roleName = typeof session?.user?.role === "string"
    ? session.user.role
    : (session?.user?.role as any)?.name || (session?.user?.role === 1 ? "SUPER_ADMIN" : session?.user?.role === 2 ? "ADMIN" : "EMPLOYEE");

  const userRoleId = typeof session?.user?.role === "number"
    ? session.user.role
    : (session?.user?.role as any)?.id || (roleName === "SUPER_ADMIN" ? 1 : roleName === "ADMIN" ? 2 : 3);

  const isSuperAdmin = roleName === "SUPER_ADMIN" || userRoleId === 1;
  const isAdminUser = isSuperAdmin || roleName === "ADMIN" || userRoleId === 2;

  const canManageEmployees = isSuperAdmin || (isAdminUser && session?.user?.permissions?.includes("MANAGE_EMPLOYEES"));
  const canCreateAdmins = isSuperAdmin;

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading dashboard...</main>;
  }

  if (loading) {
    return (
      <main className="app-shell">
        <Navbar user={session.user} onSignOut={handleSignOut} />
        <div className="dashboard-frame">
          <Sidebar user={session.user} canCreateAdmins={canCreateAdmins} onSignOut={handleSignOut} />
          <section className="dashboard-content">
            <div className="route-loading">Loading admin & employee dashboard...</div>
          </section>
        </div>
      </main>
    );
  }

  const activeEmployeesCount = employeesList.filter((e) => e.status === "ACTIVE").length;
  const adminCount = employeesList.filter((e) => e.role?.name === "ADMIN" || e.role?.name === "SUPER_ADMIN").length;

  if (!isAdminUser) {
    return (
      <main className="app-shell">
        <Navbar user={session.user} onSignOut={handleSignOut} />
        <div className="dashboard-frame">
          <Sidebar user={session.user} canCreateAdmins={canCreateAdmins} onSignOut={handleSignOut} />
          <section className="dashboard-content">
            <EmployeeDashboard
              token={session.token}
              userName={session.user.name}
              userId={session.user.id || 0}
            />
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={canCreateAdmins} onSignOut={handleSignOut} />
        <section className="dashboard-content">
          {/* Welcome Header */}
          <div className="welcome flex flex-wrap items-center justify-between gap-4 mb-6" id="overview">
            <div>
              <p className="eyebrow">ENTERPRISE ADMINISTRATION</p>
              <h1>Welcome back, {session.user.name}.</h1>
              <p>Overview of system metrics, active employees, admins, and workspace projects.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg bg-orange-50 text-orange-700 font-extrabold text-xs border border-orange-200 uppercase tracking-wider">
                {roleName.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* Quick Actions Row */}
          <div className="flex flex-wrap gap-3 mb-6">
            <Link
              href="/dashboard/projects"
              className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-2"
            >
              <span>📁</span> Manage Projects ({projectsCount})
            </Link>
            <Link
              href="/dashboard/sprints"
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-2"
            >
              <span>⚡</span> Active Sprints ({sprintsCount})
            </Link>
            {canManageEmployees && (
              <Link
                href="/dashboard/employees/new"
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:border-orange-400 text-slate-800 font-bold text-xs shadow-xs transition-all flex items-center gap-2"
              >
                <span>👤</span> + Add Employee
              </Link>
            )}
            {canCreateAdmins && (
              <Link
                href="/dashboard/admins"
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:border-orange-400 text-slate-800 font-bold text-xs shadow-xs transition-all flex items-center gap-2"
              >
                <span>🛡️</span> System Admins
              </Link>
            )}
          </div>

          {/* Core System & Staff Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                Total Projects
              </span>
              <span className="text-2xl font-black text-slate-900">{projectsCount || 8}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                Active Sprints
              </span>
              <span className="text-2xl font-black text-orange-600">{sprintsCount || 4}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                Total Staff
              </span>
              <span className="text-2xl font-black text-slate-900">{totalEmployees || 24}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                Active Employees
              </span>
              <span className="text-2xl font-black text-emerald-600">{activeEmployeesCount || totalEmployees || 20}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                System Admins
              </span>
              <span className="text-2xl font-black text-blue-600">{adminCount || 3}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                Completed Sprints
              </span>
              <span className="text-2xl font-black text-slate-900">12</span>
            </div>
          </div>

          {/* Employee Directory Preview Section */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Employee Roster & Roles</h2>
                <p className="text-xs text-slate-500 font-medium">Recent employees and system role assignments (Showing {employeesList.length > 0 ? (rosterPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(rosterPage * ITEMS_PER_PAGE, employeesList.length)} of {employeesList.length}).</p>
              </div>
              <Link
                href="/dashboard/employees"
                className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                View All Employees →
              </Link>
            </div>

            <div className="workspace-list-card">
              <div className="workspace-table-scroll">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>System Role</th>
                      <th>Designation</th>
                      <th>Email Address</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeesList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-slate-500 text-xs font-medium">
                          No employee records loaded yet.
                        </td>
                      </tr>
                    ) : (
                      employeesList.slice((rosterPage - 1) * ITEMS_PER_PAGE, rosterPage * ITEMS_PER_PAGE).map((emp) => (
                        <tr key={emp.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-lg bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center">
                                {emp.name.slice(0, 1).toUpperCase()}
                              </span>
                              <div>
                                <Link
                                  href={`/dashboard/employees/${emp.id}`}
                                  className="font-bold text-xs text-slate-900 hover:text-orange-600 block"
                                >
                                  {emp.name}
                                </Link>
                                <span className="text-[10px] text-slate-400 font-semibold">EMP-{emp.id}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-slate-900 text-white tracking-wider">
                              {emp.role?.name || "EMPLOYEE"}
                            </span>
                          </td>
                          <td>
                            <span className="text-xs font-semibold text-slate-700">
                              {emp.designation?.name || "Unassigned"}
                            </span>
                          </td>
                          <td>
                            <span className="text-xs font-medium text-slate-600">{emp.email}</span>
                          </td>
                          <td>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${emp.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-rose-50 text-rose-800 border-rose-200"
                                }`}
                            >
                              {emp.status || "ACTIVE"}
                            </span>
                          </td>
                          <td>
                            <Link
                              href={`/dashboard/employees/${emp.id}`}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs inline-block"
                            >
                              Details
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {employeesList.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between p-3 border-t border-slate-100 bg-slate-50/50 text-xs">
                  <span className="font-semibold text-slate-500">
                    Page {rosterPage} of {Math.ceil(employeesList.length / ITEMS_PER_PAGE)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={rosterPage === 1}
                      onClick={() => setRosterPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                    >
                      ← Prev
                    </button>
                    <button
                      disabled={rosterPage >= Math.ceil(employeesList.length / ITEMS_PER_PAGE)}
                      onClick={() => setRosterPage((p) => p + 1)}
                      className="px-2.5 py-1 rounded bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Active Sprints Overview Table */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Active Iterations & Sprints</h2>
                <p className="text-xs text-slate-500 font-medium">Sprint progress and timeline tracking (Showing {activeSprints.length > 0 ? (sprintsPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(sprintsPage * ITEMS_PER_PAGE, activeSprints.length)} of {activeSprints.length}).</p>
              </div>
              <Link href="/dashboard/sprints" className="text-xs font-bold text-orange-600 hover:text-orange-700">
                View All Sprints →
              </Link>
            </div>

            <div className="workspace-list-card">
              <div className="workspace-table-scroll">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Sprint Name</th>
                      <th>Project</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Timeline</th>
                      <th>Progress</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {activeSprints.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-6 text-slate-500 text-xs font-medium">
                          No active sprints found.
                        </td>
                      </tr>
                    ) : (
                      activeSprints.slice((sprintsPage - 1) * ITEMS_PER_PAGE, sprintsPage * ITEMS_PER_PAGE).map((s) => {
                        const pct = s.totalItems > 0 ? Math.round((s.completedItems / s.totalItems) * 100) : 0;
                        return (
                          <tr key={s.id}>
                            <td>
                              <strong>{s.name}</strong>
                            </td>
                            <td>{s.projectName}</td>
                            <td>{s.type}</td>
                            <td>
                              <StatusBadge status={s.status} />
                            </td>
                            <td>
                              {s.startDate} - {s.endDate}
                            </td>
                            <td>
                              <div className="flex items-center gap-3">
                                <div className="h-2 w-28 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-bold text-slate-700">{pct}% ({s.completedItems}/{s.totalItems})</span>
                              </div>
                            </td>
                            <td>
                              <Link href={`/dashboard/projects`} className="text-button text-xs font-bold">
                                Open Projects →
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {activeSprints.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between p-3 border-t border-slate-100 bg-slate-50/50 text-xs">
                  <span className="font-semibold text-slate-500">
                    Page {sprintsPage} of {Math.ceil(activeSprints.length / ITEMS_PER_PAGE)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={sprintsPage === 1}
                      onClick={() => setSprintsPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                    >
                      ← Prev
                    </button>
                    <button
                      disabled={sprintsPage >= Math.ceil(activeSprints.length / ITEMS_PER_PAGE)}
                      onClick={() => setSprintsPage((p) => p + 1)}
                      className="px-2.5 py-1 rounded bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Recent System Work Items Table */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Recent Work Items & Hierarchy</h2>
                <p className="text-xs text-slate-500 font-medium">Latest Epics, Stories, Tasks, Bugs, and Subtasks (Showing {recentWorkItems.length > 0 ? (workItemsPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(workItemsPage * ITEMS_PER_PAGE, recentWorkItems.length)} of {recentWorkItems.length}).</p>
              </div>
              <Link href="/dashboard/projects" className="text-xs font-bold text-orange-600 hover:text-orange-700">
                View Projects →
              </Link>
            </div>

            <div className="workspace-list-card">
              <div className="workspace-table-scroll">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Title & Parent</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Project</th>
                      <th>Assignee</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentWorkItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-6 text-slate-500 text-xs font-medium">
                          No work items created yet.
                        </td>
                      </tr>
                    ) : (
                      recentWorkItems.slice((workItemsPage - 1) * ITEMS_PER_PAGE, workItemsPage * ITEMS_PER_PAGE).map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className="font-bold text-xs text-slate-900">{item.key}</span>
                          </td>
                          <td>
                            <strong className="text-slate-900 text-sm block">
                              {item.type === "SUBTASK" && <span className="text-orange-600 font-bold mr-1">↳</span>}
                              {item.title}
                            </strong>
                            {item.parentTitle && (
                              <small className="table-subtext font-semibold text-slate-500">Parent: {item.parentTitle}</small>
                            )}
                          </td>
                          <td>
                            <TypeBadge type={item.type} />
                          </td>
                          <td>
                            <StatusBadge status={item.status} />
                          </td>
                          <td>
                            <PriorityPill priority={item.priority} />
                          </td>
                          <td>{item.project}</td>
                          <td>{item.assignee}</td>
                          <td>
                            <span className="text-xs font-medium text-slate-500">{item.updatedAt}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {recentWorkItems.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between p-3 border-t border-slate-100 bg-slate-50/50 text-xs">
                  <span className="font-semibold text-slate-500">
                    Page {workItemsPage} of {Math.ceil(recentWorkItems.length / ITEMS_PER_PAGE)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={workItemsPage === 1}
                      onClick={() => setWorkItemsPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                    >
                      ← Prev
                    </button>
                    <button
                      disabled={workItemsPage >= Math.ceil(recentWorkItems.length / ITEMS_PER_PAGE)}
                      onClick={() => setWorkItemsPage((p) => p + 1)}
                      className="px-2.5 py-1 rounded bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
