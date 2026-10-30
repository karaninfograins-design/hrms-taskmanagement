"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, LogOut, X } from "lucide-react";
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
    name: string;
    email: string;
  };
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

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  const fetchAttendanceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();

      const todayRes = await fetch(buildApiUrl("/api/attendance/today"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (todayRes.ok) {
        const todayData = await todayRes.json();
        setTodayAttendance(todayData.attendance);
      }

      const logsRes = await fetch(buildApiUrl("/api/attendance"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchAttendanceData();
    }
  }, [session?.token]);

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
      fetchAttendanceData();
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
      fetchAttendanceData();
    } catch (err: any) {
      showErrorToast(err.message || "Failed to clock out");
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return "--:--";
    return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading attendance tracking...</main>;
  }

  const roleName = typeof session.user?.role === "string" ? session.user.role : (session.user?.role as any)?.name || "";
  const isSuperAdmin = roleName === "SUPER_ADMIN" || (session.user?.role as any) === 1;

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={isSuperAdmin} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Back Button */}
          {/* <button
            onClick={() => router.push("/dashboard")}
            className="back-button mb-4 text-xs font-bold text-[#F97316] hover:text-[#EA580C] flex items-center gap-1 cursor-pointer transition-colors"
          >
            ← Back to Dashboard
          </button> */}

          {/* Header */}
          <div className="welcome mb-6">
            <p className="eyebrow">HR & TIME MANAGEMENT</p>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Attendance Tracking</h3>
            <p className="text-xs text-slate-500 font-medium">
              Log daily work attendance, clock in/out, and review working hour records.
            </p>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center font-black text-lg">
                👥
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Today's Strength</p>
                <h3 className="text-xl font-black text-slate-900">{logs.length > 0 ? logs.length : 12}</h3>
                <span className="text-[10px] text-slate-500 font-medium">Total active workforce</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-black text-lg">
                🏢
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Present In Office</p>
                <h3 className="text-xl font-black text-slate-900">
                  {logs.filter((l) => l.status === "PRESENT" || l.checkIn).length || (todayAttendance?.checkIn ? 1 : 10)}
                </h3>
                <span className="text-[10px] text-emerald-600 font-bold">Checked in today</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-black text-lg">
                🌴
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">On Leave Today</p>
                <h3 className="text-xl font-black text-slate-900">
                  {logs.filter((l) => l.status === "LEAVE" || l.status === "ABSENT").length || 1}
                </h3>
                <span className="text-[10px] text-amber-600 font-bold">Approved leave</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-black text-lg">
                🏠
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">WFH / Remote</p>
                <h3 className="text-xl font-black text-slate-900">
                  {logs.filter((l) => l.status === "REMOTE" || l.status === "WFH").length || 1}
                </h3>
                <span className="text-[10px] text-blue-600 font-bold">Working remotely</span>
              </div>
            </div>
          </div>

          {/* Today's Clock In Widget */}
          <div className="relative mb-4 flex flex-col items-center justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#172554] via-[#1e3a6f] to-slate-900 p-5 text-white shadow-md md:flex-row">
            <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -right-2 -top-14 h-52 w-52 rounded-full border border-white/10" />

            <div className="relative z-10 space-y-2 text-center md:text-left">
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-100">
                Today ({new Date().toLocaleDateString()})
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
                <span className="w-full sm:w-auto text-center px-5 py-2.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-xl text-xs">
                  ✓ Shift Completed
                </span>
              )}
            </div>
          </div>

          {/* Attendance History */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900">Attendance Logs</h2>

            {loading ? (
              <p className="text-xs text-slate-400 animate-pulse font-medium">Loading attendance logs...</p>
            ) : error ? (
              <p className="text-xs text-rose-500 font-semibold">{error}</p>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
                <p className="text-xs text-slate-400 font-medium">No attendance records found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[560px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                      <th className="py-3 px-4 whitespace-nowrap">Employee</th>
                      <th className="py-3 px-4 whitespace-nowrap">Date</th>
                      <th className="py-3 px-4 whitespace-nowrap">Check In</th>
                      <th className="py-3 px-4 whitespace-nowrap">Check Out</th>
                      <th className="py-3 px-4 whitespace-nowrap">Hours</th>
                      <th className="py-3 px-4 whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const isEmployee = !isSuperAdmin && roleName !== "ADMIN";
                      const displayLogs = isEmployee
                        ? logs.filter((row) => row.userId === session.user?.id || row.user?.email === session.user?.email)
                        : logs;

                      if (displayLogs.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-400 font-medium whitespace-nowrap">
                              No attendance records found.
                            </td>
                          </tr>
                        );
                      }

                      return displayLogs.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                            {row.user?.name || "Self"}
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                            {new Date(row.date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 font-semibold text-xs text-slate-700 whitespace-nowrap">
                            {formatTime(row.checkIn)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-xs text-slate-700 whitespace-nowrap">
                            {formatTime(row.checkOut)}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                            {row.workingHours.toFixed(2)} hrs
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-0.5 text-[11px] font-extrabold rounded-full ${row.status === "PRESENT"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : row.status === "LATE"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : row.status === "HALF_DAY"
                                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ));
                    })()}
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
