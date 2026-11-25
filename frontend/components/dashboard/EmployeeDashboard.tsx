"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Clock,
  CalendarCheck,
  CalendarDays,
  Briefcase,
  Play,
  Square,
  Video,
  ArrowUpRight,
  Plus,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { apiRequest } from "@/services/api";
import { buildApiUrl } from "@/lib/api-config";
import { showSuccessToast, showErrorToast, showConfirmDialog } from "@/lib/swal";

type ProjectItem = {
  id: number;
  key?: string;
  name: string;
  status: string;
  startDate?: string;
  endDate?: string;
  membersCount?: number;
};

type LeaveRequest = {
  id: number;
  leaveType: { name: string };
  startDate: string;
  endDate: string;
  totalDays: number;
  halfDayPeriod?: "FIRST_HALF" | "SECOND_HALF" | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  rejectionReason?: string;
  createdAt?: string;
};

type TodayAttendance = {
  id: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  workingHours: number;
  canClockIn?: boolean;
};

type CompanyHoliday = {
  id: number;
  name: string;
  date: string;
  type?: string;
  description?: string;
};

type MeetingItem = {
  id: number;
  title: string;
  scheduledAt: string;
  duration?: number;
  status: string;
  link?: string;
  organizer?: { id: number; name: string };
  project?: { id: number; name: string };
  members?: Array<{ user: { id: number; name: string } }>;
};

type EmployeeDashboardProps = {
  token: string;
  userName: string;
  userId: number;
  designation?: string;
  roleName?: string;
};

