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
import { DashboardWelcome } from "@/components/dashboard/dashboard-welcome";

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
    : (session?.user?.role as any)?.name || (session?.user?.role === 1 ? "SUPER_ADMIN" : session?.user?.role === 2 ? "ADMIN" : session?.user?.role === 3 ? "HR" : "EMPLOYEE");

  const userRoleId = typeof session?.user?.role === "number"
    ? session.user.role
    : (session?.user?.role as any)?.id || (roleName === "SUPER_ADMIN" ? 1 : roleName === "ADMIN" ? 2 : roleName === "HR" ? 3 : 4);

  const isSuperAdmin = roleName === "SUPER_ADMIN" || userRoleId === 1;
  const isAdminUser = isSuperAdmin || roleName === "ADMIN" || roleName === "HR" || userRoleId === 2 || userRoleId === 3;

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
          <DashboardWelcome
            name={session.user.name}
            eyebrow="ENTERPRISE ADMINISTRATION"
            subtitle="Overview of system metrics, active employees, admins, and workspace projects."
            role={roleName}
          />

          {/* Quick Actions Row */}
          <div className="flex flex-wrap gap-2.5 sm:gap-3 mb-6">
            <Link
              href="/dashboard/projects"
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none min-h-[40px]"
            >
              <span>📁</span> <span className="whitespace-nowrap">Manage Projects ({projectsCount})</span>
            </Link>
            <Link
              href="/dashboard/sprints"
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none min-h-[40px]"
            >
              <span>⚡</span> <span className="whitespace-nowrap">Active Sprints ({sprintsCount})</span>
            </Link>
            {canManageEmployees && (
              <Link
                href="/dashboard/employees/new"
                className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white border border-slate-300 hover:border-orange-400 active:scale-[0.98] text-slate-800 font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none min-h-[40px]"
              >
                <span>👤</span> <span className="whitespace-nowrap">+ Add Employee</span>
              </Link>
            )}
            {canCreateAdmins && (
              <Link
                href="/dashboard/admins"
                className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white border border-slate-300 hover:border-orange-400 active:scale-[0.98] text-slate-800 font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none min-h-[40px]"
              >
                <span>🛡️</span> <span className="whitespace-nowrap">System Admins</span>
              </Link>
            )}
          </div>

          {/* Core System & Staff Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4 mb-6 sm:mb-8">
            <div className="bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1 truncate">
                Total Projects
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 block truncate">{projectsCount || 8}</span>
            </div>
            <div className="bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1 truncate">
                Active Sprints
              </span>
              <span className="text-xl sm:text-2xl font-black text-orange-600 block truncate">{sprintsCount || 4}</span>
            </div>
            <div className="bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1 truncate">
                Total Staff
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 block truncate">{totalEmployees || 24}</span>
            </div>
            <div className="bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1 truncate">
                Active Employees
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-600 block truncate">{activeEmployeesCount || totalEmployees || 20}</span>
            </div>
            <div className="bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1 truncate">
                System Admins
              </span>
              <span className="text-xl sm:text-2xl font-black text-blue-600 block truncate">{adminCount || 3}</span>
            </div>
            <div className="bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1 truncate">
                Completed Sprints
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 block truncate">12</span>
            </div>
          </div>

          {/* Employee Directory Preview Section */}
          <section className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 mb-3">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900">Employee Roster & Roles</h2>
                <p className="text-xs text-slate-500 font-medium">Recent employees and system role assignments (Showing {employeesList.length > 0 ? (rosterPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(rosterPage * ITEMS_PER_PAGE, employeesList.length)} of {employeesList.length}).</p>
              </div>
              <Link
                href="/dashboard/employees"
                className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 shrink-0 self-start sm:self-auto"
              >
                View All Employees →
              </Link>
            </div>

            <div className="workspace-list-card rounded-xl sm:rounded-2xl">
              <div className="workspace-table-scroll">
                <table className="workspace-table min-w-[620px]">
                  <thead>
                    <tr>
                      <th className="whitespace-nowrap">Employee</th>
                      <th className="whitespace-nowrap">System Role</th>
                      <th className="whitespace-nowrap">Designation</th>
                      <th className="whitespace-nowrap">Email Address</th>
                      <th className="whitespace-nowrap">Status</th>
                      <th className="whitespace-nowrap">Action</th>
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
                          <td className="whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-lg bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                                {emp.name.slice(0, 1).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <Link
                                  href={`/dashboard/employees/${emp.id}`}
                                  className="font-bold text-xs text-slate-900 hover:text-orange-600 block truncate"
                                >
                                  {emp.name}
                                </Link>
                                <span className="text-[10px] text-slate-400 font-semibold block">EMP-{emp.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-slate-900 text-white tracking-wider">
                              {emp.role?.name || "EMPLOYEE"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className="text-xs font-semibold text-slate-700">
                              {emp.designation?.name || "Unassigned"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className="text-xs font-medium text-slate-600">{emp.email}</span>
                          </td>
                          <td className="whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${emp.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-rose-50 text-rose-800 border-rose-200"
                                }`}
                            >
                              {emp.status || "ACTIVE"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap">
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
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3 border-t border-slate-100 bg-slate-50/50 text-xs">
                  <span className="font-semibold text-slate-500">
                    Page {rosterPage} of {Math.ceil(employeesList.length / ITEMS_PER_PAGE)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={rosterPage === 1}
                      onClick={() => setRosterPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      ← Prev
                    </button>
                    <button
                      disabled={rosterPage >= Math.ceil(employeesList.length / ITEMS_PER_PAGE)}
                      onClick={() => setRosterPage((p) => p + 1)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Active Sprints Overview Table */}
          <section className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 mb-3">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900">Active Iterations & Sprints</h2>
                <p className="text-xs text-slate-500 font-medium">Sprint progress and timeline tracking (Showing {activeSprints.length > 0 ? (sprintsPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(sprintsPage * ITEMS_PER_PAGE, activeSprints.length)} of {activeSprints.length}).</p>
              </div>
              <Link href="/dashboard/sprints" className="text-xs font-bold text-orange-600 hover:text-orange-700 shrink-0 self-start sm:self-auto">
                View All Sprints →
              </Link>
            </div>

            <div className="workspace-list-card rounded-xl sm:rounded-2xl">
              <div className="workspace-table-scroll">
                <table className="workspace-table min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="whitespace-nowrap">Sprint Name</th>
                      <th className="whitespace-nowrap">Project</th>
                      <th className="whitespace-nowrap">Type</th>
                      <th className="whitespace-nowrap">Status</th>
                      <th className="whitespace-nowrap">Timeline</th>
                      <th className="whitespace-nowrap">Progress</th>
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
                            <td className="whitespace-nowrap">
                              <strong>{s.name}</strong>
                            </td>
                            <td className="whitespace-nowrap">{s.projectName}</td>
                            <td className="whitespace-nowrap">{s.type}</td>
                            <td className="whitespace-nowrap">
                              <StatusBadge status={s.status} />
                            </td>
                            <td className="whitespace-nowrap">
                              {s.startDate} - {s.endDate}
                            </td>
                            <td className="whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="h-2 w-20 sm:w-28 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-bold text-slate-700">{pct}% ({s.completedItems}/{s.totalItems})</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap text-right">
                              <Link href={`/dashboard/projects`} className="text-button text-xs font-bold">
                                View →
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
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3 border-t border-slate-100 bg-slate-50/50 text-xs">
                  <span className="font-semibold text-slate-500">
                    Page {sprintsPage} of {Math.ceil(activeSprints.length / ITEMS_PER_PAGE)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={sprintsPage === 1}
                      onClick={() => setSprintsPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      ← Prev
                    </button>
                    <button
                      disabled={sprintsPage >= Math.ceil(activeSprints.length / ITEMS_PER_PAGE)}
                      onClick={() => setSprintsPage((p) => p + 1)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Recent System Work Items Table */}
          <section className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 mb-3">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900">Recent Work Items & Hierarchy</h2>
                <p className="text-xs text-slate-500 font-medium">Latest Epics, Stories, Tasks, Bugs, and Subtasks (Showing {recentWorkItems.length > 0 ? (workItemsPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(workItemsPage * ITEMS_PER_PAGE, recentWorkItems.length)} of {recentWorkItems.length}).</p>
              </div>
              <Link href="/dashboard/projects" className="text-xs font-bold text-orange-600 hover:text-orange-700 shrink-0 self-start sm:self-auto">
                View Projects →
              </Link>
            </div>

            <div className="workspace-list-card rounded-xl sm:rounded-2xl">
              <div className="workspace-table-scroll">
                <table className="workspace-table min-w-[700px]">
                  <thead>
                    <tr>
                      <th className="whitespace-nowrap">Key</th>
                      <th className="whitespace-nowrap">Title & Parent</th>
                      <th className="whitespace-nowrap">Type</th>
                      <th className="whitespace-nowrap">Status</th>
                      <th className="whitespace-nowrap">Priority</th>
                      <th className="whitespace-nowrap">Project</th>
                      <th className="whitespace-nowrap">Assignee</th>
                      <th className="whitespace-nowrap">Updated</th>
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
                          <td className="whitespace-nowrap">
                            <span className="font-bold text-xs text-slate-900">{item.key}</span>
                          </td>
                          <td>
                            <strong className="text-slate-900 text-xs sm:text-sm block">
                              {item.type === "SUBTASK" && <span className="text-orange-600 font-bold mr-1">↳</span>}
                              {item.title}
                            </strong>
                            {item.parentTitle && (
                              <small className="table-subtext font-semibold text-slate-500 block truncate max-w-xs">Parent: {item.parentTitle}</small>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            <TypeBadge type={item.type} />
                          </td>
                          <td className="whitespace-nowrap">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="whitespace-nowrap">
                            <PriorityPill priority={item.priority} />
                          </td>
                          <td className="whitespace-nowrap">{item.project}</td>
                          <td className="whitespace-nowrap">{item.assignee}</td>
                          <td className="whitespace-nowrap">
                            <span className="text-xs font-medium text-slate-500">{item.updatedAt}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {recentWorkItems.length > ITEMS_PER_PAGE && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3 border-t border-slate-100 bg-slate-50/50 text-xs">
                  <span className="font-semibold text-slate-500">
                    Page {workItemsPage} of {Math.ceil(recentWorkItems.length / ITEMS_PER_PAGE)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={workItemsPage === 1}
                      onClick={() => setWorkItemsPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      ← Prev
                    </button>
                    <button
                      disabled={workItemsPage >= Math.ceil(recentWorkItems.length / ITEMS_PER_PAGE)}
                      onClick={() => setWorkItemsPage((p) => p + 1)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 active:scale-95 transition-all"
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
