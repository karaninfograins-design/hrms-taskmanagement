"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, LogOut, X, Filter, RotateCcw, Calendar, User, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api-config";
import { showSuccessToast, showErrorToast } from "@/lib/swal";

type AttendanceRecord = {
  id: number;
  userId: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  workingHours: number;
  user?: {
    id: number;
    name: string;
    email: string;
    avatarUrl?: string | null;
    designation?: { name: string } | null;
  };
};

type EmployeeOption = {
  id: number;
  name: string;
  email: string;
};

export default function AttendancePage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"CLOCK_IN" | "CLOCK_OUT" | null>(null);

  // User role & HR determination (Privacy rule: Only Super Admin, Admin, and sub-role HR can see all logs; normal employees see their own logs only)
  const roleName = typeof session?.user?.role === "string" ? session.user.role : (session?.user?.role as any)?.name || "";
  const roleUpper = roleName.toUpperCase();
  const isSuperAdmin = roleUpper === "SUPER_ADMIN" || (session?.user as any)?.roleId === 1;

  const canViewAllAttendance = useMemo(() => {
    return (
      isSuperAdmin ||
      roleUpper === "ADMIN" ||
      roleUpper === "HR" ||
      roleUpper.includes("HR") ||
      (session?.user as any)?.roleId === 1 ||
      (session?.user as any)?.roleId === 2 ||
      (session?.user as any)?.roleId === 3
    );
  }, [isSuperAdmin, roleUpper, session?.user]);

  // Current Month default
  const currentMonthValue = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, []);

  // Filter States
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthValue);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [employeesList, setEmployeesList] = useState<EmployeeOption[]>([]);

  // Pre-generate last 18 months options
  const monthOptions = useMemo(() => {
    const list: Array<{ label: string; value: string }> = [];
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const isCurrent = i === 0;
      const label = `${d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}${isCurrent ? " (Current)" : ""}`;
      list.push({ label, value: val });
    }
    return list;
  }, []);

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  // Load employees list for HR / Admin filtering
  useEffect(() => {
    if (session?.token && canViewAllAttendance) {
      fetch(buildApiUrl("/api/employees?limit=250"), {
        headers: { Authorization: `Bearer ${session.token}` },
      })
        .then((r) => (r.ok ? r.json() : { employees: [] }))
        .then((data) => {
          const list = (data.employees || [])
            .map((e: any) => ({
              id: Number(e.id),
              name: e.name || e.email,
              email: e.email,
            }))
            .sort((a: EmployeeOption, b: EmployeeOption) => a.name.localeCompare(b.name));
          setEmployeesList(list);
        })
        .catch(() => { });
    }
  }, [session?.token, canViewAllAttendance]);

  const fetchAttendanceData = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError(null);
    try {
      const token = session.token;

      const queryParams = new URLSearchParams();
      queryParams.set("limit", "500");

      if (selectedMonth && selectedMonth !== "ALL") {
        queryParams.set("month", selectedMonth);
      }
      if (canViewAllAttendance && selectedEmployeeId && selectedEmployeeId !== "ALL") {
        queryParams.set("targetUserId", selectedEmployeeId);
      }
      if (selectedStatus && selectedStatus !== "ALL") {
        queryParams.set("status", selectedStatus);
      }

      const [todayRes, logsRes] = await Promise.all([
        fetch(buildApiUrl("/api/attendance/today"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(buildApiUrl(`/api/attendance?${queryParams.toString()}`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (todayRes.ok) {
        const todayData = await todayRes.json();
        setTodayAttendance(todayData.attendance || null);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [session?.token, selectedMonth, selectedEmployeeId, selectedStatus, canViewAllAttendance]);

  useEffect(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl("/api/attendance/check-in"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Check in failed");
      }
      showSuccessToast("Clocked in successfully!");
      window.dispatchEvent(new Event("hrms-attendance-change"));
      await fetchAttendanceData();
    } catch (err: any) {
      showErrorToast(err.message || "Failed to clock in");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl("/api/attendance/check-out"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Check out failed");
      }
      showSuccessToast("Clocked out successfully!");
      window.dispatchEvent(new Event("hrms-attendance-change"));
      await fetchAttendanceData();
    } catch (err: any) {
      showErrorToast(err.message || "Failed to clock out");
    } finally {
      setActionLoading(false);
    }
  };

  const resetFilters = () => {
    setSelectedMonth(currentMonthValue);
    setSelectedEmployeeId("ALL");
    setSelectedStatus("ALL");
  };

  const isFilterActive =
    selectedMonth !== currentMonthValue ||
    (canViewAllAttendance && selectedEmployeeId !== "ALL") ||
    selectedStatus !== "ALL";

  const currentUserId = session?.user?.id;
  // Strictly filter display logs: if normal employee, only show their own logs
  const displayLogs = useMemo(() => {
    if (canViewAllAttendance) return logs;
    return logs.filter((row) => Number(row.userId) === Number(currentUserId));
  }, [canViewAllAttendance, logs, currentUserId]);

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return "--:--";
    return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading attendance tracking...</main>;
  }

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={isSuperAdmin} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Header */}
          <div className="welcome mb-6">
            <p className="eyebrow">HR & TIME MANAGEMENT</p>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Attendance Tracking</h3>
            <p className="text-xs text-slate-500 font-medium">
              Log daily work attendance, clock in/out, and review comprehensive working hour logs.
            </p>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center font-black text-lg">
                👥
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {canViewAllAttendance ? "Filtered Records" : "My Logged Days"}
                </p>
                <h3 className="text-xl font-black text-slate-900">{displayLogs.length}</h3>
                <span className="text-[10px] text-slate-500 font-medium">
                  {canViewAllAttendance ? "Logs in selected view" : "Total records in month"}
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-black text-lg">
                🏢
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {canViewAllAttendance ? "Present Logs" : "My Present Shifts"}
                </p>
                <h3 className="text-xl font-black text-slate-900">
                  {displayLogs.filter((l) => l.status === "PRESENT" || l.checkIn).length}
                </h3>
                <span className="text-[10px] text-emerald-600 font-bold">Recorded shifts</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-black text-lg">
                ⏰
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {canViewAllAttendance ? "Late Arrivals" : "My Late Arrivals"}
                </p>
                <h3 className="text-xl font-black text-slate-900">
                  {displayLogs.filter((l) => l.status === "LATE").length}
                </h3>
                <span className="text-[10px] text-amber-600 font-bold">Past 10:00 AM IST</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-black text-lg">
                ⏳
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {canViewAllAttendance ? "Half Days" : "My Half Days"}
                </p>
                <h3 className="text-xl font-black text-slate-900">
                  {displayLogs.filter((l) => l.status === "HALF_DAY").length}
                </h3>
                <span className="text-[10px] text-blue-600 font-bold">&lt; 4 hours worked</span>
              </div>
            </div>
          </div>

          {/* Today's Clock In Widget */}
          <div className="relative mb-6 flex flex-col items-center justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#172554] via-[#1e3a6f] to-slate-900 p-5 text-white shadow-md md:flex-row">
            <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -right-2 -top-14 h-52 w-52 rounded-full border border-white/10" />

            <div className="relative z-10 space-y-2 text-center md:text-left">
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-100">
                Today ({new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })})
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {todayAttendance?.checkIn
                  ? `Clocked In at ${formatTime(todayAttendance.checkIn)}`
                  : "Not Clocked In Today"}
              </h2>
              <p className="text-xs font-medium text-blue-100/80">
                {todayAttendance?.checkOut
                  ? `Clocked out at ${formatTime(todayAttendance.checkOut)} (${todayAttendance.workingHours.toFixed(2)} hrs worked)`
                  : todayAttendance?.checkIn
                    ? "Shift in progress..."
                    : "Click the button to record your shift start time."}
              </p>
            </div>

            <div className="relative z-10 flex w-full sm:w-auto gap-3">
              {!todayAttendance?.checkIn ? (
                <button
                  type="button"
                  onClick={() => setConfirmAction("CLOCK_IN")}
                  disabled={actionLoading}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold rounded-xl shadow-xs transition-all text-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Clock className="w-4 h-4" />
                  <span>{actionLoading ? "Processing..." : "Clock In"}</span>
                </button>
              ) : !todayAttendance?.checkOut ? (
                <button
                  type="button"
                  onClick={() => setConfirmAction("CLOCK_OUT")}
                  disabled={actionLoading}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold rounded-xl shadow-xs transition-all text-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{actionLoading ? "Processing..." : "Clock Out"}</span>
                </button>
              ) : (
                <span className="w-full sm:w-auto text-center px-5 py-2.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Shift Completed
                </span>
              )}
            </div>
          </div>

          {/* Attendance History & Filter Bar */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            {/* Table Header with Filter Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-600" />
                  Attendance Logs
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {canViewAllAttendance
                    ? "Filter and audit employee attendance records by month, employee, and status"
                    : "Review your personal monthly attendance history and work duration"}
                </p>
              </div>

              {/* Filters Toolbar */}
              <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                {/* Month Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 min-w-[170px] flex-1 sm:flex-none">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-full cursor-pointer"
                  >
                    <option value="ALL">All Months</option>
                    {monthOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Employee Filter (Only for Super Admin, Admin, and sub-role HR) */}
                {canViewAllAttendance && (
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 min-w-[180px] flex-1 sm:flex-none">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-full cursor-pointer"
                    >
                      <option value="ALL">All Employees</option>
                      {employeesList.map((emp) => (
                        <option key={emp.id} value={String(emp.id)}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Status Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 min-w-[130px] flex-1 sm:flex-none">
                  <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-full cursor-pointer"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PRESENT">Present</option>
                    <option value="LATE">Late (&gt;10 AM)</option>
                    <option value="HALF_DAY">Half Day (&lt;4 hrs)</option>
                  </select>
                </div>

                {/* Reset Filters Button */}
                {isFilterActive && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Reset all filters"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <p className="text-xs text-slate-400 animate-pulse font-medium py-6 text-center">
                Loading attendance logs...
              </p>
            ) : error ? (
              <p className="text-xs text-rose-500 font-semibold py-4 text-center">{error}</p>
            ) : logs.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl space-y-1.5">
                <p className="text-xs font-bold text-slate-700">No attendance records found.</p>
                <p className="text-[11px] text-slate-400">
                  {isFilterActive
                    ? "Try adjusting your month or employee filter above."
                    : "No shifts recorded yet."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-none no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full text-left text-xs min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                      <th className="py-3 px-4 whitespace-nowrap">Employee</th>
                      <th className="py-3 px-4 whitespace-nowrap">Date</th>
                      <th className="py-3 px-4 whitespace-nowrap">Check In</th>
                      <th className="py-3 px-4 whitespace-nowrap">Check Out</th>
                      <th className="py-3 px-4 whitespace-nowrap">Working Hours</th>
                      <th className="py-3 px-4 whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayLogs.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[11px] uppercase">
                              {(row.user?.name || "E").charAt(0)}
                            </div>
                            <div>
                              <strong className="text-slate-900 font-bold block text-xs">
                                {row.user?.name || "Self"}
                              </strong>
                              {row.user?.designation?.name && (
                                <span className="text-[10px] text-slate-400 font-medium block">
                                  {row.user.designation.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                          {new Date(row.date).toLocaleDateString(undefined, {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-4 font-semibold text-xs text-slate-700 whitespace-nowrap">
                          {formatTime(row.checkIn)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-xs text-slate-700 whitespace-nowrap">
                          {formatTime(row.checkOut)}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                          {row.workingHours ? `${row.workingHours.toFixed(2)} hrs` : row.checkIn && !row.checkOut ? "In Progress" : "--"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full tracking-wider border ${row.status === "PRESENT"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : row.status === "LATE"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : row.status === "HALF_DAY"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Accidental Click Prevention Confirmation Modal */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !actionLoading && setConfirmAction(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 transition-all animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close 'X' Button */}
            <button
              type="button"
              onClick={() => !actionLoading && setConfirmAction(null)}
              disabled={actionLoading}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${confirmAction === "CLOCK_IN"
                    ? "bg-orange-50 text-orange-600 border border-orange-100"
                    : "bg-rose-50 text-rose-600 border border-rose-100"
                  }`}
              >
                {confirmAction === "CLOCK_IN" ? (
                  <Clock className="w-6 h-6" />
                ) : (
                  <LogOut className="w-6 h-6" />
                )}
              </div>
              <div className="flex-1 pt-0.5">
                <h3 className="text-base font-extrabold text-slate-900">
                  {confirmAction === "CLOCK_IN" ? "Confirm Clock In" : "Confirm Clock Out"}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 font-medium">
                  {confirmAction === "CLOCK_IN"
                    ? "Are you sure you want to clock in now?"
                    : "Are you sure you want to clock out now?"}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={actionLoading}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  if (action === "CLOCK_IN") {
                    await handleCheckIn();
                  } else if (action === "CLOCK_OUT") {
                    await handleCheckOut();
                  }
                }}
                disabled={actionLoading}
                className={`px-5 py-2.5 text-xs font-extrabold text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 ${confirmAction === "CLOCK_IN"
                    ? "bg-orange-500 hover:bg-orange-600 active:bg-orange-700"
                    : "bg-rose-600 hover:bg-rose-700 active:bg-rose-800"
                  }`}
              >
                {actionLoading
                  ? "Processing..."
                  : confirmAction === "CLOCK_IN"
                    ? "Yes, Clock In"
                    : "Yes, Clock Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}