export function EmployeeDashboard({
  token,
  userName,
  userId,
  designation,
  roleName,
}: EmployeeDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance | null>(null);
  const [punchLoading, setPunchLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [monthlyAttendanceStats, setMonthlyAttendanceStats] = useState({
    presentDays: 0,
    halfDays: 0,
    lateDays: 0,
    totalWorkingHours: 0,
  });

  const [myProjects, setMyProjects] = useState<ProjectItem[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState<CompanyHoliday[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<MeetingItem[]>([]);

  // Fetch today's attendance record
  const fetchTodayAttendance = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(buildApiUrl("/api/attendance/today"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const att = data.attendance || null;
        if (att) {
          att.canClockIn = Boolean(data.canClockIn);
        }
        setTodayAttendance(att);
      }
    } catch {
      // Non-blocking
    }
  }, [token]);

  // Main data loader
  const loadEmployeeData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

      const [todayAttRes, monthAttRes, projectsRes, requestsRes, holidaysRes, meetingsRes] =
        await Promise.all([
          fetch(buildApiUrl("/api/attendance/today"), {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(async (r) => {
              if (!r.ok) return { attendance: null };
              const d = await r.json();
              if (d.attendance) {
                d.attendance.canClockIn = Boolean(d.canClockIn);
              }
              return d;
            })
            .catch(() => ({ attendance: null })),

          fetch(
            buildApiUrl(
              `/api/attendance?startDate=${firstDayOfMonth}&endDate=${lastDayOfMonth}&limit=35`
            ),
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          )
            .then((r) => (r.ok ? r.json() : { logs: [] }))
            .catch(() => ({ logs: [] })),

          apiRequest<{ items: any[] }>("/api/workspace/projects", { token }).catch(() =>
            apiRequest<{ items: any[] }>("/api/workspace", { token }).catch(() => ({ items: [] }))
          ),

          apiRequest<{ requests: LeaveRequest[] }>("/api/leaves/requests", { token }).catch(() => ({
            requests: [],
          })),

          apiRequest<{ holidays: CompanyHoliday[] }>("/api/holidays", { token }).catch(() => ({
            holidays: [],
          })),

          apiRequest<{ meetings: MeetingItem[] }>("/api/meetings?status=SCHEDULED", { token }).catch(
            () => ({ meetings: [] })
          ),
        ]);

      // Set Attendance
      setTodayAttendance(todayAttRes.attendance || null);

      // Process monthly attendance
      const monthLogs: any[] = monthAttRes.logs || [];
      const present = monthLogs.filter(
        (l) => l.status === "PRESENT" || l.status === "ON_TIME" || l.status === "LATE"
      ).length;
      const halfDays = monthLogs.filter((l) => l.status === "HALF_DAY").length;
      const lateDays = monthLogs.filter((l) => l.status === "LATE").length;
      const totalHrs = monthLogs.reduce((acc, l) => acc + (Number(l.workingHours) || 0), 0);

      setMonthlyAttendanceStats({
        presentDays: present,
        halfDays,
        lateDays,
        totalWorkingHours: Math.round(totalHrs * 10) / 10,
      });

      // Process Projects
      const allProjects = projectsRes.items || [];
      const memberProjects: ProjectItem[] = allProjects
        .filter((prj: any) => {
          const isMember = (prj.members || []).some(
            (m: any) => Number(m.userId) === Number(userId)
          );
          const isAssigned = (prj.assignedUserIds || []).includes(Number(userId));
          return isMember || isAssigned;
        })
        .map((prj: any) => ({
          id: prj.id,
          key: prj.key,
          name: prj.name,
          status: prj.status,
          startDate: prj.startDate,
          endDate: prj.endDate,
          membersCount: prj.members?.length || 0,
        }));

      setMyProjects(
        memberProjects.length > 0
          ? memberProjects
          : allProjects.slice(0, 8).map((p: any) => ({
            id: p.id,
            key: p.key,
            name: p.name,
            status: p.status,
          }))
      );

      // Leaves
      setLeaveRequests(requestsRes.requests || []);

      // Upcoming Holidays (today or future)
      const todayStr = new Date().toISOString().split("T")[0];
      const futureHolidays = (holidaysRes.holidays || [])
        .filter((h) => {
          const hDate = new Date(h.date).toISOString().split("T")[0];
          return hDate >= todayStr;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 4);
      setUpcomingHolidays(futureHolidays);

      // Upcoming Meetings
      const myMeetings = (meetingsRes.meetings || [])
        .filter((m) => {
          const isOrg = Number(m.organizer?.id) === Number(userId);
          const isPart = (m.members || []).some((mem) => Number(mem.user?.id) === Number(userId));
          return isOrg || isPart || !m.members || m.members.length === 0;
        })
        .slice(0, 4);
      setUpcomingMeetings(myMeetings);
    } catch (err) {
      console.error("Failed to load employee dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    loadEmployeeData();
  }, [loadEmployeeData]);

  // Sync attendance on external window events
  useEffect(() => {
    const handleAttendanceChange = () => {
      fetchTodayAttendance();
    };
    window.addEventListener("hrms-attendance-change", handleAttendanceChange);
    return () => {
      window.removeEventListener("hrms-attendance-change", handleAttendanceChange);
    };
  }, [fetchTodayAttendance]);

  // Live timer tick for active shift (caps at 12 hours)
  useEffect(() => {
    if (!todayAttendance?.checkIn || todayAttendance?.checkOut) {
      setElapsedSeconds(0);
      return;
    }

    const checkInMs = new Date(todayAttendance.checkIn).getTime();
    const MAX_SECS = 12 * 3600; // 12 hours

    const updateElapsed = () => {
      const diffSecs = Math.max(0, Math.floor((Date.now() - checkInMs) / 1000));
      if (diffSecs >= MAX_SECS) {
        setElapsedSeconds(MAX_SECS);
        void fetchTodayAttendance();
      } else {
        setElapsedSeconds(diffSecs);
      }
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [todayAttendance?.checkIn, todayAttendance?.checkOut, fetchTodayAttendance]);

  const formatElapsed = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
  };

  const handlePunchIn = async () => {
    if (!token || punchLoading) return;
    const confirmed = await showConfirmDialog({
      title: "Clock In?",
      text: "Start your work shift now?",
      confirmButtonText: "Yes, Clock In",
      cancelButtonText: "Cancel",
      icon: "question",
      confirmButtonColor: "#ea580c",
    });
    if (!confirmed) return;

    setPunchLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/attendance/check-in"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to clock in");
      }
      showSuccessToast("Clocked in successfully.");
      window.dispatchEvent(new Event("hrms-attendance-change"));
      await fetchTodayAttendance();
    } catch (err: any) {
      showErrorToast(err.message || "Failed to clock in");
    } finally {
      setPunchLoading(false);
    }
  };

  const handlePunchOut = async () => {
    if (!token || punchLoading) return;
    const confirmed = await showConfirmDialog({
      title: "Clock Out?",
      text: "End your work shift for today?",
      confirmButtonText: "Yes, Clock Out",
      cancelButtonText: "Cancel",
      icon: "question",
      confirmButtonColor: "#0f172a",
    });
    if (!confirmed) return;

    setPunchLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/attendance/check-out"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to clock out");
      }
      showSuccessToast("Clocked out successfully.");
      window.dispatchEvent(new Event("hrms-attendance-change"));
      await fetchTodayAttendance();
    } catch (err: any) {
      showErrorToast(err.message || "Failed to clock out");
    } finally {
      setPunchLoading(false);
    }
  };

  const pendingLeavesCount = useMemo(
    () => leaveRequests.filter((r) => r.status === "PENDING").length,
    [leaveRequests]
  );

  const approvedLeavesCount = useMemo(
    () => leaveRequests.filter((r) => r.status === "APPROVED").length,
    [leaveRequests]
  );

  // Professional, clean neutral status badges
  const getStatusBadge = (status: string) => {
    const styles: Record<string, { label: string; className: string }> = {
      PENDING: {
        label: "Pending",
        className: "bg-slate-100 text-slate-700 border-slate-200",
      },
      APPROVED: {
        label: "Approved",
        className: "bg-slate-800 text-white border-slate-800",
      },
      REJECTED: {
        label: "Rejected",
        className: "bg-rose-50 text-rose-700 border-rose-200",
      },
      CANCELLED: {
        label: "Cancelled",
        className: "bg-slate-50 text-slate-500 border-slate-200",
      },
    };
    const s = styles[status] || styles.PENDING;
    return (
      <span
        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${s.className} inline-block`}
      >
        {s.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="py-20 text-center space-y-3 w-full">
        <div className="inline-block w-7 h-7 border-2 border-slate-400 border-t-orange-600 rounded-full animate-spin" />
        <p className="text-slate-500 font-semibold text-xs">Loading dashboard...</p>
      </div>
    );
  }

  const todayDateFormatted = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="w-full space-y-4 sm:space-y-5 pb-8">
      {/* Modern, Clean Full-Width Header Card */}
      <div className="w-full bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 p-4 sm:p-5 md:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 flex-wrap">
            <span className="text-orange-600 font-bold uppercase text-[11px] tracking-wider">
              Employee Portal
            </span>
            <span>•</span>
            <span>{todayDateFormatted}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 truncate">
            Welcome back, {userName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium flex items-center gap-2 flex-wrap">
            {designation && <span className="text-slate-700 font-semibold">{designation}</span>}
            {roleName && (
              <>
                <span>•</span>
                <span className="text-slate-600">{roleName}</span>
              </>
            )}
          </p>
        </div>

        {/* Shift Attendance Control Box & Actions */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 sm:px-4 py-2.5 flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Shift Attendance
              </span>
              {todayAttendance?.checkIn ? (
                todayAttendance?.checkOut ? (
                  <span className="text-xs font-semibold text-slate-700 block">
                    Completed ({todayAttendance.workingHours}h)
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold text-slate-800">
                      In since {new Date(todayAttendance.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                      ({formatElapsed(elapsedSeconds)})
                    </span>
                  </div>
                )
              ) : (
                <span className="text-xs font-semibold text-slate-500 block">Not clocked in</span>
              )}
            </div>

            <div className="pl-2 border-l border-slate-200">
              {!todayAttendance?.checkIn || todayAttendance?.canClockIn ? (
                <button
                  onClick={handlePunchIn}
                  disabled={punchLoading}
                  className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 active:scale-98 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>{todayAttendance?.checkOut ? "Clock In (Next)" : "Clock In"}</span>
                </button>
              ) : !todayAttendance?.checkOut ? (
                <button
                  onClick={handlePunchOut}
                  disabled={punchLoading}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 active:scale-98 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Clock Out</span>
                </button>
              ) : (
                <span className="text-[11px] font-bold text-slate-400 px-2 py-1">Shift Done</span>
              )}
            </div>
          </div>

          <Link
            href="/dashboard/leaves"
            className="px-4 py-2.5 rounded-xl border border-slate-300 hover:border-slate-400 active:scale-98 text-slate-700 hover:text-slate-900 bg-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap w-full sm:w-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Apply Leave</span>
          </Link>
        </div>
      </div>

      {/* Clean Metric Indicators Across Full Width */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Attendance Summary */}
        <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Attendance This Month
            </span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">
              {monthlyAttendanceStats.presentDays}
            </span>
            <span className="text-xs font-semibold text-slate-500">Days Logged</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            {monthlyAttendanceStats.totalWorkingHours} total hours recorded
            {monthlyAttendanceStats.lateDays > 0 ? ` • ${monthlyAttendanceStats.lateDays} late arrivals` : ""}
          </p>
        </div>

        {/* Assigned Projects */}
        <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Assigned Projects
            </span>
            <Briefcase className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">
              {myProjects.length}
            </span>
            <span className="text-xs font-semibold text-slate-500">Workspaces</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Active team collaborations & repositories
          </p>
        </div>

        {/* Leave Requests Overview */}
        <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Leave Requests
            </span>
            <CalendarCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">
              {leaveRequests.length}
            </span>
            <span className="text-xs font-semibold text-slate-500">Applications</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            {pendingLeavesCount} pending approval • {approvedLeavesCount} approved
          </p>
        </div>
      </div>

      {/* Main 2-Column Section Full Width */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Left Side (Projects & Recent Leave Requests) - 7 cols on lg, 8 cols on xl */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4 sm:space-y-5">
          {/* Assigned Projects */}
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  My Projects ({myProjects.length})
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Projects and workspace modules you are assigned to
                </p>
              </div>
              <Link
                href="/dashboard/projects"
                className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                View All <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {myProjects.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No active projects assigned.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {myProjects.map((prj) => (
                  <div
                    key={prj.id}
                    className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-2 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                          {prj.key || `PRJ-${prj.id}`}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 uppercase">
                          {prj.status}
                        </span>
                      </div>
                      <strong className="text-xs sm:text-sm font-semibold text-slate-900 block truncate">
                        {prj.name}
                      </strong>
                    </div>
                    {prj.membersCount !== undefined && prj.membersCount > 0 && (
                      <span className="text-[11px] text-slate-400 font-medium block pt-1 border-t border-slate-100">
                        {prj.membersCount} Team Members
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Leave Applications */}
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Recent Leave Applications
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  History and approval status of your leave requests
                </p>
              </div>
              <Link
                href="/dashboard/leaves"
                className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                Manage Leaves <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {leaveRequests.length === 0 ? (
              <div className="py-8 text-center text-xs font-medium text-slate-400">
                No leave applications submitted yet.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1 sm:mx-0">
                <table className="w-full text-xs min-w-[440px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-400 font-bold uppercase text-[10px]">
                      <th className="pb-2.5">Leave Type</th>
                      <th className="pb-2.5">Duration</th>
                      <th className="pb-2.5">Days</th>
                      <th className="pb-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {leaveRequests.slice(0, 5).map((req) => (
                      <tr key={req.id}>
                        <td className="py-2.5 font-semibold text-slate-800">
                          {req.leaveType?.name || "Leave"}
                        </td>
                        <td className="py-2.5 text-slate-500">
                          {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 font-bold text-slate-800">
                          {Number(req.totalDays).toLocaleString(undefined, { maximumFractionDigits: 1 })}d
                          {req.halfDayPeriod && (
                            <span className="ml-1 text-[10px] font-semibold text-slate-500">
                              ({req.halfDayPeriod === "FIRST_HALF" ? "1st Half" : "2nd Half"})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">{getStatusBadge(req.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side (Holidays, Meetings, Quick Links) - 5 cols on lg, 4 cols on xl */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 sm:space-y-5">
          {/* Upcoming Holidays */}
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-600" />
                Upcoming Holidays
              </h3>
              <Link
                href="/dashboard/company-calendar"
                className="text-[11px] font-bold text-orange-600 hover:text-orange-700"
              >
                Calendar →
              </Link>
            </div>

            {upcomingHolidays.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No upcoming holidays scheduled.</p>
            ) : (
              <div className="space-y-2">
                {upcomingHolidays.map((h) => {
                  const d = new Date(h.date);
                  const dayName = d.toLocaleDateString(undefined, { weekday: "short" });
                  const dateNum = d.getDate();
                  const monthName = d.toLocaleDateString(undefined, { month: "short" });

                  return (
                    <div
                      key={h.id}
                      className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex flex-col items-center justify-center shrink-0">
                        <span className="text-[8px] font-bold uppercase leading-none">{monthName}</span>
                        <span className="text-xs font-black leading-tight">{dateNum}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <strong className="text-xs font-semibold text-slate-800 block truncate">
                          {h.name}
                        </strong>
                        <span className="text-[11px] text-slate-400 font-medium block">
                          {dayName} • {h.type || "Public Holiday"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Team Meetings */}
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                <Video className="w-4 h-4 text-slate-600" />
                Upcoming Meetings
              </h3>
              <Link
                href="/dashboard/meetings"
                className="text-[11px] font-bold text-orange-600 hover:text-orange-700"
              >
                All Meetings →
              </Link>
            </div>

            {upcomingMeetings.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No upcoming meetings scheduled.</p>
            ) : (
              <div className="space-y-2">
                {upcomingMeetings.map((m) => {
                  const mDate = new Date(m.scheduledAt);
                  const isToday = mDate.toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-xs font-semibold text-slate-800 truncate block">
                          {m.title}
                        </strong>
                        {isToday && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900 text-white uppercase">
                            Today
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {mDate.toLocaleDateString([], { month: "short", day: "numeric" })} at{" "}
                          {mDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <Link
                          href={`/dashboard/meetings/${m.id}`}
                          className="font-bold text-orange-600 hover:text-orange-700"
                        >
                          Join →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Access Shortcuts Card */}
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900">
              Quick Shortcuts
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link
                href="/dashboard/attendance"
                className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/80 transition-colors flex items-center justify-between font-semibold text-slate-700 group"
              >
                <span>Attendance Logs</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
              </Link>
              <Link
                href="/dashboard/leaves"
                className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/80 transition-colors flex items-center justify-between font-semibold text-slate-700 group"
              >
                <span>Leave Portal</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
              </Link>
              <Link
                href="/dashboard/company-calendar"
                className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/80 transition-colors flex items-center justify-between font-semibold text-slate-700 group"
              >
                <span>Event Calendar</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
              </Link>
              <Link
                href="/dashboard/messenger/chats"
                className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/80 transition-colors flex items-center justify-between font-semibold text-slate-700 group"
              >
                <span>ConnectHub</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}