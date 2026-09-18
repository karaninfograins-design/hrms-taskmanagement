"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  getEmployees,
  deleteEmployee,
  getEmployeeFilters,
  type Employee,
  type EmployeeListResponse,
  type Role,
  type Designation,
} from "@/services/employee.service";

type FilterState = {
  search: string;
  roleId: number | "";
  designationId: number | "";
  status: string | "";
  page: number;
  limit: number;
};

type EmployeeStatus = "ACTIVE" | "INACTIVE";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All Status" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

export default function EmployeesPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });

  const [filters, setFilters] = useState<FilterState>({
    search: "",
    roleId: "",
    designationId: "",
    status: "",
    page: 1,
    limit: 20,
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const isSearchActive = isSearchFocused || Boolean(filters.search);

  const userRole = session?.user?.role;
  const roleName = typeof userRole === "string"
    ? userRole
    : (userRole as any)?.name || (userRole === 1 ? "SUPER_ADMIN" : userRole === 2 ? "ADMIN" : "EMPLOYEE");
  const userRoleId = typeof userRole === "number"
    ? userRole
    : (userRole as any)?.id || (roleName === "SUPER_ADMIN" ? 1 : roleName === "ADMIN" ? 2 : 3);

  const isSuperAdmin = roleName === "SUPER_ADMIN" || userRoleId === 1;
  const isAdminUser = isSuperAdmin || roleName === "ADMIN" || userRoleId === 2;

  const canManageEmployees = isSuperAdmin || (isAdminUser && session?.user?.permissions?.includes("MANAGE_EMPLOYEES"));
  const canCreateAdmins = isSuperAdmin;

  const fetchEmployees = useCallback(async () => {
    if (!session?.token) return;

    setLoading(true);
    setError(null);

    try {
      const response: EmployeeListResponse = await getEmployees(
        {
          page: filters.page,
          limit: filters.limit,
          search: filters.search || undefined,
          roleId: filters.roleId ? Number(filters.roleId) : undefined,
          designationId: filters.designationId ? Number(filters.designationId) : undefined,
          status: filters.status || undefined,
        },
        session.token
      );

      setEmployees(response.employees);
      setPagination({
        total: response.total,
        page: response.page,
        pageSize: response.pageSize,
        totalPages: response.totalPages,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch employees";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [session?.token, filters]);

  const fetchFilters = useCallback(async () => {
    if (!session?.token) return;

    try {
      const { roles: rolesData, designations: designationsData } = await getEmployeeFilters(
        session.token
      );
      setRoles(rolesData);
      setDesignations(designationsData);
    } catch (err) {
      console.error("Failed to fetch filters:", err);
    }
  }, [session?.token]);

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  useEffect(() => {
    if (session?.token) {
      fetchEmployees();
      fetchFilters();
    }
  }, [session?.token, fetchEmployees, fetchFilters]);

  useEffect(() => {
    // Debounce filter changes
    const timer = setTimeout(() => {
      if (filters.page === 1) {
        fetchEmployees();
      } else {
        setFilters((prev) => ({ ...prev, page: 1 }));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [filters.search, filters.roleId, filters.designationId, filters.status, fetchEmployees]);

  useEffect(() => {
    fetchEmployees();
  }, [filters.page, filters.limit, fetchEmployees]);

  const handleFilterChange = (field: keyof FilterState, value: string | number) => {
    setFilters((prev) => ({ ...prev, [field]: value, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newLimit: number) => {
    setFilters((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  };

  const handleDeleteClick = (employee: Employee) => {
    setEmployeeToDelete(employee);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!employeeToDelete || !employeeToDelete.id || !session?.token) return;

    try {
      setLoading(true);
      await deleteEmployee(employeeToDelete.id, session.token);
      setActionMessage(`Employee ${employeeToDelete.name} deactivated successfully.`);
      setShowDeleteModal(false);
      setEmployeeToDelete(null);
      fetchEmployees(); // Refresh the list
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete employee";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleViewEmployee = (employeeId: number) => {
    router.push(`/dashboard/employees/${employeeId}`);
  };

  const handleAddEmployee = () => {
    router.push("/dashboard/employees/new");
  };

  const getStatusBadgeColor = (status: EmployeeStatus) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800";
      case "INACTIVE":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading employees...</main>;
  }

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar
          user={session.user}
          canCreateAdmins={canCreateAdmins}
          onSignOut={handleSignOut}
        />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Back Navigation */}
          <button
            onClick={() => router.push("/dashboard")}
            className="back-button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#ea580c',
              fontWeight: 700,
              fontSize: '14px',
              marginBottom: '20px',
              padding: 0
            }}
          >
            ← Back to Dashboard
          </button>

          <div className="welcome" style={{ marginBottom: "24px" }}>
            <p className="eyebrow">ADMINISTRATION</p>
            <h1 className="text-2xl font-black text-slate-900">Employee Management</h1>
            <p className="text-xs text-slate-500 font-medium">View, search, and manage team members and system permissions</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {actionMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <span>✅</span> {actionMessage}
            </div>
          )}

          {/* Action & Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs mb-6 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="floating-label-group flex-1 min-w-[260px]">
                <input
                  type="text"
                  id="employee-search"
                  placeholder=" "
                  value={filters.search}
                  onChange={(e) => handleFilterChange("search", e.target.value)}
                  className="floating-label-input"
                />
                <label
                  htmlFor="employee-search"
                  className="floating-label-text"
                >
                  Search by name or email...
                </label>
              </div>

              <select
                value={filters.roleId}
                onChange={(e) => handleFilterChange("roleId", e.target.value)}
                className="h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all min-w-[140px]"
              >
                <option value="">All System Roles</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>

              <select
                value={filters.designationId}
                onChange={(e) => handleFilterChange("designationId", e.target.value)}
                className="h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all min-w-[150px]"
              >
                <option value="">All Designations</option>
                {designations.map((designation) => (
                  <option key={designation.id} value={designation.id}>
                    {designation.name}
                  </option>
                ))}
              </select>

              <select
                value={filters.status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all min-w-[130px]"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {canManageEmployees && (
              <button
                onClick={handleAddEmployee}
                className="h-10 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-xs transition-all flex items-center justify-center gap-2 shrink-0"
              >
                <span>+</span> Add Employee
              </button>
            )}
          </div>

          {/* Table Container Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200">
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      EMPLOYEE
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      ROLE
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      DESIGNATION
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      EMAIL
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      PHONE NUMBER
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      STATUS
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 text-right">
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 font-semibold text-xs">
                        Loading employee list...
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 font-semibold text-xs">
                        No employees found matching the filters.
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee) => {
                      const isRowActive = employee.status === "ACTIVE";
                      const avatarLetter = (employee.name || "U").charAt(0).toUpperCase();

                      return (
                        <tr
                          key={employee.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="px-4 py-3.5 align-middle">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-orange-100 border border-orange-200 text-orange-700 font-black text-xs flex items-center justify-center shrink-0">
                                {avatarLetter}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-xs leading-snug">{employee.name}</p>
                                <p className="text-[11px] font-medium text-slate-400">ID: #{employee.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                              {employee.role?.name || "N/A"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 align-middle text-xs font-semibold text-slate-700">
                            {employee.designation?.name || "N/A"}
                          </td>
                          <td className="px-4 py-3.5 align-middle text-xs font-semibold">
                            <a
                              href={`mailto:${employee.email}`}
                              className="text-orange-600 hover:text-orange-700 hover:underline transition-colors"
                            >
                              {employee.email}
                            </a>
                          </td>
                          <td className="px-4 py-3.5 align-middle text-xs font-medium text-slate-600">
                            {employee.phoneNumber || "—"}
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${isRowActive
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isRowActive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                              {employee.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 align-middle text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* View Employee */}
                              <div>
                                {canManageEmployees && (
                                  <button
                                    onClick={() => employee.id && handleViewEmployee(employee.id)}
                                    title="View Employee"
                                    className="group inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 shadow-2xs transition-all hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 hover:shadow-xs cursor-pointer"
                                  >
                                    <svg
                                      className="h-4 w-4 transition-colors"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                      />
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                      />
                                    </svg>
                                  </button>
                                )}</div>

                              {/* Deactivate Employee */}
                              {canManageEmployees && (
                                <button
                                  onClick={() => handleDeleteClick(employee)}
                                  title="Deactivate Employee"
                                  className="group inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500 shadow-2xs transition-all hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 hover:shadow-xs cursor-pointer"
                                >
                                  <svg
                                    className="h-4 w-4 transition-colors"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    {/* User Head */}
                                    <circle cx="12" cy="7" r="3.5" strokeWidth={2} />
                                    {/* User Shoulders */}
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 20a7 7 0 0114 0"
                                    />
                                    {/* Diagonal Slash Line */}
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2.5}
                                      d="M4 4l16 16"
                                    />
                                  </svg>
                                </button>
                              )}
                            </div>

                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages >= 1 && (
              <div className="bg-slate-50/50 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs font-medium text-slate-500">
                  Showing <span className="font-bold text-slate-800">{employees.length > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0}</span> to <span className="font-bold text-slate-800">{Math.min(pagination.page * pagination.pageSize, pagination.total)}</span> of <span className="font-bold text-slate-800">{pagination.total}</span> employees
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={filters.limit}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="h-8 px-2.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  >
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                  </select>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handlePageChange(Math.max(1, pagination.page - 1))}
                      disabled={pagination.page <= 1}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs disabled:opacity-40 disabled:hover:bg-white transition-colors"
                    >
                      Previous
                    </button>

                    <span className="text-xs font-bold text-slate-600 px-2">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>

                    <button
                      onClick={() => handlePageChange(Math.min(pagination.totalPages, pagination.page + 1))}
                      disabled={pagination.page >= pagination.totalPages}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs disabled:opacity-40 disabled:hover:bg-white transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Delete Confirmation Modal */}
          {showDeleteModal && employeeToDelete && (
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
              onClick={() => setShowDeleteModal(false)}
            >
              <div
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xl max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-lg mb-4">
                  ⚠️
                </div>
                <h2 className="text-base font-extrabold text-slate-900 mb-2">
                  Deactivate Employee
                </h2>
                <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">
                  Are you sure you want to deactivate <strong>{employeeToDelete.name}</strong>?
                  This will soft-delete the employee account and restrict access to workspace tools.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-xs transition-all disabled:opacity-50"
                  >
                    {loading ? "Deactivating..." : "Deactivate Employee"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
