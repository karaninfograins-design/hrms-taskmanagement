"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/workspace/management-pages";
import { useAuth } from "@/hooks/use-auth";
import { showConfirmDialog } from "@/lib/swal";
import {
  getWorkspaceList,
  createWorkspaceItem,
  deleteProject,
  type WorkspaceListItem,
} from "@/services/workspace.service";
import { Search, Plus, RefreshCw, Eye, Trash2 } from "lucide-react";

export default function ProjectsPage() {
  const router = useRouter();
  const { session } = useAuth();

  const [items, setItems] = useState<WorkspaceListItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const [form, setForm] = useState<{
    name?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>({
    type: "ACTIVE",
  });

  const loadProjects = useCallback(
    async (page: number = 1) => {
      if (!session?.token) return;
      try {
        const res = await getWorkspaceList("projects", session.token, {
          page,
          limit: pagination.limit,
        });
        setItems(res.items || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    },
    [session?.token, pagination.limit]
  );

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token || !form.name?.trim()) return;

    try {
      await createWorkspaceItem("projects", form as Record<string, string>, session.token);
      setShowForm(false);
      setForm({ type: "ACTIVE" });
      loadProjects(pagination.page);
    } catch (err: any) {
      console.error("Failed to create project:", err);
      alert(err.message || "Failed to create project.");
    }
  };

  const handleDeleteProject = async (id: number, name: string) => {
    if (!session?.token) return;

    const confirmed = await showConfirmDialog({
      title: "Delete Project?",
      text: `Are you sure you want to delete project "${name}"? This action cannot be undone.`,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#c2410c",
      icon: "warning",
    });
    if (!confirmed) return;

    try {
      await deleteProject(id, session.token);
      loadProjects(pagination.page);
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      alert(err.message || "Failed to delete project.");
    }
  };

  const isEmployeeRole = session?.user?.role === "EMPLOYEE";
  const userFilteredItems = isEmployeeRole
    ? items.filter((item: any) => {
      const uid = session?.user?.id;
      const uemail = session?.user?.email;
      const isMember =
        Array.isArray(item.members) &&
        item.members.some(
          (m: any) => (m.userId || m.user?.id) === uid || m.user?.email === uemail
        );
      const isAssigned = Array.isArray(item.assignedUserIds) && item.assignedUserIds.includes(uid);
      const isOwner = (item.createdBy?.id || item.createdById) === uid;
      return isMember || isAssigned || isOwner;
    })
    : items;

  const displayItems = userFilteredItems.filter((item: any) => {
    if (statusFilter === "ACTIVE" && String(item.status || "").toUpperCase() !== "ACTIVE") {
      return false;
    }
    if (
      statusFilter === "INACTIVE" &&
      !["INACTIVE", "COMPLETED", "CLOSED"].includes(String(item.status || "").toUpperCase())
    ) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = String(item.name || "").toLowerCase();
      const key = String(item.key || "").toLowerCase();
      const owner = String(item.owner || (item.createdBy?.name || "")).toLowerCase();
      const desc = String(item.description || "").toLowerCase();
      return name.includes(q) || key.includes(q) || owner.includes(q) || desc.includes(q);
    }
    return true;
  });

  return (
    <DashboardShell>
      {/* Top Header & Page Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#F97316]">
            WORK MANAGEMENT
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Projects
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Oversee organizational projects, milestones, assigned teams, and delivery timelines.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* <button
            type="button"
            onClick={() => loadProjects(pagination.page)}
            className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
            title="Refresh list"
          >
            <RefreshCw size={13} className="text-slate-500" />
            <span>Refresh</span>
          </button> */}

          <button
            type="button"
            className="h-9 px-4 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-extrabold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>{showForm ? "Cancel" : "+ Create Project"}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Create Project Form */}
      {showForm && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-sm mb-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Create New Project</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Configure your project title, status, duration, and core objectives.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleCreateProject} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Project Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter project title"
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full h-10 px-3.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 text-slate-900 font-medium placeholder-slate-400 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Project Status
                </label>
                <select
                  value={form.type || "ACTIVE"}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 text-slate-900 font-medium transition-all"
                >
                  <option value="ACTIVE">Active (Ongoing)</option>
                  <option value="INACTIVE">Inactive (Paused)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Start Date (Optional)
                </label>
                <input
                  type="date"
                  value={form.startDate || ""}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full h-10 px-3.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 text-slate-900 font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Deadline / End Date (Optional)
                </label>
                <input
                  type="date"
                  value={form.endDate || ""}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full h-10 px-3.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 text-slate-900 font-medium transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Description & Objectives
              </label>
              <textarea
                placeholder="Brief summary or goals..."
                value={form.description || ""}
                rows={3}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 text-slate-900 font-medium placeholder-slate-400 transition-all resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-extrabold text-xs shadow-xs transition cursor-pointer active:scale-95"
              >
                Save Project
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main List Container */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        {/* Search & Status Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Input with explicit padding-left to NEVER overlap the lens icon */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects by name, key, owner, or goals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: "42px" }}
              className="w-full h-9.5 !pl-11 pr-8 text-xs bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 text-slate-900 font-medium placeholder-slate-400 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Segmented Controls */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shadow-2xs self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${statusFilter === "ALL"
                ? "bg-[#ea580c] text-white shadow-xs font-extrabold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                }`}
            >
              <span>All</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${statusFilter === "ALL"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 text-slate-700"
                  }`}
              >
                {userFilteredItems.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${statusFilter === "ACTIVE"
                ? "bg-[#ea580c] text-white shadow-xs font-extrabold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                }`}
            >
              <span>Active</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${statusFilter === "ACTIVE"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 text-slate-700"
                  }`}
              >
                {
                  userFilteredItems.filter(
                    (i: any) => String(i.status || "").toUpperCase() === "ACTIVE"
                  ).length
                }
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("INACTIVE")}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${statusFilter === "INACTIVE"
                ? "bg-[#ea580c] text-white shadow-xs font-extrabold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                }`}
            >
              <span>Inactive</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${statusFilter === "INACTIVE"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 text-slate-700"
                  }`}
              >
                {
                  userFilteredItems.filter((i: any) =>
                    ["INACTIVE", "COMPLETED", "CLOSED"].includes(
                      String(i.status || "").toUpperCase()
                    )
                  ).length
                }
              </span>
            </button>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200">
                <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider text-[11px]">
                  Key
                </th>
                <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider text-[11px]">
                  Project Name
                </th>
                <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider text-[11px]">
                  Status
                </th>
                <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider text-[11px]">
                  Created By
                </th>
                <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider text-[11px]">
                  Owner
                </th>
                <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider text-[11px]">
                  Timeline
                </th>
                <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider text-[11px] text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 border border-orange-200/60 flex items-center justify-center mx-auto text-xl mb-2">
                      📁
                    </div>
                    <p className="text-sm font-bold text-slate-700">No projects found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {searchQuery
                        ? "Try adjusting your search query or status filter."
                        : isEmployeeRole
                          ? "You are not assigned to any projects yet."
                          : "Get started by creating your first project."}
                    </p>
                  </td>
                </tr>
              ) : (
                displayItems.map((item: any) => {
                  const isActive = String(item.status || "").toUpperCase() === "ACTIVE";
                  return (
                    <tr
                      key={String(item.id)}
                      className="hover:bg-orange-50/25 transition-colors group"
                    >
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-mono text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200/80 px-2.5 py-1 rounded-lg">
                          {String(item.key || "PRJ")}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="min-w-0 max-w-xs">
                          <strong
                            onClick={() => router.push(`/dashboard/projects/${item.id}`)}
                            className="font-extrabold text-slate-900 group-hover:text-orange-950 truncate block hover:underline cursor-pointer"
                          >
                            {String(item.name)}
                          </strong>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5 font-normal">
                              {String(item.description)}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                            : "bg-slate-100 text-slate-600 border-slate-200/80"
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"
                              }`}
                          />
                          <span>{isActive ? "Active" : "Inactive"}</span>
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <span>👤</span> {item.createdBy?.name || item.owner || "Admin"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        <span className="text-xs font-medium text-slate-600">
                          {String(item.owner || "Not assigned")}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="text-[11px] text-slate-600 flex flex-col">
                          <span className="font-semibold text-slate-700">
                            {item.startDate
                              ? new Date(String(item.startDate)).toLocaleDateString()
                              : "No start date"}
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            {item.endDate
                              ? `Ends ${new Date(String(item.endDate)).toLocaleDateString()}`
                              : "No deadline"}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => router.push(`/dashboard/projects/${item.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-extrabold text-[11px] transition-all cursor-pointer shadow-2xs hover:border-slate-300 active:scale-95"
                            title="View Project Details"
                          >
                            <Eye size={13} className="text-slate-500" />
                            <span>View</span>
                          </button>

                          <button
                            onClick={() => handleDeleteProject(Number(item.id), String(item.name))}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 font-extrabold text-[11px] transition-all cursor-pointer shadow-2xs hover:border-rose-300 active:scale-95"
                            title="Delete Project"
                          >
                            <Trash2 size={13} className="text-rose-400" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Project Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {displayItems.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm font-bold text-slate-700">No projects found</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Try adjusting your filters or create a new project.
              </p>
            </div>
          ) : (
            displayItems.map((item: any) => {
              const isActive = String(item.status || "").toUpperCase() === "ACTIVE";
              return (
                <div key={String(item.id)} className="py-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200/80 px-2 py-0.5 rounded">
                        {String(item.key || "PRJ")}
                      </span>
                      <h4
                        onClick={() => router.push(`/dashboard/projects/${item.id}`)}
                        className="font-extrabold text-slate-900 text-sm mt-1 truncate hover:underline cursor-pointer"
                      >
                        {String(item.name)}
                      </h4>
                      {item.description && (
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                          {String(item.description)}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${isActive
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                        : "bg-slate-100 text-slate-600 border-slate-200/80"
                        }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                      />
                      <span>{isActive ? "Active" : "Inactive"}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                        Created By
                      </span>
                      <span className="font-semibold text-slate-700 truncate block">
                        {item.createdBy?.name || item.owner || "Admin"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                        Owner
                      </span>
                      <span className="font-semibold text-slate-700 truncate block">
                        {String(item.owner || "Not assigned")}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                        Start Date
                      </span>
                      <span className="font-semibold text-slate-700">
                        {item.startDate
                          ? new Date(String(item.startDate)).toLocaleDateString()
                          : "Not set"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                        End Date
                      </span>
                      <span className="font-semibold text-slate-700">
                        {item.endDate
                          ? new Date(String(item.endDate)).toLocaleDateString()
                          : "Not set"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs active:scale-95 cursor-pointer"
                      onClick={() => router.push(`/dashboard/projects/${item.id}`)}
                      title="View Project Details"
                    >
                      <Eye size={13} className="text-slate-500" />
                      <span>View</span>
                    </button>
                    <button
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 font-bold text-xs shadow-2xs active:scale-95 cursor-pointer"
                      onClick={() => handleDeleteProject(Number(item.id), String(item.name))}
                      title="Delete Project"
                    >
                      <Trash2 size={13} className="text-rose-500" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <span className="text-xs text-slate-500 text-center sm:text-left">
              Showing page <strong>{pagination.page}</strong> of{" "}
              <strong>{pagination.totalPages}</strong> ({pagination.total} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => pagination.page > 1 && loadProjects(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${pagination.page <= 1
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer shadow-2xs active:scale-95"
                  }`}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  pagination.page < pagination.totalPages && loadProjects(pagination.page + 1)
                }
                disabled={pagination.page >= pagination.totalPages}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${pagination.page >= pagination.totalPages
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer shadow-2xs active:scale-95"
                  }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
