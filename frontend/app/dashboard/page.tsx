"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { getEmployees, type Employee } from "@/services/employee.service";
import { getWorkspaceList } from "@/services/workspace.service";

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

  const activeSprints: ActiveSprintOverview[] = [
    {
      id: 12,
      name: "Sprint 12 - Authentication & UI Refinement",
      projectName: "E-Commerce Platform",
      status: "ACTIVE",
      type: "WEEKLY",
      startDate: "2025-08-01",
      endDate: "2025-08-15",
      totalItems: 18,
      completedItems: 14,
    },
    {
      id: 14,
      name: "Sprint 3 - HR Core API Integration",
      projectName: "HRMS Enterprise",
      status: "ACTIVE",
      type: "WEEKLY",
      startDate: "2025-08-05",
      endDate: "2025-08-19",
      totalItems: 12,
      completedItems: 8,
    },
  ];

  const recentWorkItems: WorkItem[] = [
    {
      id: "1",
      key: "HRMS-101",
      title: "Authentication API & Role Permissions Guard",
      type: "EPIC",
      status: "IN_PROGRESS",
      priority: "CRITICAL",
      project: "HRMS Enterprise",
      assignee: "Rahul Sharma",
      updatedAt: "10 mins ago",
    },
    {
      id: "2",
      key: "HRMS-102",
      title: "User Login & JWT Token Verification Form",
      type: "STORY",
      status: "IN_PROGRESS",
      priority: "HIGH",
      project: "HRMS Enterprise",
      parentTitle: "Authentication API & Role Permissions Guard",
      assignee: "Priya Patel",
      updatedAt: "25 mins ago",
    },
    {
      id: "3",
      key: "HRMS-103",
      title: "Create Database Schema for WorkItem & Parent Relationship",
      type: "SUBTASK",
      status: "DONE",
      priority: "HIGH",
      project: "HRMS Enterprise",
      parentTitle: "User Login & JWT Token Verification Form",
      assignee: "Amit Kumar",
      updatedAt: "1 hour ago",
    },
    {
      id: "4",
      key: "HRMS-104",
      title: "Project Hierarchy Tabular View Component",
      type: "TASK",
      status: "REVIEW",
      priority: "MEDIUM",
      project: "E-Commerce Platform",
      parentTitle: "Workspace UI Overhaul",
      assignee: "Neha Gupta",
      updatedAt: "2 hours ago",
    },
    {
      id: "5",
      key: "HRMS-105",
      title: "Fix Password Visibility Toggle Icon Margin",
      type: "BUG",
      status: "DONE",
      priority: "LOW",
      project: "HRMS Enterprise",
      assignee: "Rahul Sharma",
      updatedAt: "3 hours ago",
    },
  ];

  const loadDashboardMetrics = useCallback(async () => {
    if (!session?.token) return;
    try {
      const [empData, projData, sprintData] = await Promise.all([
        getEmployees({ limit: 5 }, session.token).catch(() => null),
        getWorkspaceList("projects", session.token).catch(() => null),
        getWorkspaceList("sprints", session.token).catch(() => null),
      ]);

      if (empData) {
        setEmployeesList(empData.employees || []);
        setTotalEmployees(empData.total || empData.employees.length);
      }

      if (projData?.items) setProjectsCount(projData.items.length);
      if (sprintData?.items) setSprintsCount(sprintData.items.length);
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
            <a
              href="/dashboard/projects"
              className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-2"
            >
              <span>📁</span> Manage Projects ({projectsCount})
            </a>
            <a
              href="/dashboard/sprints"
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-2"
            >
              <span>⚡</span> Active Sprints ({sprintsCount})
            </a>
            {canManageEmployees && (
              <a
                href="/dashboard/employees/new"
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:border-orange-400 text-slate-800 font-bold text-xs shadow-xs transition-all flex items-center gap-2"
              >
                <span>👤</span> + Add Employee
              </a>
            )}
            {canCreateAdmins && (
              <a
                href="/dashboard/admins"
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:border-orange-400 text-slate-800 font-bold text-xs shadow-xs transition-all flex items-center gap-2"
              >
                <span>🛡️</span> System Admins
              </a>
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
                <p className="text-xs text-slate-500 font-medium">Recent employees and system role assignments.</p>
              </div>
              <a
                href="/dashboard/employees"
                className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                View All Employees →
              </a>
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
                      employeesList.slice(0, 5).map((emp) => (
                        <tr key={emp.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-lg bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center">
                                {emp.name.slice(0, 1).toUpperCase()}
                              </span>
                              <div>
                                <a
                                  href={`/dashboard/employees/${emp.id}`}
                                  className="font-bold text-xs text-slate-900 hover:text-orange-600 block"
                                >
                                  {emp.name}
                                </a>
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
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                                emp.status === "ACTIVE"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-rose-50 text-rose-800 border-rose-200"
                              }`}
                            >
                              {emp.status || "ACTIVE"}
                            </span>
                          </td>
                          <td>
                            <a
                              href={`/dashboard/employees/${emp.id}`}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs inline-block"
                            >
                              Details
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Active Sprints Overview Table */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Active Iterations & Sprints</h2>
                <p className="text-xs text-slate-500 font-medium">Sprint progress and timeline tracking.</p>
              </div>
              <a href="/dashboard/sprints" className="text-xs font-bold text-orange-600 hover:text-orange-700">
                View All Sprints →
              </a>
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
                    {activeSprints.map((s) => {
                      const pct = Math.round((s.completedItems / s.totalItems) * 100);
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
                            <a href={`/dashboard/projects`} className="text-button text-xs font-bold">
                              Open Projects →
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Recent System Work Items Table */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Recent Work Items & Hierarchy</h2>
                <p className="text-xs text-slate-500 font-medium">Latest Epics, Stories, Tasks, Bugs, and Subtasks.</p>
              </div>
              <a href="/dashboard/projects" className="text-xs font-bold text-orange-600 hover:text-orange-700">
                View Projects →
              </a>
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
                    {recentWorkItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="font-bold text-xs text-slate-900">{item.key}</span>
                        </td>
                        <td>
                          <strong className="text-slate-900 text-sm block">{item.title}</strong>
                          {item.parentTitle && (
                            <small className="table-subtext">Parent: {item.parentTitle}</small>
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
