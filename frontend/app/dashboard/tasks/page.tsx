"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  getAllWorkItems,
  getWorkspaceList,
  updateWorkItem,
  type TaskWorkItem,
} from "@/services/workspace.service";
import { getEmployees, type Employee } from "@/services/employee.service";
import { showSuccessToast, showErrorToast } from "@/lib/swal";
import {
  CheckSquare,
  Search,
  Filter,
  FolderGit2,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  Eye,
  Calendar,
  X,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Layers,
  ArrowRight,
  ShieldCheck,
  Tag,
  Flame,
} from "lucide-react";

export default function TasksPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const [tasks, setTasks] = useState<TaskWorkItem[]>([]);
  const [projects, setProjects] = useState<Array<{ id: number; name: string; key?: string }>>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("ALL");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedPriority, setSelectedPriority] = useState<string>("ALL");

  // View Details Modal
  const [activeTaskModal, setActiveTaskModal] = useState<TaskWorkItem | null>(null);

  // Custom Employee Filter Dropdown State (no-scrollbar scrollable list)
  const [isEmpDropdownOpen, setIsEmpDropdownOpen] = useState(false);
  const empDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (empDropdownRef.current && !empDropdownRef.current.contains(event.target as Node)) {
        setIsEmpDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedEmpName =
    selectedEmployee === "ALL"
      ? "All Employees"
      : employees.find((e) => String(e.id) === String(selectedEmployee))?.name || "All Employees";

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  const roleName = typeof session?.user?.role === "string"
    ? session.user.role
    : (session?.user?.role as any)?.name || (String(session?.user?.role) === "1" ? "SUPER_ADMIN" : String(session?.user?.role) === "2" ? "ADMIN" : String(session?.user?.role) === "3" ? "HR" : "EMPLOYEE");
  const isSuperAdmin = roleName === "SUPER_ADMIN" || String(session?.user?.role) === "1";
  const isAdmin = roleName === "ADMIN" || String(session?.user?.role) === "2";
  const isHR = roleName.includes("HR") || String(session?.user?.role) === "3";
  const isAdminOrHR = isSuperAdmin || isAdmin || isHR;

  // Fetch initial tasks, projects, and employee list
  const loadData = async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const [tasksRes, projectsRes] = await Promise.all([
        getAllWorkItems(session.token, {
          projectId: selectedProject,
          employeeId: isAdminOrHR ? selectedEmployee : undefined,
          status: selectedStatus,
          limit: 300,
        }),
        getWorkspaceList("projects", session.token, { limit: 100 }),
      ]);

      setTasks(tasksRes.items || []);

      if (projectsRes && Array.isArray((projectsRes as any).items)) {
        setProjects(
          (projectsRes as any).items.map((p: any) => ({
            id: Number(p.id),
            name: String(p.name || "Untitled Project"),
            key: p.key ? String(p.key) : undefined,
          }))
        );
      }

      if (isAdminOrHR) {
        const empRes = await getEmployees({ limit: 150 }, session.token);
        if (empRes && Array.isArray(empRes.employees)) {
          setEmployees(empRes.employees);
        }
      }
    } catch (err: any) {
      console.error("Failed to load tasks:", err);
      showErrorToast(err?.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
      return;
    }
    if (session?.token) {
      loadData();
    }
  }, [session?.token, isLoading, selectedProject, selectedEmployee, selectedStatus]);

  // Quick Status Update
  const handleQuickStatusChange = async (taskId: string, numericId: number | undefined, newStatus: string) => {
    if (!session?.token) return;
    const targetNumericId = numericId || Number(taskId);
    if (!targetNumericId || isNaN(targetNumericId)) return;

    setStatusUpdatingId(taskId);
    try {
      await updateWorkItem(targetNumericId, { status: newStatus }, session.token);

      // Optimistic state update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
      if (activeTaskModal && activeTaskModal.id === taskId) {
        setActiveTaskModal((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      showSuccessToast(`Task status updated to ${newStatus.replace("_", " ")}`);
    } catch (err: any) {
      showErrorToast(err?.message || "Failed to update task status");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // Filtered Tasks (Client-side Search & Priority filtering)
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesKey = t.key.toLowerCase().includes(q);
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesProject = t.project?.toLowerCase().includes(q);
        const matchesAssignee = t.assignee?.toLowerCase().includes(q);
        const matchesDesc = t.description?.toLowerCase().includes(q);
        if (!matchesKey && !matchesTitle && !matchesProject && !matchesAssignee && !matchesDesc) {
          return false;
        }
      }

      // Priority Filter
      if (selectedPriority !== "ALL" && t.priority !== selectedPriority) {
        return false;
      }

      return true;
    });
  }, [tasks, searchQuery, selectedPriority]);

  // Metrics
  const metrics = useMemo(() => {
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
    const inReview = tasks.filter((t) => t.status === "IN_REVIEW").length;
    const todo = tasks.filter((t) => t.status === "TODO").length;
    const done = tasks.filter((t) => t.status === "DONE").length;
    const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
    return { total, inProgress, inReview, todo, done, blocked };
  }, [tasks]);

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedProject("ALL");
    setSelectedEmployee("ALL");
    setSelectedStatus("ALL");
    setSelectedPriority("ALL");
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedProject !== "ALL" ||
    selectedEmployee !== "ALL" ||
    selectedStatus !== "ALL" ||
    selectedPriority !== "ALL";

  const getPriorityBadge = (priority: string) => {
    switch (priority?.toUpperCase()) {
      case "CRITICAL":
        return {
          label: "Critical",
          className: "bg-rose-50 text-rose-700 border-rose-200/90 font-bold",
          icon: <Flame size={12} className="text-rose-600" />,
        };
      case "HIGH":
        return {
          label: "High",
          className: "bg-orange-50 text-orange-700 border-orange-200/90 font-bold",
          icon: <AlertCircle size={12} className="text-orange-600" />,
        };
      case "MEDIUM":
        return {
          label: "Medium",
          className: "bg-blue-50 text-blue-700 border-blue-200/90 font-semibold",
          icon: null,
        };
      default:
        return {
          label: "Low",
          className: "bg-slate-50 text-slate-600 border-slate-200 font-medium",
          icon: null,
        };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DONE":
        return {
          label: "Done",
          className: "bg-emerald-50 text-emerald-700 border-emerald-200/90 font-extrabold",
          dot: "bg-emerald-500",
        };
      case "IN_PROGRESS":
        return {
          label: "In Progress",
          className: "bg-blue-50 text-blue-700 border-blue-200/90 font-bold",
          dot: "bg-blue-500 animate-pulse",
        };
      case "IN_REVIEW":
        return {
          label: "In Review",
          className: "bg-purple-50 text-purple-700 border-purple-200/90 font-bold",
          dot: "bg-purple-500",
        };
      case "BLOCKED":
        return {
          label: "Blocked",
          className: "bg-rose-50 text-rose-700 border-rose-200/90 font-bold",
          dot: "bg-rose-500",
        };
      default:
        return {
          label: "To Do",
          className: "bg-slate-100 text-slate-700 border-slate-200 font-semibold",
          dot: "bg-slate-400",
        };
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type?.toUpperCase()) {
      case "BUG":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "STORY":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "EPIC":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "FEATURE":
        return "bg-amber-50 text-amber-700 border-amber-200";
      default:
        return "bg-blue-50 text-blue-700 border-blue-200";
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading workspace tasks...</main>;
  }

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={isSuperAdmin} onSignOut={handleSignOut} />

        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Header */}
          <div className="welcome mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="eyebrow">{isAdminOrHR ? "WORKSPACE & TEAM EXECUTION" : "MY WORKSPACE"}</p>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                {isAdminOrHR ? "All Employee Tasks & Assignments" : "My Assigned Tasks"}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {isAdminOrHR
                  ? "Track, filter and manage assigned tasks and deliverables across all employees and active projects."
                  : "View, update and track your active tasks, backlog assignments, and project deliverables."}
              </p>
            </div>

            {/* Quick Action Link to Full Projects / Board */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard/projects")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs transition-all cursor-pointer"
              >
                <FolderGit2 size={15} className="text-orange-600" />
                <span>Go to Projects</span>
              </button>
            </div>
          </div>

          {/* Interactive Metric Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-6">
            <button
              type="button"
              onClick={() => setSelectedStatus("ALL")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer shadow-2xs ${selectedStatus === "ALL"
                ? "bg-orange-50/80 border-orange-300 text-slate-900 shadow-xs ring-1 ring-orange-400/25"
                : "bg-white border-slate-200/90 text-slate-800 hover:bg-slate-50/80 hover:border-slate-300"
                }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${selectedStatus === "ALL" ? "text-orange-700" : "text-slate-400"
                  }`}>
                  Total Tasks
                </span>
                <CheckSquare size={16} className={selectedStatus === "ALL" ? "text-orange-600" : "text-slate-400"} />
              </div>
              <p className="text-2xl font-black leading-none text-slate-900">{metrics.total}</p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus("IN_PROGRESS")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer shadow-2xs ${selectedStatus === "IN_PROGRESS"
                ? "bg-orange-50/80 border-orange-300 text-slate-900 shadow-xs ring-1 ring-orange-400/25"
                : "bg-white border-slate-200/90 text-slate-800 hover:bg-slate-50/80 hover:border-slate-300"
                }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${selectedStatus === "IN_PROGRESS" ? "text-orange-700" : "text-slate-400"
                  }`}>
                  In Progress
                </span>
                <PlayCircle size={16} className={selectedStatus === "IN_PROGRESS" ? "text-orange-600" : "text-slate-400"} />
              </div>
              <p className="text-2xl font-black leading-none text-slate-900">{metrics.inProgress}</p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus("IN_REVIEW")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer shadow-2xs ${selectedStatus === "IN_REVIEW"
                ? "bg-orange-50/80 border-orange-300 text-slate-900 shadow-xs ring-1 ring-orange-400/25"
                : "bg-white border-slate-200/90 text-slate-800 hover:bg-slate-50/80 hover:border-slate-300"
                }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${selectedStatus === "IN_REVIEW" ? "text-orange-700" : "text-slate-400"
                  }`}>
                  In Review
                </span>
                <Clock size={16} className={selectedStatus === "IN_REVIEW" ? "text-orange-600" : "text-slate-400"} />
              </div>
              <p className="text-2xl font-black leading-none text-slate-900">{metrics.inReview}</p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus("TODO")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer shadow-2xs ${selectedStatus === "TODO"
                ? "bg-orange-50/80 border-orange-300 text-slate-900 shadow-xs ring-1 ring-orange-400/25"
                : "bg-white border-slate-200/90 text-slate-800 hover:bg-slate-50/80 hover:border-slate-300"
                }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${selectedStatus === "TODO" ? "text-orange-700" : "text-slate-400"
                  }`}>
                  To Do
                </span>
                <Layers size={16} className={selectedStatus === "TODO" ? "text-orange-600" : "text-slate-400"} />
              </div>
              <p className="text-2xl font-black leading-none text-slate-900">{metrics.todo}</p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus("DONE")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer shadow-2xs col-span-2 sm:col-span-1 ${selectedStatus === "DONE"
                ? "bg-orange-50/80 border-orange-300 text-slate-900 shadow-xs ring-1 ring-orange-400/25"
                : "bg-white border-slate-200/90 text-slate-800 hover:bg-slate-50/80 hover:border-slate-300"
                }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${selectedStatus === "DONE" ? "text-orange-700" : "text-slate-400"
                  }`}>
                  Completed
                </span>
                <CheckCircle2 size={16} className={selectedStatus === "DONE" ? "text-orange-600" : "text-slate-400"} />
              </div>
              <p className="text-2xl font-black leading-none text-slate-900">{metrics.done}</p>
            </button>
          </div>

          {/* Filter & Search Toolbar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs mb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
              {/* Search Field */}
              <div className={`relative ${isAdminOrHR ? "lg:col-span-4" : "lg:col-span-6"}`}>
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Search task key, title, or assignee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: "42px" }}
                  className="w-full h-10 !pl-11 pr-8 text-xs bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/10 text-slate-900 font-medium placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Project Filter */}
              <div className={`relative ${isAdminOrHR ? "lg:col-span-3" : "lg:col-span-4"}`}>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full h-10 px-3.5 text-xs bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-xl transition-all font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/10"
                >
                  <option value="ALL">{isAdminOrHR ? "All Projects" : "All My Projects"}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.key ? `(${p.key})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Employee Filter (Admin/HR Only) */}
              {isAdminOrHR && (
                <div ref={empDropdownRef} className="relative lg:col-span-3">
                  <button
                    type="button"
                    onClick={() => setIsEmpDropdownOpen(!isEmpDropdownOpen)}
                    className="w-full h-10 px-3.5 text-xs bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-xl transition-all font-semibold text-slate-700 flex items-center justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/10"
                  >
                    <span className="truncate">{selectedEmpName}</span>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 shrink-0 ml-2 transition-transform duration-150 ${isEmpDropdownOpen ? "rotate-180 text-orange-500" : ""
                        }`}
                    />
                  </button>

                  {isEmpDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200/90 rounded-xl shadow-lg max-h-60 overflow-y-auto scrollbar-none no-scrollbar py-1 divide-y divide-slate-50 animate-in fade-in zoom-in-95 duration-100">
                      <div
                        onClick={() => {
                          setSelectedEmployee("ALL");
                          setIsEmpDropdownOpen(false);
                        }}
                        className={`px-3.5 py-2.5 text-xs font-semibold cursor-pointer transition-colors ${selectedEmployee === "ALL"
                          ? "bg-orange-50/80 text-orange-700 font-bold"
                          : "text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        All Employees
                      </div>
                      {employees.map((emp) => {
                        const isSelected = String(selectedEmployee) === String(emp.id);
                        return (
                          <div
                            key={emp.id}
                            onClick={() => {
                              setSelectedEmployee(String(emp.id));
                              setIsEmpDropdownOpen(false);
                            }}
                            className={`px-3.5 py-2.5 text-xs font-semibold cursor-pointer transition-colors ${isSelected
                              ? "bg-orange-50/80 text-orange-700 font-bold"
                              : "text-slate-700 hover:bg-slate-50"
                              }`}
                          >
                            {emp.name || emp.email}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Priority Filter */}
              <div className={`relative ${isAdminOrHR ? "lg:col-span-2" : "lg:col-span-2"}`}>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="w-full h-10 px-3.5 text-xs bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-xl transition-all font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/10"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="CRITICAL"> Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            {/* Status Pills & Reset */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
                {[
                  { key: "ALL", label: "All Tasks" },
                  { key: "TODO", label: "To Do" },
                  { key: "IN_PROGRESS", label: "In Progress" },
                  { key: "IN_REVIEW", label: "In Review" },
                  { key: "DONE", label: "Completed" },
                  { key: "BLOCKED", label: "Blocked" },
                ].map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setSelectedStatus(st.key)}
                    className={`px-2 py-1.5 rounded-xl text-xs font-medium transition-all border cursor-pointer shrink-0 ${selectedStatus === st.key
                      ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                      : "bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 border-slate-200/70"
                      }`}
                  >
                    <span>{st.label}</span>
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors cursor-pointer shrink-0"
                >
                  <RotateCcw size={13} />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </div>

          {/* Tasks Table / Card List */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-orange-600" />
                <h2 className="text-sm font-bold text-slate-900">Task List</h2>
                <span className="text-xs font-semibold text-slate-400">({filteredTasks.length} tasks found)</span>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-500">Loading workspace tasks...</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto text-xl font-bold border border-orange-200/60">
                  📋
                </div>
                <h3 className="text-sm font-bold text-slate-900">No tasks match your criteria</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {hasActiveFilters
                    ? "Try adjusting your search query, project, or status filters to view more tasks."
                    : "No tasks have been created or assigned yet in this workspace."}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-none no-scrollbar">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                      <th className="py-3 px-4">Task Key & Type</th>
                      <th className="py-3 px-4 min-w-[220px]">Title & Description</th>
                      <th className="py-3 px-4">Project</th>
                      <th className="py-3 px-4">Assignee</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Status & Action</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTasks.map((task) => {
                      const priority = getPriorityBadge(task.priority);
                      const status = getStatusBadge(task.status);
                      const typeClass = getTypeBadge(task.type);
                      const isUpdating = statusUpdatingId === task.id;

                      const isOverdue =
                        task.dueDate &&
                        task.status !== "DONE" &&
                        new Date(task.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);

                      return (
                        <tr key={task.id} className="hover:bg-slate-50/70 transition-colors group">
                          {/* Key & Type */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="font-extrabold text-slate-900 group-hover:text-orange-600 transition-colors">
                                {task.key}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${typeClass}`}>
                                {task.type}
                              </span>
                            </div>
                          </td>

                          {/* Title & Preview */}
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => setActiveTaskModal(task)}
                              className="text-left font-bold text-slate-900 hover:text-orange-600 transition-colors line-clamp-1 cursor-pointer block"
                            >
                              {task.title}
                            </button>
                            {task.description && (
                              <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 max-w-sm truncate">
                                {task.description}
                              </p>
                            )}
                          </td>

                          {/* Project */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200">
                              <FolderGit2 size={12} className="text-orange-500" />
                              <span className="truncate max-w-[140px]">{task.project}</span>
                            </span>
                          </td>

                          {/* Assignee */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center shrink-0 border border-orange-200">
                                {task.assignee.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 truncate max-w-[130px] leading-tight">
                                  {task.assignee}
                                </p>
                                {task.assigneeObj?.email && (
                                  <p className="text-[10px] text-slate-400 truncate max-w-[130px] leading-tight">
                                    {task.assigneeObj.email}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Priority */}
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] border ${priority.className}`}>
                              {priority.icon}
                              <span>{priority.label}</span>
                            </span>
                          </td>

                          {/* Status with Quick Transition Dropdown */}
                          <td className="py-3 px-4">
                            <div className="relative inline-block">
                              <select
                                value={task.status}
                                disabled={isUpdating}
                                onChange={(e) =>
                                  handleQuickStatusChange(task.id, task.numericId, e.target.value)
                                }
                                className={`text-[11px] font-bold rounded-lg px-2.5 py-1 border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50 ${status.className}`}
                              >
                                <option value="TODO">To Do</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="IN_REVIEW">In Review</option>
                                <option value="DONE">Done</option>
                                <option value="BLOCKED">Blocked</option>
                              </select>
                            </div>
                          </td>

                          {/* Due Date */}
                          <td className="py-3 px-4">
                            {task.dueDate ? (
                              <div className="flex items-center gap-1">
                                <Calendar size={12} className={isOverdue ? "text-rose-500" : "text-slate-400"} />
                                <span className={`text-[11px] font-semibold ${isOverdue ? "text-rose-600 font-bold" : "text-slate-600"}`}>
                                  {new Date(task.dueDate).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">No deadline</span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setActiveTaskModal(task)}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                              title="View full task details"
                            >
                              <Eye size={12} />
                              <span>View</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Task Details Modal */}
      {activeTaskModal && (() => {
        const priority = getPriorityBadge(activeTaskModal.priority);
        const status = getStatusBadge(activeTaskModal.status);
        const typeClass = getTypeBadge(activeTaskModal.type);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => setActiveTaskModal(null)}
          >
            <div
              className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl max-w-2xl w-full overflow-hidden p-6 space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-extrabold text-xs tracking-wider">
                    {activeTaskModal.key}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border uppercase tracking-wider ${typeClass}`}>
                    {activeTaskModal.type}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTaskModal(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Title & Metadata */}
              <div>
                <h3 className="text-xl font-black text-slate-900 leading-snug">
                  {activeTaskModal.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200">
                    <FolderGit2 size={13} className="text-orange-500" />
                    <span>{activeTaskModal.project}</span>
                  </span>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs border ${priority.className}`}>
                    {priority.icon}
                    <span>{priority.label} Priority</span>
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs border ${status.className}`}>
                    <span className={`w-2 h-2 rounded-full ${status.dot}`}></span>
                    <span>{status.label}</span>
                  </span>
                </div>
              </div>

              {/* Grid Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assignee</p>
                  <p className="font-bold text-slate-800 mt-0.5">{activeTaskModal.assignee}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reporter</p>
                  <p className="font-bold text-slate-800 mt-0.5">{activeTaskModal.createdBy || "System"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Due Date</p>
                  <p className="font-bold text-slate-800 mt-0.5">
                    {activeTaskModal.dueDate
                      ? new Date(activeTaskModal.dueDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                      : "None"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Story Points</p>
                  <p className="font-bold text-slate-800 mt-0.5">{activeTaskModal.storyPoints || "N/A"}</p>
                </div>
              </div>

              {/* Task Description */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</p>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed max-h-48 overflow-y-auto">
                  {activeTaskModal.description || (
                    <span className="italic text-slate-400">No additional description provided.</span>
                  )}
                </div>
              </div>

              {/* Status Transition Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Transition Status
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {activeTaskModal.status !== "TODO" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickStatusChange(activeTaskModal.id, activeTaskModal.numericId, "TODO")
                      }
                      className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition-all cursor-pointer shadow-2xs"
                    >
                      Move to To Do
                    </button>
                  )}
                  {activeTaskModal.status !== "IN_PROGRESS" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickStatusChange(activeTaskModal.id, activeTaskModal.numericId, "IN_PROGRESS")
                      }
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all cursor-pointer shadow-xs"
                    >
                      Start Work (In Progress)
                    </button>
                  )}
                  {activeTaskModal.status !== "IN_REVIEW" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickStatusChange(activeTaskModal.id, activeTaskModal.numericId, "IN_REVIEW")
                      }
                      className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-all cursor-pointer shadow-xs"
                    >
                      Send for Review
                    </button>
                  )}
                  {activeTaskModal.status !== "DONE" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickStatusChange(activeTaskModal.id, activeTaskModal.numericId, "DONE")
                      }
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={14} />
                      <span>Mark as Completed</span>
                    </button>
                  )}
                  {activeTaskModal.status !== "BLOCKED" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickStatusChange(activeTaskModal.id, activeTaskModal.numericId, "BLOCKED")
                      }
                      className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-all cursor-pointer shadow-2xs"
                    >
                      Mark as Blocked
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
