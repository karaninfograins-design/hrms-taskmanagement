"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  Search,
  X,
  Shield,
  Briefcase,
  Activity,
  RotateCcw,
  Plus,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import {
  getEmployees,
  deleteEmployee,
  getEmployeeFilters,
  type Employee,
  type EmployeeListResponse,
  type Role,
  type Designation,
} from "@/services/employee.service";
import { getSocket } from "@/lib/socket";

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
  const [isFetching, setIsFetching] = useState(false);
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

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const userRole = session?.user?.role;
  const roleName = typeof userRole === "string"
    ? userRole
    : (userRole as any)?.name || (userRole === 1 ? "SUPER_ADMIN" : userRole === 2 ? "ADMIN" : userRole === 3 ? "HR" : "EMPLOYEE");
  const userRoleId = typeof userRole === "number"
    ? userRole
    : (userRole as any)?.id || (roleName === "SUPER_ADMIN" ? 1 : roleName === "ADMIN" ? 2 : roleName === "HR" ? 3 : 4);

  const isSuperAdmin = roleName === "SUPER_ADMIN" || userRoleId === 1;
  const isHRUser = roleName === "HR" || roleName === "HR_MANAGER" || roleName.includes("HR") || userRoleId === 3;
  const isAdminUser = isSuperAdmin || roleName === "ADMIN" || isHRUser || userRoleId === 2 || userRoleId === 3;

  const canManageEmployees =
    isSuperAdmin ||
    isHRUser ||
    (isAdminUser && (
      session?.user?.permissions?.includes("MANAGE_EMPLOYEES") ||
      session?.user?.permissions?.some((p: string) => {
        const lp = p.toLowerCase();
        return (
          lp === "manage_employees" ||
          lp.includes("employee:create") ||
          lp.includes("employee:manage") ||
          lp.includes("employee:write")
        );
      }) ||
      roleName === "ADMIN" ||
      roleName === "HR"
    ));
  const canCreateAdmins = isSuperAdmin;

  // Debounce search input only
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 350);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Fetch filter options (roles and designations) once on mount
  useEffect(() => {
    if (!session?.token) return;
    let isMounted = true;
    getEmployeeFilters(session.token)
      .then(({ roles: rolesData, designations: designationsData }) => {
        if (isMounted) {
          setRoles(rolesData);
          setDesignations(designationsData);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch filters:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [session?.token]);

  // Main data fetching effect
  useEffect(() => {
    if (!session?.token) return;

    let isCurrent = true;
    setIsFetching(true);
    setError(null);

    getEmployees(
      {
        page: filters.page,
        limit: filters.limit,
        search: debouncedSearch.trim() || undefined,
        roleId: filters.roleId ? Number(filters.roleId) : undefined,
        designationId: filters.designationId ? Number(filters.designationId) : undefined,
        status: filters.status || undefined,
      },
      session.token
    )
      .then((response: EmployeeListResponse) => {
        if (!isCurrent) return;
        setEmployees(response.employees);
        setPagination({
          total: response.total,
          page: response.page,
          pageSize: response.pageSize,
          totalPages: response.totalPages,
        });
      })
      .catch((err) => {
        if (!isCurrent) return;
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch employees";
        setError(errorMessage);
      })
      .finally(() => {
        if (!isCurrent) return;
        setLoading(false);
        setIsFetching(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [
    session?.token,
    debouncedSearch,
    filters.roleId,
    filters.designationId,
    filters.status,
    filters.page,
    filters.limit,
  ]);

  const refreshEmployees = useCallback(async () => {
    if (!session?.token) return;
    setIsFetching(true);
    try {
      const response: EmployeeListResponse = await getEmployees(
        {
          page: filters.page,
          limit: filters.limit,
          search: debouncedSearch.trim() || undefined,
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
      setError(err instanceof Error ? err.message : "Failed to fetch employees");
    } finally {
      setIsFetching(false);
    }
  }, [session?.token, filters, debouncedSearch]);

  // Listen for real-time employee profile updates
  useEffect(() => {
    if (!session?.token) return;
    const socket = getSocket();
    if (!socket) return;

    const handleEmployeeUpdated = () => {
      refreshEmployees();
    };

    socket.on("employee:updated", handleEmployeeUpdated);
    return () => {
      socket.off("employee:updated", handleEmployeeUpdated);
    };
  }, [session?.token, refreshEmployees]);

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  const handleFilterChange = (field: keyof FilterState, value: string | number) => {
    setFilters((prev) => ({ ...prev, [field]: value, page: 1 }));
  };

  const hasActiveFilters = Boolean(
    filters.search || filters.roleId !== "" || filters.designationId !== "" || filters.status !== ""
  );

  const handleResetFilters = () => {
    setFilters((prev) => ({
      ...prev,
      search: "",
      roleId: "",
      designationId: "",
      status: "",
      page: 1,
    }));
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
      refreshEmployees(); // Refresh the list without destroying DOM
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

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading employees...</main>;
  }

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

          <div className="welcome" style={{ marginBottom: "24px" }}>
            <p className="eyebrow">ADMINISTRATION</p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Employee Directory</h3>
                <span className="text-xs text-slate-500 font-medium">View, search, and manage team members and system permissions</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 self-start sm:self-auto">
                <span className={`w-2 h-2 rounded-full ${isFetching ? "bg-orange-500 animate-ping" : "bg-emerald-500 animate-pulse"}`} />
                <span>{isFetching ? "Updating..." : `${pagination.total} Team Members`}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {actionMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionMessage}</span>
            </div>
          )}

          {/* Modern Action & Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-sm mb-6 flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-3.5">
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 flex-1">
              {/* Modern Search Input */}
              <div className="relative w-full sm:flex-1 sm:min-w-[240px] md:min-w-[280px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                <input
                  type="text"
                  id="employee-search"
                  placeholder="Search employees by name or email..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange("search", e.target.value)}
                  style={{ paddingLeft: "42px", paddingRight: "34px" }}
                  className="w-full h-10.5 !pl-11 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-3 focus:ring-orange-500/15 transition-all shadow-2xs"
                />
                {filters.search && (
                  <button
                    type="button"
                    onClick={() => handleFilterChange("search", "")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/60 transition-colors cursor-pointer z-10"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* System Role Filter */}
              <div className="relative w-full sm:w-auto min-w-0 sm:min-w-[155px] flex-1 sm:flex-initial">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <select
                  value={filters.roleId}
                  onChange={(e) => handleFilterChange("roleId", e.target.value ? Number(e.target.value) : "")}
                  style={{ paddingLeft: "34px", paddingRight: "30px" }}
                  className="w-full h-10.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-3 focus:ring-orange-500/15 transition-all appearance-none cursor-pointer shadow-2xs"
                  aria-label="Filter by system role"
                >
                  <option value="">All System Roles</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10" />
              </div>

              {/* Designation Filter */}
              <div className="relative w-full sm:w-auto min-w-0 sm:min-w-[165px] flex-1 sm:flex-initial">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10">
                  <Briefcase className="w-3.5 h-3.5" />
                </div>
                <select
                  value={filters.designationId}
                  onChange={(e) => handleFilterChange("designationId", e.target.value ? Number(e.target.value) : "")}
                  style={{ paddingLeft: "34px", paddingRight: "30px" }}
                  className="w-full h-10.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-3 focus:ring-orange-500/15 transition-all appearance-none cursor-pointer shadow-2xs"
                  aria-label="Filter by designation"
                >
                  <option value="">All Designations</option>
                  {designations.map((designation) => (
                    <option key={designation.id} value={designation.id}>
                      {designation.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10" />
              </div>

              {/* Status Filter */}
              <div className="relative w-full sm:w-auto min-w-0 sm:min-w-[135px] flex-1 sm:flex-initial">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange("status", e.target.value)}
                  style={{ paddingLeft: "34px", paddingRight: "30px" }}
                  className="w-full h-10.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-3 focus:ring-orange-500/15 transition-all appearance-none cursor-pointer shadow-2xs"
                  aria-label="Filter by status"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10" />
              </div>

              {/* Reset Filters CTA */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="w-full sm:w-auto justify-center h-10.5 px-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Reset all filters"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {canManageEmployees && (
              <button
                onClick={handleAddEmployee}
                className="w-full xl:w-auto h-10.5 px-4 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white font-bold text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Employee</span>
              </button>
            )}
          </div>

          {/* Table Container Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto scrollbar-none no-scrollbar">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      EMPLOYEE
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      ROLE
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      DESIGNATION
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      EMAIL
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      PHONE NUMBER
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      STATUS
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 text-right whitespace-nowrap">
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-slate-100 transition-opacity duration-150 ${isFetching ? "opacity-60 pointer-events-none" : ""}`}>
                  {loading && employees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 font-semibold text-xs whitespace-nowrap">
                        Loading employee list...
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 font-semibold text-xs whitespace-nowrap">
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
                          <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-orange-100 border border-orange-200 text-orange-700 font-black text-xs flex items-center justify-center shrink-0">
                                {avatarLetter}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 text-xs leading-snug truncate max-w-[160px]">{employee.name}</p>
                                <p className="text-[11px] font-medium text-slate-400">ID: #{employee.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                            <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                              {employee.role?.name || "N/A"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 align-middle text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {employee.designation?.name || "N/A"}
                          </td>
                          <td className="px-4 py-3.5 align-middle text-xs font-semibold whitespace-nowrap">
                            <a
                              href={`mailto:${employee.email}`}
                              className="text-orange-600 hover:text-orange-700 hover:underline transition-colors"
                            >
                              {employee.email}
                            </a>
                          </td>
                          <td className="px-4 py-3.5 align-middle text-xs font-medium text-slate-600 whitespace-nowrap">
                            {employee.phoneNumber || "—"}
                          </td>
                          <td className="px-4 py-3.5 align-middle whitespace-nowrap">
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
                          <td className="px-4 py-3.5 align-middle text-right whitespace-nowrap">
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

            {/* Mobile Card List (shown on mobile, hidden on md+) */}
            <div className={`md:hidden divide-y divide-slate-100 p-3 sm:p-4 transition-opacity duration-150 ${isFetching ? "opacity-60 pointer-events-none" : ""}`}>
              {loading && employees.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                  Loading employee list...
                </div>
              ) : employees.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                  No employees found matching the filters.
                </div>
              ) : (
                employees.map((employee) => {
                  const isRowActive = employee.status === "ACTIVE";
                  const avatarLetter = (employee.name || "U").charAt(0).toUpperCase();

                  return (
                    <div key={employee.id} className="py-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-orange-100 border border-orange-200 text-orange-700 font-black text-sm flex items-center justify-center shrink-0">
                            {avatarLetter}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-sm leading-snug truncate">{employee.name}</p>
                            <p className="text-[11px] font-medium text-slate-400">ID: #{employee.id}</p>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold shrink-0 ${isRowActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isRowActive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                          {employee.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Role</span>
                          <span className="font-bold text-slate-700 truncate block mt-0.5">
                            {employee.role?.name || "N/A"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Designation</span>
                          <span className="font-semibold text-slate-700 truncate block mt-0.5">
                            {employee.designation?.name || "N/A"}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Email</span>
                          <a
                            href={`mailto:${employee.email}`}
                            className="font-medium text-orange-600 hover:text-orange-700 truncate block mt-0.5"
                          >
                            {employee.email}
                          </a>
                        </div>
                        {employee.phoneNumber && (
                          <div className="col-span-2">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Phone</span>
                            <span className="font-medium text-slate-700 block mt-0.5">
                              {employee.phoneNumber}
                            </span>
                          </div>
                        )}
                      </div>

                      {canManageEmployees && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => employee.id && handleViewEmployee(employee.id)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300 text-slate-700 font-bold text-xs shadow-2xs transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>View Profile</span>
                          </button>
                          <button
                            onClick={() => handleDeleteClick(employee)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs shadow-2xs transition-colors"
                            title="Deactivate Employee"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="7" r="3.5" strokeWidth={2} />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 20a7 7 0 0114 0" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4l16 16" />
                            </svg>
                            <span>Deactivate</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages >= 1 && (
              <div className="bg-slate-50/50 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs font-medium text-slate-500">
                  Showing <span className="font-bold text-slate-800">{employees.length > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0}</span> to <span className="font-bold text-slate-800">{Math.min(pagination.page * pagination.pageSize, pagination.total)}</span> of <span className="font-bold text-slate-800">{pagination.total}</span> employees
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <select
                    value={filters.limit}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="h-7 px-2 rounded-sm border border-slate-200 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
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
                </p>
                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 justify-end">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={loading}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-xs transition-all disabled:opacity-50"
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
