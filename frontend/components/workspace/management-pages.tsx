"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Plus, Search, Pencil, Trash2, CheckCircle2, XCircle, X, Layers, Filter, Shield, ShieldCheck, UserCheck, Users, Check, Save } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { createPermission, deleteDesignation, deleteRole, getDesignations, getRoles, saveDesignation, saveRolePermissions, type Designation, type Permission, type Role } from "@/services/workspace.service";
import { useAuth } from "@/hooks/use-auth";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const { session, isLoading, logout } = useAuth();
  if (isLoading || !session) return <main className="route-loading">Loading your workspace...</main>;
  const signOut = () => { logout(); router.replace("/"); };
  return <main className="app-shell"><Navbar user={session.user} onSignOut={signOut} /><div className="dashboard-frame"><Sidebar user={session.user} canCreateAdmins={session.user.role === "SUPER_ADMIN"} onSignOut={signOut} /><section className="dashboard-content">{children}</section></div></main>;
}

export function DesignationManager() {
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

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Modern Enterprise Header */}
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
                        if (
                          session?.token &&
                          confirm(`Are you sure you want to delete designation "${item.name}"?`)
                        ) {
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
    </DashboardShell>
  );
}

export function RolesPermissionManager() {
  const { session } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleId, setRoleId] = useState<number>();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [permissionName, setPermissionName] = useState("");
  const [permissionDescription, setPermissionDescription] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const userPermissions = useMemo(() => Array.isArray(session?.user?.permissions) ? session.user.permissions : [], [session?.user?.permissions]);
  const roleName = typeof session?.user?.role === "string" ? session.user.role : (session?.user?.role as any)?.name;
  const isSuperAdmin = roleName === "SUPER_ADMIN" || (session?.user?.role as any) === 1;
  const canViewRoles = isSuperAdmin || userPermissions.includes("VIEW_PERMISSIONS") || userPermissions.includes("MANAGE_PERMISSIONS") || userPermissions.includes("MANAGE_ROLES") || userPermissions.includes("admin:role_manage");
  const canManageRoles = isSuperAdmin || userPermissions.includes("MANAGE_PERMISSIONS") || userPermissions.includes("MANAGE_ROLES") || userPermissions.includes("admin:role_manage");

  const pageSize = 10;
  const totalPages = Math.ceil(permissions.length / pageSize);
  const paginatedPermissions = permissions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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
          setMessage(errorText);
        }
      });
  };

  useEffect(() => {
    load();
  }, [session?.token]);

  const role = roles.find((item) => item.id === roleId);

  const choose = (id: number) => {
    const next = roles.find((item) => item.id === id);
    setRoleId(id);
    setSelected(next?.permissionIds || []);
    setMessage("");
  };

  const toggle = (name: string) => {
    if (!canManageRoles) return;
    setSelected((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    );
  };

  const save = async () => {
    if (!session?.token || !roleId || !canManageRoles) return;
    try {
      await saveRolePermissions(
        roleId,
        permissions
          .filter((p) => selected.includes(p.name))
          .map((p) => p.id),
        session.token
      );
      setMessage("Permissions saved.");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update permissions");
    }
  };

  const addPermission = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.token || !canManageRoles) return;
    try {
      await createPermission(
        permissionName,
        permissionDescription,
        session.token
      );
      setPermissionName("");
      setPermissionDescription("");
      setMessage("Permission added.");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to add permission");
    }
  };

  if (accessDenied || (!canViewRoles && !isSuperAdmin)) {
    return (
      <DashboardShell>
        <div className="welcome">
          <p className="eyebrow" style={{ color: "#ef4444" }}>ACCESS RESTRICTED</p>
          <h1 style={{ color: "#0f172a" }}>Roles & permissions</h1>
          <div
            style={{
              marginTop: "20px",
              padding: "24px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "12px",
              color: "#991b1b",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", fontWeight: 700 }}>
              Access Denied
            </h3>
            <p style={{ margin: 0, fontSize: "0.95rem" }}>
              {accessDenied || "Your account does not have the \"VIEW_PERMISSIONS\" permission required to view or manage role configurations. Please contact a Super Administrator to grant access."}
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="welcome">
        <p className="eyebrow">ADMINISTRATION</p>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Roles & permissions</h3>
        <p>Select a role, then use the switches to grant or remove each permission.</p>
        {!canManageRoles && (
          <div style={{ marginTop: "10px", padding: "8px 12px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.85rem", color: "#475569", fontWeight: 500 }}>
            ℹ️ Read-Only Mode: You have permission to view roles and permissions. Editing permissions requires "MANAGE_PERMISSIONS".
          </div>
        )}
      </div>

      <div className="role-manager">
        <aside className="role-list">
          {roles.map((item) => (
            <button
              type="button"
              className={item.id === roleId ? "role-choice active" : "role-choice"}
              key={item.id}
              onClick={() => choose(item.id)}
            >
              {item.name}
              <small>{item.description}</small>
            </button>
          ))}
        </aside>

        <div className="permission-list">
          {canManageRoles && (
            <form className="permission-create" onSubmit={addPermission}>
              <input
                placeholder="New permission"
                value={permissionName}
                onChange={(e) => setPermissionName(e.target.value)}
                required
              />
              <input
                placeholder="Description"
                value={permissionDescription}
                onChange={(e) => setPermissionDescription(e.target.value)}
              />
              <button className="text-button">Add permission</button>
            </form>
          )}

          <h2>{role?.name || "Select a role"}</h2>

          {paginatedPermissions.map((permission) => (
            <label
              className={`permission-row ${!canManageRoles ? "opacity-75 cursor-not-allowed" : ""}`}
              key={permission.id}
            >
              <span>
                <strong>{permission.name.replace(/_/g, " ")}</strong>
                {permission.description && <small>{permission.description}</small>}
              </span>
              <input
                type="checkbox"
                checked={selected.includes(permission.name)}
                disabled={!canManageRoles}
                onChange={() => toggle(permission.name)}
              />
              <i />
            </label>
          ))}

          {totalPages > 1 && (
            <div className="pagination-container">
              <div className="pagination-info">
                Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> -{" "}
                <strong>{Math.min(currentPage * pageSize, permissions.length)}</strong> of{" "}
                <strong>{permissions.length}</strong> permissions
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  ‹ Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-btn ${p === currentPage ? "active" : ""}`}
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next ›
                </button>
              </div>
            </div>
          )}

          {canManageRoles && (
            <button className="primary-button" onClick={save}>
              Apply permissions
            </button>
          )}
          {message && <p className="success-message">{message}</p>}
        </div>
      </div>
    </DashboardShell>
  );
}
