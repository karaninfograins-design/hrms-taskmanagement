"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase, Plus, Search, Pencil, Trash2, CheckCircle2, XCircle, X, Layers, Filter, Shield, ShieldCheck, UserCheck, Users, Check, Save,
  Lock, Eye, Edit3, PlusCircle, Sliders, FolderKanban, Zap, CheckSquare, MessageSquare, Building2, BarChart3, AlertCircle, Info, RefreshCw, KeyRound, Sparkles,
  Calendar, Clock, LayoutDashboard
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  createPermission,
  createRole,
  updateRole,
  deleteDesignation,
  deleteRole,
  getDesignations,
  getRoles,
  saveDesignation,
  saveRolePermissions,
  type Designation,
  type Permission,
  type Role
} from "@/services/workspace.service";
import { showConfirmDialog, showErrorToast, showSuccessToast } from "@/lib/swal";
import { useAuth } from "@/hooks/use-auth";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const { session, isLoading, logout } = useAuth();
  if (isLoading || !session) return <main className="route-loading">Loading your workspace...</main>;
  const signOut = () => { logout(); router.replace("/"); };
  return <main className="app-shell"><Navbar user={session.user} onSignOut={signOut} /><div className="dashboard-frame"><Sidebar user={session.user} canCreateAdmins={session.user.role === "SUPER_ADMIN"} onSignOut={signOut} /><section className="dashboard-content">{children}</section></div></main>;
}

