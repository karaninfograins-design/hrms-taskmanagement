"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiRequest } from "@/services/api";

type ProjectItem = {
  id: number;
  key?: string;
  name: string;
  status: string;
  startDate?: string;
  endDate?: string;
};

type LeaveBalance = {
  id: number;
  leaveType: { name: string };
  allocated: number;
  used: number;
  remaining: number;
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
};

type EmployeeDashboardProps = {
  token: string;
  userName: string;
  userId: number;
};

export function EmployeeDashboard({ token, userName, userId }: EmployeeDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [myProjects, setMyProjects] = useState<ProjectItem[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);

  const loadEmployeeData = useCallback(async () => {
    setLoading(true);
    try {
      // Lightweight parallel API requests for minimal latency
      const [projectsRes, balancesRes, requestsRes] = await Promise.all([
        apiRequest<{ items: any[] }>("/api/workspace/projects", { token }).catch(() =>
          apiRequest<{ items: any[] }>("/api/workspace", { token }).catch(() => ({ items: [] }))
        ),
        apiRequest<{ balances: LeaveBalance[] }>("/api/leaves/balances", { token }).catch(() => ({ balances: [] })),
        apiRequest<{ requests: LeaveRequest[] }>("/api/leaves/requests", { token }).catch(() => ({ requests: [] })),
      ]);

      const allProjects = projectsRes.items || [];

      // Filter assigned projects cleanly
      const memberProjects: ProjectItem[] = allProjects
        .filter((prj: any) => {
          const isMember = (prj.members || []).some((m: any) => Number(m.userId) === Number(userId));
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
        }));

      setMyProjects(memberProjects.length > 0 ? memberProjects : allProjects.map((p: any) => ({ id: p.id, key: p.key, name: p.name, status: p.status })));
      setLeaveBalances(balancesRes.balances || []);
      setLeaveRequests(requestsRes.requests || []);
    } catch (err) {
      console.error("Failed to load employee dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    loadEmployeeData();
  }, [loadEmployeeData]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { bg: string; color: string; border: string; label: string }> = {
      PENDING: { bg: "#fffbeb", color: "#b45309", border: "#fde68a", label: "Pending" },
      APPROVED: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0", label: "Approved" },
      REJECTED: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca", label: "Rejected" },
      CANCELLED: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0", label: "Cancelled" },
    };
    const s = statusMap[status] || { bg: "#f8fafc", color: "#475569", border: "#cbd5e1", label: status };
    return (
      <span
        style={{
          backgroundColor: s.bg,
          color: s.color,
          border: `1px solid ${s.border}`,
          padding: "3px 10px",
          borderRadius: "9999px",
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.025em",
          display: "inline-block",
        }}
      >
        {s.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-500 font-medium text-sm">
        Loading employee dashboard...
      </div>
    );
  }

  const totalAllocatedLeaves = leaveBalances.reduce((acc, b) => acc + (b.allocated || 0), 0);
  const totalRemainingLeaves = leaveBalances.reduce((acc, b) => acc + (b.remaining || 0), 0);
  const totalUsedLeaves = leaveBalances.reduce((acc, b) => acc + (b.used || 0), 0);

  return (
    <div className="space-y-6">
      {/* Employee overview banner */}
      <div className="relative flex flex-col items-start justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#172554] via-[#1e3a6f] to-slate-900 p-5 text-white shadow-md md:flex-row md:items-center">
        <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 -top-14 h-52 w-52 rounded-full border border-white/10" />

        <div className="relative z-10 space-y-1">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-100">
            Employee Overview
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Welcome back, {userName}
          </h1>
          <p className="text-xs font-medium text-blue-100/80">
            Overview of your current workspace projects and leave balances.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <Link
            href="/dashboard/leaves"
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-orange-600"
          >
            + Apply for Leave
          </Link>
        </div>
      </div>

      {/* Leave Balances Metric Cards */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Leave Balances & Summary
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Total Allocated
            </span>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">
              {totalAllocatedLeaves} <span className="text-xs font-semibold text-slate-400">Days</span>
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs">
            <span className="text-[11px] font-extrabold text-emerald-600 uppercase tracking-wider">
              Remaining Leaves
            </span>
            <p className="text-2xl font-extrabold text-emerald-700 mt-1">
              {totalRemainingLeaves} <span className="text-xs font-semibold text-emerald-500">Days</span>
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-xs">
            <span className="text-[11px] font-extrabold text-amber-600 uppercase tracking-wider">
              Used Leaves
            </span>
            <p className="text-2xl font-extrabold text-amber-800 mt-1">
              {totalUsedLeaves} <span className="text-xs font-semibold text-amber-500">Days</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: My Assigned Projects & Recent Leave Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Assigned Projects */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">
              My Assigned Projects ({myProjects.length})
            </h2>
            <Link href="/dashboard/projects" className="text-xs font-bold text-orange-600 hover:text-orange-700">
              View All Projects →
            </Link>
          </div>

          {myProjects.length === 0 ? (
            <p className="text-xs font-medium text-slate-500 py-4">No active projects assigned.</p>
          ) : (
            <div className="space-y-3">
              {myProjects.map((prj) => (
                <div
                  key={prj.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <strong className="text-xs font-bold text-slate-800 block">
                      {prj.name}
                    </strong>
                    <span className="text-[11px] font-medium text-slate-500">
                      Key: {prj.key || `#${prj.id}`}
                    </span>
                  </div>
                  {/* <Link
                    href={`/dashboard/workspace?projectId=${prj.id}`}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] transition-colors"
                  >
                    Open Workspace
                  </Link> */}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Leave Requests */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">
              Recent Leave Applications
            </h2>
            <Link href="/dashboard/leaves" className="text-xs font-bold text-orange-600 hover:text-orange-700">
              Leave →
            </Link>
          </div>

          {leaveRequests.length === 0 ? (
            <p className="text-xs font-medium text-slate-500 py-4">No leave applications submitted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-400 font-bold uppercase text-[10px]">
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Dates</th>
                    <th className="pb-2">Days</th>
                    <th className="pb-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {leaveRequests.slice(0, 5).map((req) => (
                    <tr key={req.id}>
                      <td className="py-2.5 font-bold text-slate-800">
                        {req.leaveType?.name || "Leave"}
                      </td>
                      <td className="py-2.5 text-slate-500">
                        {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 font-semibold text-slate-800">
                        {Number(req.totalDays).toLocaleString(undefined, { maximumFractionDigits: 1 })}d
                        {req.halfDayPeriod && (
                          <span className="ml-1 text-[10px] font-bold text-orange-600">
                            {req.halfDayPeriod === "FIRST_HALF" ? "First half" : "Second half"}
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
    </div>
  );
}
