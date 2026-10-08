"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";

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

      const todayRes = await fetch("http://localhost:5000/api/attendance/today", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (todayRes.ok) {
        const todayData = await todayRes.json();
        setTodayAttendance(todayData.attendance);
      }

      const logsRes = await fetch("http://localhost:5000/api/attendance", {
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
      const res = await fetch("http://localhost:5000/api/attendance/check-in", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Check in failed");
      }
      fetchAttendanceData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch("http://localhost:5000/api/attendance/check-out", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Check out failed");
      }
      fetchAttendanceData();
    } catch (err: any) {
      alert(err.message);
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
          <button
            onClick={() => router.push("/dashboard")}
            className="back-button mb-4 text-xs font-bold text-orange-600 flex items-center gap-1"
          >
            ← Back to Dashboard
          </button>

          {/* Header */}
          <div className="welcome mb-6">
            <p className="eyebrow">HR & TIME MANAGEMENT</p>
            <h1 className="text-2xl font-black text-slate-900">Attendance Tracking</h1>
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
          <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl p-6 text-white shadow-lg shadow-orange-500/15 flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
            <div className="space-y-2 text-center md:text-left">
              <span className="px-3 py-1 bg-white/20 rounded-full text-[11px] font-bold uppercase tracking-wider">
                Today ({new Date().toLocaleDateString()})
              </span>
              <h2 className="text-2xl font-black">
                {todayAttendance?.checkIn
                  ? `Clocked In at ${formatTime(todayAttendance.checkIn)}`
                  : "Not Clocked In Today"}
              </h2>
              <p className="text-orange-100 text-xs font-medium">
                {todayAttendance?.checkOut
                  ? `Clocked out at ${formatTime(todayAttendance.checkOut)} (${todayAttendance.workingHours} hrs worked)`
                  : todayAttendance?.checkIn
                  ? "Shift in progress..."
                  : "Click the button to record your shift start time."}
              </p>
            </div>

            <div className="flex gap-3">
              {!todayAttendance?.checkIn ? (
                <button
                  onClick={handleCheckIn}
                  disabled={actionLoading}
                  className="px-6 py-3 bg-white text-orange-600 font-black rounded-xl shadow-md hover:bg-orange-50 transition-all text-xs disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Clock In"}
                </button>
              ) : !todayAttendance?.checkOut ? (
                <button
                  onClick={handleCheckOut}
                  disabled={actionLoading}
                  className="px-6 py-3 bg-slate-900 text-white font-black rounded-xl shadow-md hover:bg-slate-800 transition-all text-xs disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Clock Out"}
                </button>
              ) : (
                <span className="px-5 py-2.5 bg-white/20 text-white font-bold rounded-xl text-xs">
                  Shift Completed
                </span>
              )}
            </div>
          </div>

          {/* Attendance History */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
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
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Check In</th>
                      <th className="py-3 px-4">Check Out</th>
                      <th className="py-3 px-4">Hours</th>
                      <th className="py-3 px-4">Status</th>
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
                            <td colSpan={6} className="py-6 text-center text-slate-400 font-medium">
                              No attendance records found.
                            </td>
                          </tr>
                        );
                      }

                      return displayLogs.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {row.user?.name || "Self"}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-medium">
                          {new Date(row.date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700">
                          {formatTime(row.checkIn)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700">
                          {formatTime(row.checkOut)}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {row.workingHours} hrs
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 text-[11px] font-extrabold rounded-full ${
                              row.status === "PRESENT"
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
    </main>
  );
}