export function DesignationManager({ embedded = false }: { embedded?: boolean } = {}) {
  const { session } = useAuth();
  const [items, setItems] = useState<Designation[]>([]);
  const [form, setForm] = useState<Partial<Designation>>({ status: true });
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = () =>
    session?.token &&
    getDesignations(session.token)
      .then(({ items }) => setItems(items))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [session?.token]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token) return;
    setIsSubmitting(true);
    setError("");
    try {
      await saveDesignation(
        {
          ...form,
          name: form.name?.trim(),
          description: form.description?.trim() || null,
          status: form.status !== undefined ? form.status : true,
        },
        session.token
      );
      setForm({ status: true });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save designation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (item: Designation) => {
    setForm(item);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setForm({ status: true });
    setError("");
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && item.status) ||
        (statusFilter === "INACTIVE" && !item.status);

      return matchesSearch && matchesStatus;
    });
  }, [items, searchQuery, statusFilter]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const activeCount = items.filter((item) => item.status).length;
  const inactiveCount = items.filter((item) => !item.status).length;

  const bodyContent = (
    <div className="space-y-6">
      {!embedded && (
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#172554] via-[#1e3a6f] to-slate-900 px-5 py-6 text-white shadow-md sm:px-7">
          <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-2 -top-14 h-52 w-52 rounded-full border border-white/10" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-100">
                <Briefcase size={12} />
                Organization Structure
              </div>
              <h1 className="text-xl font-black tracking-tight sm:text-2xl">Designations & Job Titles</h1>
              <p className="mt-1 text-xs text-blue-100/80">
                Define job titles, role descriptions, and organizational designations for employees.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-white">
                <Layers className="w-3.5 h-3.5 text-blue-200" />
                {items.length} Total Titles
              </span>
            </div>
          </div>
        </header>
      )}

      {/* Stat Overview Cards */}
      {/* < div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all cursor-pointer ${statusFilter === "ALL"
              ? "bg-white border-slate-400 shadow-sm ring-1 ring-slate-400/20"
              : "bg-white border-slate-200/80 hover:border-slate-300"
              }`}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <Briefcase size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Designations</p>
              <p className="text-xl font-black text-slate-900 leading-tight">{items.length}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("ACTIVE")}
            className={`flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all cursor-pointer ${statusFilter === "ACTIVE"
              ? "bg-white border-slate-400 shadow-sm ring-1 ring-slate-400/20"
              : "bg-white border-slate-200/80 hover:border-slate-300"
              }`}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <CheckCircle2 size={18} className="text-emerald-700" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Titles</p>
              <p className="text-xl font-black text-slate-900 leading-tight">{activeCount}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("INACTIVE")}
            className={`flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all cursor-pointer ${statusFilter === "INACTIVE"
              ? "bg-white border-slate-400 shadow-sm ring-1 ring-slate-400/20"
              : "bg-white border-slate-200/80 hover:border-slate-300"
              }`}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
              <XCircle size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Inactive Titles</p>
              <p className="text-xl font-black text-slate-900 leading-tight">{inactiveCount}</p>
            </div>
          </button>
        </div> */}

      {/* Create / Edit Designation Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-900"></span>
            <h2 className="text-sm font-bold text-slate-900">
              {form.id ? `Edit Designation: ${form.name}` : "Add New Designation"}
            </h2>
          </div>
          {form.id && (
            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              Editing Mode
            </span>
          )}
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "0px",
                  marginBottom: "6px",
                }}
                className="!flex !flex-row !items-center !gap-1.5 !m-0 !mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap"
              >
                <span>Designation Title</span>
                <span className="text-rose-500 font-bold" style={{ display: "inline" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Senior Software Engineer"
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full h-10 px-3.5 text-xs bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-slate-400/20 text-slate-900 font-medium placeholder:text-slate-400"
              />
            </div>

            <div>
              <label
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "0px",
                  marginBottom: "6px",
                }}
                className="!flex !flex-row !items-center !gap-1.5 !m-0 !mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap"
              >
                <span>Role Description</span>
                <span className="text-slate-400 font-normal lowercase" style={{ display: "inline" }}>(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Brief summary of department or responsibilities"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full h-10 px-3.5 text-xs bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-slate-400/20 text-slate-900 font-medium placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {form.id && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-9 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-1.5 px-5 h-9 text-xs font-bold text-white bg-[#172554] hover:bg-[#1e3a6f] rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "Saving..." : form.id ? "Save Changes" : "Add Designation"}</span>
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50/70 border border-rose-200/80 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}
      </div>

      {/* Designations List Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* List Search & Filter Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/40">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Search designations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 !pl-10 pr-8 text-xs bg-white border border-slate-200 focus:border-slate-400 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-slate-400/20 text-slate-900 placeholder:text-slate-400"
              style={{ paddingLeft: "40px" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer shrink-0 ${statusFilter === filter
                  ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
              >
                <span>{filter === "ALL" ? "All" : filter === "ACTIVE" ? "Active" : "Inactive"}</span>
                <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[9px] ${statusFilter === filter ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                  {filter === "ALL" ? items.length : filter === "ACTIVE" ? activeCount : inactiveCount}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table List Rows */}
        {paginatedItems.length === 0 ? (
          <div className="text-center py-14 px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Briefcase className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-700">No designations found</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery || statusFilter !== "ALL"
                ? "Try adjusting your search query or status filter."
                : "Get started by adding your first designation above."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {paginatedItems.map((item) => (
              <div
                key={item.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-600 shrink-0 font-bold text-xs uppercase group-hover:border-slate-300 transition-colors">
                    {item.name.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm font-bold text-slate-900 group-hover:text-slate-950">
                        {item.name}
                      </strong>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${item.status
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${item.status ? "bg-emerald-500" : "bg-slate-400"}`}></span>
                        {item.status ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                      {item.description || "No description provided"}
                    </p>
                  </div>
                </div>

                {/* Clean, Modern Action Buttons (No bright/loud colors) */}
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  {/* Modern Edit Button */}
                  <button
                    type="button"
                    onClick={() => handleStartEdit(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer"
                    title={`Edit ${item.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-500" />
                    <span>Edit</span>
                  </button>

                  {/* Modern Delete Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!session?.token) return;
                      const confirmed = await showConfirmDialog({
                        title: "Delete Designation?",
                        text: `Are you sure you want to delete designation "${item.name}"?`,
                        confirmButtonText: "Yes, Delete",
                        cancelButtonText: "Cancel",
                      });
                      if (confirmed) {
                        await deleteDesignation(item.id, session.token);
                        load();
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer"
                    title={`Delete ${item.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600 transition-colors" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Toolbar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/30">
            <div className="text-xs text-slate-500 text-center sm:text-left">
              Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to{" "}
              <strong>{Math.min(currentPage * pageSize, filteredItems.length)}</strong> of{" "}
              <strong>{filteredItems.length}</strong> designations
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-all cursor-pointer"
              >
                ‹ Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  className={`min-w-[28px] h-7 px-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${p === currentPage
                    ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-all cursor-pointer"
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return bodyContent;
  }

  return (
    <DashboardShell>
      {bodyContent}
    </DashboardShell>
  );
}

interface DomainAction {
  type: "create" | "read" | "update" | "delete" | "approve";
  letter: string;
  label: string;
  keys: string[];
  desc: string;
}

interface PermissionDomain {
  id: string;
  title: string;
  icon: any;
  description: string;
  actions: DomainAction[];
}

const PERMISSION_DOMAINS: PermissionDomain[] = [
  {
    id: "employees",
    title: "Employees & Directory",
    icon: Users,
    description: "Employee directory, profiles and lifecycle control",
    actions: [
      { type: "create", letter: "C", label: "Create", keys: ["employee:create"], desc: "Create employee profiles" },
      { type: "read", letter: "R", label: "View", keys: ["employee:view"], desc: "View employee profiles and directory" },
      { type: "update", letter: "U", label: "Edit", keys: ["employee:edit"], desc: "Edit employee profiles" },
      { type: "delete", letter: "D", label: "Delete", keys: ["employee:delete"], desc: "Delete employee profiles" },
      { type: "approve", letter: "A", label: "Approve", keys: ["employee:approve", "MANAGE_EMPLOYEES"], desc: "Approve profile changes & promotions" },
    ],
  },
  {
    id: "projects",
    title: "Projects & Workspaces",
    icon: FolderKanban,
    description: "Project workspaces, configurations and memberships",
    actions: [
      { type: "create", letter: "C", label: "Create", keys: ["project:create", "CREATE_PROJECTS"], desc: "Create new client and internal projects" },
      { type: "read", letter: "R", label: "View", keys: ["project:view"], desc: "Browse workspace projects" },
      { type: "update", letter: "U", label: "Edit", keys: ["project:edit", "project:manage_members"], desc: "Update project metadata and members" },
      { type: "delete", letter: "D", label: "Delete", keys: ["project:delete"], desc: "Archive or delete projects" },
      { type: "approve", letter: "A", label: "Approve", keys: ["project:approve", "MANAGE_PROJECTS"], desc: "Approve project completions and milestones" },
    ],
  },
  {
    id: "sprints",
    title: "Sprints & Backlogs",
    icon: Zap,
    description: "Agile sprints, backlogs and iteration cycles",
    actions: [
      { type: "create", letter: "C", label: "Create", keys: ["sprint:create", "CREATE_SPRINTS"], desc: "Plan and create agile sprints" },
      { type: "read", letter: "R", label: "View", keys: ["sprint:view", "backlog:view"], desc: "View current and past sprint backlogs" },
      { type: "update", letter: "U", label: "Edit", keys: ["sprint:edit", "sprint:start_complete", "backlog:manage"], desc: "Modify sprint scopes, statuses and dates" },
      { type: "delete", letter: "D", label: "Delete", keys: ["sprint:delete"], desc: "Cancel or remove planned sprints" },
      { type: "approve", letter: "A", label: "Approve", keys: ["sprint:approve", "MANAGE_SPRINTS"], desc: "Approve sprint releases and completions" },
    ],
  },
  {
    id: "work_items",
    title: "Work Items & Tasks",
    icon: CheckSquare,
    description: "Epics, stories, tasks, bugs and task assignments",
    actions: [
      { type: "create", letter: "C", label: "Create", keys: ["work_item:create", "CREATE_WORK_ITEMS", "epic:create"], desc: "Create tasks, bugs, epics, or user stories" },
      { type: "read", letter: "R", label: "View", keys: ["work_item:view", "VIEW_WORK_ITEMS", "epic:view"], desc: "Browse tasks, epics and backlog items" },
      { type: "update", letter: "U", label: "Edit", keys: ["work_item:edit", "work_item:status_transition", "epic:edit"], desc: "Update task descriptions, estimates, and statuses" },
      { type: "delete", letter: "D", label: "Delete", keys: ["work_item:delete", "epic:delete"], desc: "Permanently delete work items and epics" },
      { type: "approve", letter: "A", label: "Assign", keys: ["work_item:approve", "ASSIGN_WORK", "MANAGE_WORK_ITEMS", "MANAGE_EPICS"], desc: "Assign work items and approve completions" },
    ],
  },
  {
    id: "discussions",
    title: "Comments & Discussions",
    icon: MessageSquare,
    description: "Ticket discussions, comments and collaboration",
    actions: [
      { type: "create", letter: "C", label: "Post", keys: ["comment:create"], desc: "Post comments and ticket updates" },
      { type: "read", letter: "R", label: "View", keys: ["comment:view"], desc: "Read comments and discussions" },
      { type: "update", letter: "U", label: "Edit", keys: ["comment:edit"], desc: "Edit comments" },
      { type: "delete", letter: "D", label: "Moderate", keys: ["comment:delete"], desc: "Delete comments or remove spam" },
    ],
  },
  {
    id: "leaves",
    title: "Leaves & Time-Off",
    icon: Calendar,
    description: "Leave applications, balances and approvals",
    actions: [
      { type: "create", letter: "C", label: "Apply", keys: ["leave:create"], desc: "Apply for leaves" },
      { type: "read", letter: "R", label: "View", keys: ["leave:view"], desc: "View leave requests and calendar" },
      { type: "update", letter: "U", label: "Edit", keys: ["leave:edit"], desc: "Edit leave applications" },
      { type: "delete", letter: "D", label: "Cancel", keys: ["leave:delete"], desc: "Cancel / delete leave requests" },
      { type: "approve", letter: "A", label: "Approve", keys: ["leave:approve"], desc: "Approve or reject employee leave requests" },
    ],
  },
  {
    id: "attendance",
    title: "Attendance & Shifts",
    icon: Clock,
    description: "Clock-in records, regularizations and approvals",
    actions: [
      { type: "create", letter: "C", label: "Clock-In", keys: ["attendance:create"], desc: "Clock-in / record daily attendance" },
      { type: "read", letter: "R", label: "View", keys: ["attendance:view"], desc: "View attendance logs and timesheets" },
      { type: "update", letter: "U", label: "Edit", keys: ["attendance:edit"], desc: "Regularize attendance logs" },
      { type: "approve", letter: "A", label: "Approve", keys: ["attendance:approve"], desc: "Approve attendance regularization" },
    ],
  },
  {
    id: "settings",
    title: "HR Policies & Settings",
    icon: Building2,
    description: "Company policies, shift rules and system criteria",
    actions: [
      { type: "read", letter: "R", label: "View", keys: ["settings:view"], desc: "View company settings and policies" },
      { type: "update", letter: "U", label: "Edit", keys: ["settings:edit"], desc: "Edit company criteria and shifts" },
      { type: "approve", letter: "A", label: "Manage", keys: ["MANAGE_SETTINGS"], desc: "Full control over company settings" },
    ],
  },
  {
    id: "dashboard",
    title: "Executive Dashboard",
    icon: LayoutDashboard,
    description: "Main workspace dashboard overview, metrics and analytics",
    actions: [
      { type: "read", letter: "R", label: "View", keys: ["dashboard:view", "VIEW_DASHBOARD"], desc: "View main workspace dashboard and metrics" },
      { type: "update", letter: "U", label: "Edit", keys: ["dashboard:edit", "MANAGE_DASHBOARD"], desc: "Edit dashboard metrics and KPI targets" },
    ],
  },
  {
    id: "reports",
    title: "Reports & Analytics",
    icon: BarChart3,
    description: "Productivity, attendance and workspace metrics",
    actions: [
      { type: "read", letter: "R", label: "View", keys: ["report:view", "VIEW_REPORTS"], desc: "View system reports and analytics" },
      { type: "approve", letter: "A", label: "Portal", keys: ["EMPLOYEE"], desc: "Base employee portal access privileges" },
    ],
  },
  {
    id: "administration",
    title: "Administration & Roles",
    icon: ShieldCheck,
    description: "System administration, sub-role authoring and security",
    actions: [
      { type: "create", letter: "C", label: "Create", keys: ["admin:create"], desc: "Create administrative users" },
      { type: "read", letter: "R", label: "View", keys: ["admin:view"], desc: "View administrative accounts" },
      { type: "update", letter: "U", label: "Edit", keys: ["admin:edit"], desc: "Edit administrative credentials" },
      { type: "delete", letter: "D", label: "Delete", keys: ["admin:delete"], desc: "Deactivate administrative accounts" },
      { type: "approve", letter: "A", label: "Govern", keys: ["admin:role_manage", "MANAGE_ROLES", "MANAGE_PERMISSIONS", "MANAGE_USERS"], desc: "Manage roles, permissions, and security" },
    ],
  },
];

const ROLE_PRESETS = [
  { name: "HR", description: "Human Resources manager with people, onboarding and leave policies access" },
  { name: "PROJECT_MANAGER", description: "Oversees projects, backlogs, sprints, task delegation and deliveries" },
  { name: "TEAM_LEAD", description: "Technical leader managing sprints, code reviews, and work item assignments" },
  { name: "BUSINESS_ANALYST", description: "Creates user stories, epics, business requirements and task backlogs" },
  { name: "CTO", description: "Chief Technology Officer overseeing technical governance, sprint roadmaps and architecture" },
  { name: "QA_ENGINEER", description: "Quality assurance engineer verifying bugs, testing tasks and approving release criteria" },
];

export function RolesPermissionManager() {
  const { session } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleId, setRoleId] = useState<number>();
  const [selected, setSelected] = useState<string[]>([]);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Sub-Role Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editRoleName, setEditRoleName] = useState("");
  const [editRoleDescription, setEditRoleDescription] = useState("");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const userPermissions = useMemo(() => Array.isArray(session?.user?.permissions) ? session.user.permissions : [], [session?.user?.permissions]);
  const roleName = typeof session?.user?.role === "string" ? session.user.role : (session?.user?.role as any)?.name;
  const isSuperAdmin = roleName === "SUPER_ADMIN" || (session?.user?.role as any) === 1;
  const isAdmin = roleName === "ADMIN";
  const canViewRoles = isSuperAdmin || isAdmin || userPermissions.includes("VIEW_PERMISSIONS") || userPermissions.includes("MANAGE_PERMISSIONS") || userPermissions.includes("MANAGE_ROLES") || userPermissions.includes("admin:role_manage");
  const canManageRoles = isSuperAdmin || isAdmin || userPermissions.includes("MANAGE_PERMISSIONS") || userPermissions.includes("MANAGE_ROLES") || userPermissions.includes("admin:role_manage");

  // Filter items if searching (placed unconditionally to satisfy React Rules of Hooks)
  const filteredDomains = useMemo(() => {
    if (!searchQuery.trim()) return PERMISSION_DOMAINS;
    const query = searchQuery.toLowerCase();
    return PERMISSION_DOMAINS.map((domain) => {
      const matchesDomain =
        domain.title.toLowerCase().includes(query) ||
        domain.description.toLowerCase().includes(query);
      const matchingActions = domain.actions.filter(
        (action) =>
          action.label.toLowerCase().includes(query) ||
          action.letter.toLowerCase().includes(query) ||
          action.desc.toLowerCase().includes(query) ||
          action.keys.some((k) => k.toLowerCase().includes(query))
      );
      if (matchesDomain) return domain;
      if (matchingActions.length > 0) {
        return { ...domain, actions: matchingActions };
      }
      return null;
    }).filter((d): d is PermissionDomain => d !== null);
  }, [searchQuery]);

  const load = () => {
    if (!session?.token) return;
    getRoles(session.token)
      .then(({ roles, permissions }) => {
        setAccessDenied(null);
        setRoles(roles);
        setPermissions(permissions);
        if (!roleId && roles[0]) {
          setRoleId(roles[0].id);
          setSelected(roles[0].permissionIds);
        } else if (roleId) {
          const current = roles.find((r) => r.id === roleId);
          if (current) setSelected(current.permissionIds);
        }
      })
      .catch((err) => {
        const errorText = err instanceof Error ? err.message : "Failed to load roles and permissions";
        if (
          errorText.toLowerCase().includes("permission") ||
          errorText.toLowerCase().includes("access") ||
          errorText.toLowerCase().includes("denied") ||
          errorText.toLowerCase().includes("403")
        ) {
          setAccessDenied(errorText);
        } else {
          showErrorToast(errorText);
        }
      });
  };

  useEffect(() => {
    load();
  }, [session?.token]);

  const activeRole = roles.find((item) => item.id === roleId);
  const isSelectedRoleSuperAdmin = activeRole?.name === "SUPER_ADMIN";
  const isSelectedRoleSystem = activeRole?.name === "SUPER_ADMIN" || activeRole?.name === "ADMIN";

  const chooseRole = (id: number) => {
    const next = roles.find((item) => item.id === id);
    setRoleId(id);
    setSelected(next?.permissionIds || []);
  };

  const toggleActionKeys = (keys: string[]) => {
    if (!canManageRoles || isSelectedRoleSuperAdmin) return;
    const isAnyActive = keys.some((k) => selected.includes(k));
    if (isAnyActive) {
      setSelected((current) => current.filter((k) => !keys.includes(k)));
    } else {
      setSelected((current) => Array.from(new Set([...current, ...keys])));
    }
  };

  const toggleAllDomainActions = (domain: PermissionDomain) => {
    if (!canManageRoles || isSelectedRoleSuperAdmin) return;
    const allDomainKeys = domain.actions.flatMap((a) => a.keys);
    const allSelected = allDomainKeys.every((k) => selected.includes(k));

    if (allSelected) {
      setSelected((current) => current.filter((k) => !allDomainKeys.includes(k)));
    } else {
      setSelected((current) => Array.from(new Set([...current, ...allDomainKeys])));
    }
  };

  const savePermissions = async () => {
    if (!session?.token || !roleId || !canManageRoles) return;
    if (isSelectedRoleSuperAdmin) {
      showErrorToast("SUPER_ADMIN permissions are permanently unrestricted.");
      return;
    }
    setIsSaving(true);
    try {
      const numericIds = permissions
        .filter((p) => selected.includes(p.name))
        .map((p) => p.id);

      await saveRolePermissions(roleId, numericIds, session.token);
      showSuccessToast(`Permissions updated for ${activeRole?.name || "role"}`);
      load();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to update permissions");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSubRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token || !canManageRoles || !newRoleName.trim()) return;
    setIsCreatingRole(true);
    try {
      const res = await createRole(newRoleName.trim(), newRoleDescription.trim(), session.token);
      showSuccessToast(`Sub-role "${res.role.name}" created!`);
      setShowCreateModal(false);
      setNewRoleName("");
      setNewRoleDescription("");
      load();
      if (res.role?.id) {
        setRoleId(res.role.id);
        setSelected([]);
      }
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to create sub-role");
    } finally {
      setIsCreatingRole(false);
    }
  };

  const handleUpdateSubRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token || !editingRole || !editRoleName.trim()) return;
    setIsUpdatingRole(true);
    try {
      await updateRole(
        editingRole.id,
        { name: editRoleName.trim(), description: editRoleDescription.trim() },
        session.token
      );
      showSuccessToast("Sub-role updated successfully!");
      setEditingRole(null);
      load();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to update sub-role");
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleDeleteSubRole = async (targetRole: Role) => {
    if (!session?.token || !canManageRoles) return;
    if (targetRole.name === "SUPER_ADMIN" || targetRole.name === "ADMIN") {
      showErrorToast("System core roles cannot be deleted.");
      return;
    }
    if ((targetRole.userCount || 0) > 0) {
      showErrorToast(`Cannot delete role: ${targetRole.userCount} active user(s) assigned.`);
      return;
    }

    const confirmed = await showConfirmDialog({
      title: `Delete sub-role "${targetRole.name}"?`,
      text: "This will permanently remove this sub-role and its permission assignments.",
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#dc2626",
    });

    if (confirmed) {
      try {
        await deleteRole(targetRole.id, session.token);
        showSuccessToast(`Sub-role "${targetRole.name}" removed.`);
        if (roleId === targetRole.id) {
          setRoleId(roles[0]?.id);
        }
        load();
      } catch (err) {
        showErrorToast(err instanceof Error ? err.message : "Failed to delete sub-role");
      }
    }
  };

  // Group roles into System Core and Dynamic Sub-Roles
  const systemRoles = roles.filter((r) => r.name === "SUPER_ADMIN" || r.name === "ADMIN");
  const subRoles = roles.filter((r) => r.name !== "SUPER_ADMIN" && r.name !== "ADMIN");

  if (accessDenied || (!canViewRoles && !isSuperAdmin)) {
    return (
      <DashboardShell>
        <div className="p-6 max-w-4xl mx-auto">
          <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-900 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <h3 className="text-lg font-bold">Access Denied</h3>
            </div>
            <p className="text-sm text-red-700">
              {accessDenied || "You do not have the required permissions to view or manage role configurations. Please contact your Super Administrator."}
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="w-full space-y-5 pb-28">
        {/* Standard Global Welcome Header */}
        <div className="welcome" style={{ marginBottom: "16px" }}>
          <p className="eyebrow">ACCESS GOVERNANCE</p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Roles & Permissions</h3>
              <span className="text-xs text-slate-500 font-medium">
                Manage system core roles and configure dynamic sub-roles with granular CRUD and operational permissions.
              </span>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              {canManageRoles && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Sub-Role</span>
                </button>
              )}
              <button
                type="button"
                onClick={load}
                className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-slate-600 transition"
                title="Refresh Roles"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Horizontal Role Selection Tabs Bar */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Roles & Sub-Roles
            </h2>
            <span className="text-xs text-slate-400 font-medium">
              ({roles.length} total • {systemRoles.length} Core, {subRoles.length} Custom)
            </span>
          </div>

          {/* Horizontal Scrollable Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {roles.map((r) => {
              const isSelected = r.id === roleId;
              const isSystem = r.name === "SUPER_ADMIN" || r.name === "ADMIN";
              const isSuper = r.name === "SUPER_ADMIN";

              return (
                <div
                  key={r.id}
                  onClick={() => chooseRole(r.id)}
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition select-none ${isSelected
                    ? "bg-slate-800 text-white border-slate-700 shadow-xs"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300"
                    }`}
                >
                  {isSystem ? (
                    <Lock className={`w-3.5 h-3.5 ${isSelected ? "text-slate-300" : "text-slate-400"}`} />
                  ) : (
                    <Shield className={`w-3.5 h-3.5 ${isSelected ? "text-slate-300" : "text-slate-400"}`} />
                  )}

                  <span className="font-semibold tracking-tight">
                    {r.name.replace(/_/g, " ")}
                  </span>

                  {isSuper && <Sparkles className={`w-3 h-3 ${isSelected ? "text-amber-300" : "text-amber-500"}`} />}

                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isSelected
                      ? "bg-slate-700 text-slate-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200/60"
                      }`}
                  >
                    {r.userCount || 0}
                  </span>

                  {/* Actions for custom sub-roles */}
                  {!isSystem && canManageRoles && (
                    <div
                      className={`flex items-center gap-0.5 ml-1 border-l pl-1.5 ${isSelected ? "border-slate-600" : "border-slate-200"
                        }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRole(r);
                          setEditRoleName(r.name);
                          setEditRoleDescription(r.description || "");
                        }}
                        className={`p-0.5 rounded transition ${isSelected ? "text-slate-300 hover:text-white" : "text-slate-400 hover:text-slate-800"
                          }`}
                        title="Rename sub-role"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubRole(r)}
                        className={`p-0.5 rounded transition ${isSelected ? "text-rose-300 hover:text-rose-100" : "text-slate-400 hover:text-rose-600"
                          }`}
                        title="Delete sub-role"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Permissions Configuration Area */}
        <div className="space-y-4">
          {/* Active Role Banner & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center font-bold text-sm">
                {activeRole?.name?.[0] || "R"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {activeRole?.name?.replace(/_/g, " ") || "Select a role"}
                  </h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {isSelectedRoleSystem ? "System Core" : "Custom Sub-Role"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isSelectedRoleSuperAdmin
                    ? "SUPER_ADMIN has permanently active full access across all modules."
                    : `${selected.length} of ${permissions.length} total permissions enabled.`}
                </p>
              </div>
            </div>

            {/* Clean, Non-overlapping Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <input
                type="text"
                placeholder="Search permissions or CRUD..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "38px", paddingRight: "32px", height: "38px" }}
                className="w-full text-xs bg-slate-50/80 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white text-slate-800 transition placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Superadmin Note */}
          {isSelectedRoleSuperAdmin && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs font-medium">
              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                <strong>System Protected Role:</strong> The SUPER_ADMIN account possesses non-revocable root permissions to safeguard workspace integrity. All switches below reflect permanently active capabilities.
              </span>
            </div>
          )}

          {/* Compact CRUD + Approve Small Cards Grid with Slider Switches */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredDomains.map((domain) => {
              const IconComponent = domain.icon;
              const allDomainKeys = domain.actions.flatMap((a) => a.keys);
              const allSelected = allDomainKeys.every((k) => selected.includes(k) || isSelectedRoleSuperAdmin);
              const activeCount = domain.actions.filter((a) =>
                isSelectedRoleSuperAdmin || a.keys.some((k) => selected.includes(k))
              ).length;

              return (
                <div
                  key={domain.id}
                  className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3 hover:border-slate-300 transition flex flex-col justify-between"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="font-bold text-xs text-slate-800 truncate" title={domain.title}>
                        {domain.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {activeCount}/{domain.actions.length}
                      </span>
                      {!isSelectedRoleSuperAdmin && canManageRoles && (
                        <button
                          type="button"
                          onClick={() => toggleAllDomainActions(domain)}
                          className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 transition"
                        >
                          {allSelected ? "Clear" : "All"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* CRUD Action Items with Sleek Slider Buttons */}
                  <div className={`grid gap-1 pt-0.5 ${domain.actions.length === 5 ? "grid-cols-5" : domain.actions.length === 4 ? "grid-cols-4" : domain.actions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                    {domain.actions.map((act) => {
                      const isActive = isSelectedRoleSuperAdmin || act.keys.some((k) => selected.includes(k));

                      return (
                        <div
                          key={act.type}
                          onClick={() => {
                            if (!isSelectedRoleSuperAdmin && canManageRoles) {
                              toggleActionKeys(act.keys);
                            }
                          }}
                          title={`${act.letter} - ${act.label}: ${act.desc}`}
                          className={`py-2 px-1 rounded-lg border transition-all flex flex-col items-center justify-between text-center select-none ${isSelectedRoleSuperAdmin
                            ? "cursor-default bg-slate-50/70 border-slate-200/90"
                            : !canManageRoles
                              ? "cursor-not-allowed opacity-60 bg-slate-50 border-slate-200/60"
                              : isActive
                                ? "cursor-pointer bg-emerald-50/50 border-emerald-200/90 hover:bg-emerald-50/80 hover:border-emerald-300"
                                : "cursor-pointer bg-slate-50/50 border-slate-200/70 hover:bg-slate-100/60 hover:border-slate-300"
                            }`}
                        >
                          {/* Action Letter & Label */}
                          <div className="flex flex-col items-center leading-tight mb-1.5">
                            <span
                              className={`text-[11px] font-black tracking-tight ${isActive ? "text-slate-900" : "text-slate-500"
                                }`}
                            >
                              {act.letter}
                            </span>
                            <span
                              className={`text-[9.5px] truncate max-w-full font-semibold ${isActive ? "text-emerald-700" : "text-slate-400"
                                }`}
                            >
                              {act.label}
                            </span>
                          </div>

                          {/* Slider Button / Toggle Switch */}
                          <div
                            className={`w-7 h-3.5 flex items-center rounded-full p-0.5 transition-colors duration-200 shrink-0 ${isActive
                              ? "bg-emerald-600 justify-end"
                              : "bg-slate-300/80 justify-start"
                              }`}
                          >
                            <div className="bg-white w-2.5 h-2.5 rounded-full shadow-xs transform transition-transform" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating Action Dock */}
          {canManageRoles && !isSelectedRoleSuperAdmin && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] sm:w-[620px] z-30 bg-slate-900/95 backdrop-blur-md text-white rounded-xl px-4 py-2.5 shadow-xl border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  ✓
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    {activeRole?.name?.replace(/_/g, " ")}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {selected.length} permissions enabled
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const original = roles.find((r) => r.id === roleId);
                    setSelected(original?.permissionIds || []);
                  }}
                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded transition"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={savePermissions}
                  disabled={isSaving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 text-white" />
                      <span>Save & Apply Permissions</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Create Sub-Role */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900">Create New Sub-Role</h3>
                    <p className="text-xs text-slate-500">Add a dynamic functional role to your workspace</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Suggested Presets (Click to Auto-fill)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setNewRoleName(preset.name);
                        setNewRoleDescription(preset.description);
                      }}
                      className="px-2.5 py-1 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-medium transition"
                    >
                      {preset.name.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleCreateSubRole} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Role Identifier / Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PROJECT_MANAGER, HR, TEAM_LEAD"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value.toUpperCase())}
                    className="w-full px-3 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 uppercase"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Will be stored in uppercase formatted as an access identifier.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Role Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Describe what responsibilities this role has..."
                    value={newRoleDescription}
                    onChange={(e) => setNewRoleDescription(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingRole || !newRoleName.trim()}
                    className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg shadow-xs transition flex items-center gap-1.5"
                  >
                    {isCreatingRole ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>Create Sub-Role</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Sub-Role */}
        {editingRole && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
                    <Pencil className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900">Edit Sub-Role</h3>
                    <p className="text-xs text-slate-500">Update title and description</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRole(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateSubRole} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editRoleName}
                    onChange={(e) => setEditRoleName(e.target.value.toUpperCase())}
                    className="w-full px-3 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 uppercase"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Role Description
                  </label>
                  <textarea
                    rows={2}
                    value={editRoleDescription}
                    onChange={(e) => setEditRoleDescription(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingRole(null)}
                    className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingRole || !editRoleName.trim()}
                    className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg shadow-xs transition flex items-center gap-1.5"
                  >
                    {isUpdatingRole ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
