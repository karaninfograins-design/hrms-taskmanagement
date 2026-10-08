"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";

type Meeting = {
  id: number;
  title: string;
  description?: string | null;
  agenda?: string | null;
  timezone?: string | null;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  organizer: { id: number; name: string; email: string };
  participants?: Array<{ user: { id: number; name: string } }>;
};

type ViewMode = "MONTH" | "WEEK" | "DAY" | "AGENDA";

export default function GoogleStyleMeetingCalendarPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [companyHolidays, setCompanyHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Calendar view states
  const [viewMode, setViewMode] = useState<ViewMode>("MONTH");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>([
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ]);

  // Create Meeting Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAgenda, setNewAgenda] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newStartTime, setNewStartTime] = useState("10:00");
  const [newEndTime, setNewEndTime] = useState("11:00");
  const [newTimezone, setNewTimezone] = useState("Asia/Kolkata (IST)");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  const fetchMeetings = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/meetings", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch (err) {
      console.error("Error fetching meetings:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/employees", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
  };

  const fetchHolidays = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/holidays", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCompanyHolidays(data.holidays || []);
      }
    } catch (err) {
      console.error("Error fetching holidays:", err);
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchMeetings();
      fetchEmployees();
      fetchHolidays();
    }
  }, [session?.token]);

  // Navigation handlers
  const handleToday = () => setCurrentDate(new Date());

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "MONTH") d.setMonth(d.getMonth() - 1);
    else if (viewMode === "WEEK") d.setDate(d.getDate() - 7);
    else if (viewMode === "DAY") d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "MONTH") d.setMonth(d.getMonth() + 1);
    else if (viewMode === "WEEK") d.setDate(d.getDate() + 7);
    else if (viewMode === "DAY") d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  // Status Filter Toggle
  const toggleStatusFilter = (st: string) => {
    if (selectedStatusFilters.includes(st)) {
      setSelectedStatusFilters(selectedStatusFilters.filter((s) => s !== st));
    } else {
      setSelectedStatusFilters([...selectedStatusFilters, st]);
    }
  };

  // Submit New Meeting
  const handleCreateMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setSubmitting(true);
    try {
      const startDateTime = new Date(`${newDate}T${newStartTime}:00`).toISOString();
      const endDateTime = new Date(`${newDate}T${newEndTime}:00`).toISOString();

      const res = await fetch("http://localhost:5000/api/meetings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          agenda: newAgenda.trim(),
          startTime: startDateTime,
          endTime: endDateTime,
          timezone: newTimezone,
          participantIds: selectedParticipantIds,
        }),
      });

      if (!res.ok) throw new Error("Failed to create meeting");
      setShowCreateModal(false);
      setNewTitle("");
      setNewAgenda("");
      setSelectedParticipantIds([]);
      await fetchMeetings();
    } catch (err: any) {
      alert(err.message || "Error scheduling meeting");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading Calendar...</main>;
  }

  // Filter meetings by selected status
  const visibleMeetings = meetings.filter((m) =>
    selectedStatusFilters.includes(m.status)
  );

  // Month calculation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Week calculation
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  return (
    <main className="app-shell bg-slate-50 min-h-screen">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "60px" }}>
          {/* Top Google Calendar Navigation Header */}
          <div className="bg-white rounded-3xl p-4 md:p-6 border border-slate-200/80 shadow-xs mb-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white font-black text-xl flex items-center justify-center shadow-xs">
                  📅
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900 leading-tight">
                    HRMS Meeting Calendar
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    Google Calendar-inspired real-time meeting scheduling and timezone management.
                  </p>
                </div>
              </div>

              {/* Navigation Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleToday}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all"
                >
                  Today
                </button>

                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                  <button
                    onClick={handlePrev}
                    className="w-8 h-8 rounded-lg hover:bg-white text-slate-700 font-bold text-xs flex items-center justify-center transition-all shadow-xs"
                  >
                    ◀
                  </button>
                  <button
                    onClick={handleNext}
                    className="w-8 h-8 rounded-lg hover:bg-white text-slate-700 font-bold text-xs flex items-center justify-center transition-all shadow-xs"
                  >
                    ▶
                  </button>
                </div>

                <span className="text-sm font-black text-slate-900 min-w-[140px]">
                  {monthName} {year}
                </span>

                {/* View Mode Toggle Pills */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                  {(["MONTH", "WEEK", "DAY", "AGENDA"] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                        viewMode === mode
                          ? "bg-white text-orange-600 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {mode.charAt(0) + mode.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                {/* Prominent "+ Schedule Meeting" Button */}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl text-xs transition-all shadow-xs flex items-center gap-2"
                >
                  <span>+</span> Schedule Meeting
                </button>
              </div>
            </div>
          </div>

          {/* Main Layout: Left Mini-Calendar Sidebar + Calendar Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Sidebar Widgets */}
            <div className="lg:col-span-3 space-y-6">
              {/* Mini Calendar Card */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Mini Calendar
                </h3>
                <div className="text-center font-bold text-xs text-orange-600 mb-2">
                  {monthName} {year}
                </div>
                <div className="grid grid-cols-7 text-center text-[10px] font-black text-slate-400 mb-1">
                  <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
                </div>
                <div className="grid grid-cols-7 text-center text-xs font-medium gap-1">
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                    <div key={i} />
                  ))}
                  {daysArray.map((day) => {
                    const isToday =
                      day === new Date().getDate() &&
                      month === new Date().getMonth() &&
                      year === new Date().getFullYear();
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          const newD = new Date(year, month, day);
                          setCurrentDate(newD);
                        }}
                        className={`w-7 h-7 mx-auto rounded-lg text-[11px] font-bold flex items-center justify-center transition-all ${
                          isToday
                            ? "bg-orange-500 text-white font-black shadow-xs"
                            : "hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Filter Checklist */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Meeting Filters
                </h3>
                <div className="space-y-2 text-xs font-semibold">
                  {[
                    { key: "SCHEDULED", label: "Scheduled", color: "bg-blue-500" },
                    { key: "IN_PROGRESS", label: "Live In Progress", color: "bg-emerald-500" },
                    { key: "COMPLETED", label: "Completed", color: "bg-slate-400" },
                    { key: "CANCELLED", label: "Cancelled", color: "bg-rose-500" },
                  ].map((filter) => (
                    <label
                      key={filter.key}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${filter.color}`} />
                        <span className="text-slate-800">{filter.label}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedStatusFilters.includes(filter.key)}
                        onChange={() => toggleStatusFilter(filter.key)}
                        className="w-4 h-4 text-orange-500 rounded border-slate-300 focus:ring-orange-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Main Calendar View Container */}
            <div className="lg:col-span-9">
              {loading ? (
                <div className="bg-white rounded-3xl p-12 text-center text-xs text-slate-400 font-medium border border-slate-200">
                  Loading Google Calendar schedule...
                </div>
              ) : (
                <>
                  {/* 1. MONTH VIEW */}
                  {viewMode === "MONTH" && (
                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-black text-slate-500 uppercase tracking-wider py-3">
                        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                      </div>

                      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 min-h-[550px]">
                        {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                          <div key={`empty-${idx}`} className="bg-slate-50/40 p-2" />
                        ))}

                        {daysArray.map((day) => {
                          const dayDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                          const dayMeetings = visibleMeetings.filter((m) => {
                            const mDateStr = new Date(m.startTime).toISOString().split("T")[0];
                            return mDateStr === dayDateStr;
                          });

                          const dayHoliday = companyHolidays.find((h) => {
                            const hDateStr = new Date(h.date).toISOString().split("T")[0];
                            return hDateStr === dayDateStr;
                          });

                          const isToday =
                            day === new Date().getDate() &&
                            month === new Date().getMonth() &&
                            year === new Date().getFullYear();

                          return (
                            <div
                              key={day}
                              className={`p-2.5 min-h-[110px] transition-colors flex flex-col justify-start ${
                                isToday
                                  ? "bg-orange-50/40"
                                  : dayHoliday
                                  ? "bg-amber-50/40 hover:bg-amber-50/70"
                                  : "hover:bg-slate-50/80"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span
                                  className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center ${
                                    isToday
                                      ? "bg-orange-500 text-white"
                                      : dayHoliday
                                      ? "bg-amber-500 text-white"
                                      : "text-slate-800"
                                  }`}
                                >
                                  {day}
                                </span>
                                {dayHoliday && (
                                  <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider bg-amber-100 px-1.5 py-0.5 rounded-md">
                                    Holiday
                                  </span>
                                )}
                              </div>

                              {/* Company Holiday Banner Chip */}
                              {dayHoliday && (
                                <div
                                  onClick={() => router.push("/dashboard/company-calendar")}
                                  className="mb-1.5 p-1.5 rounded-xl bg-amber-100/90 hover:bg-amber-200 text-amber-900 border border-amber-300/80 text-[10px] font-black cursor-pointer transition-all shadow-2xs"
                                  title={dayHoliday.description || dayHoliday.title}
                                >
                                  <p className="truncate">🎉 {dayHoliday.title}</p>
                                </div>
                              )}

                              <div className="space-y-1.5 overflow-y-auto max-h-24">
                                {dayMeetings.map((m) => (
                                  <div
                                    key={m.id}
                                    onClick={() => router.push("/dashboard/meetings")}
                                    className={`p-1.5 rounded-xl text-[10px] font-extrabold cursor-pointer transition-transform hover:scale-[1.02] shadow-2xs ${
                                      m.status === "SCHEDULED"
                                        ? "bg-blue-50 text-blue-900 border-l-3 border-blue-500"
                                        : m.status === "IN_PROGRESS"
                                        ? "bg-emerald-50 text-emerald-900 border-l-3 border-emerald-500"
                                        : m.status === "COMPLETED"
                                        ? "bg-slate-100 text-slate-700"
                                        : "bg-rose-50 text-rose-900 border-l-3 border-rose-500"
                                    }`}
                                  >
                                    <p className="truncate font-black">{m.title}</p>
                                    <p className="opacity-70 text-[9px]">
                                      {new Date(m.startTime).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. WEEK VIEW */}
                  {viewMode === "WEEK" && (
                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-3">
                        {weekDays.map((d, i) => {
                          const dStr = d.toISOString().split("T")[0];
                          const hasH = companyHolidays.some(
                            (h) => new Date(h.date).toISOString().split("T")[0] === dStr
                          );
                          return (
                            <div key={i} className="space-y-0.5">
                              <p className="text-[10px] font-black text-slate-400 uppercase">
                                {d.toLocaleDateString("default", { weekday: "short" })}
                              </p>
                              <p className={`text-xs font-black ${hasH ? "text-amber-600 font-black" : "text-slate-900"}`}>
                                {d.getDate()} {hasH && "🎉"}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-slate-100 p-4 min-h-[500px]">
                        {weekDays.map((d, i) => {
                          const dateStr = d.toISOString().split("T")[0];
                          const dayMtgs = visibleMeetings.filter(
                            (m) => new Date(m.startTime).toISOString().split("T")[0] === dateStr
                          );
                          const dayHol = companyHolidays.find(
                            (h) => new Date(h.date).toISOString().split("T")[0] === dateStr
                          );

                          return (
                            <div key={i} className="space-y-2 p-1">
                              {dayHol && (
                                <div
                                  onClick={() => router.push("/dashboard/company-calendar")}
                                  className="p-2 bg-amber-100 border border-amber-300 text-amber-900 rounded-2xl text-[10px] font-black cursor-pointer hover:bg-amber-200 transition-all shadow-xs"
                                >
                                  🎉 {dayHol.title}
                                  <span className="block text-[9px] text-amber-700 font-bold">Official Holiday</span>
                                </div>
                              )}
                              {dayMtgs.map((m) => (
                                <div
                                  key={m.id}
                                  onClick={() => router.push("/dashboard/meetings")}
                                  className="p-2 bg-orange-50 border border-orange-200 rounded-2xl text-xs space-y-1 cursor-pointer hover:bg-orange-100 transition-all shadow-xs"
                                >
                                  <p className="font-black text-orange-950 truncate">{m.title}</p>
                                  <p className="text-[10px] text-orange-700 font-bold">
                                    {new Date(m.startTime).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. DAY VIEW */}
                  {viewMode === "DAY" && (
                    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                      <div className="border-b border-slate-100 pb-3">
                        <h2 className="text-base font-black text-slate-900">
                          {currentDate.toLocaleDateString("default", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </h2>
                      </div>

                      {/* Check if current day is a company holiday */}
                      {(() => {
                        const currentStr = currentDate.toISOString().split("T")[0];
                        const hol = companyHolidays.find(
                          (h) => new Date(h.date).toISOString().split("T")[0] === currentStr
                        );
                        if (!hol) return null;
                        return (
                          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex items-center justify-between shadow-xs">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">🎉</span>
                              <div>
                                <h3 className="text-sm font-black text-amber-900">
                                  {hol.title} (Official Company Holiday)
                                </h3>
                                <p className="text-xs text-amber-800 font-medium mt-0.5">
                                  {hol.description || "Office closed according to company holiday policy."}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-black uppercase text-amber-700 bg-amber-200/80 px-3 py-1 rounded-xl">
                              {hol.type || "Holiday"}
                            </span>
                          </div>
                        );
                      })()}

                      <div className="space-y-3">
                        {visibleMeetings
                          .filter(
                            (m) =>
                              new Date(m.startTime).toISOString().split("T")[0] ===
                              currentDate.toISOString().split("T")[0]
                          )
                          .map((m) => (
                            <div
                              key={m.id}
                              className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50 flex items-center justify-between"
                            >
                              <div>
                                <h4 className="text-sm font-black text-slate-900">{m.title}</h4>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {new Date(m.startTime).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  -{" "}
                                  {new Date(m.endTime).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  ({m.timezone || "IST"})
                                </p>
                              </div>
                              <button
                                onClick={() => router.push("/dashboard/meetings")}
                                className="px-3 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-xs"
                              >
                                Join LiveKit 🎥
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* 4. AGENDA VIEW */}
                  {viewMode === "AGENDA" && (
                    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                      <h2 className="text-base font-black text-slate-900">Upcoming Agenda & Company Holidays</h2>
                      <div className="divide-y divide-slate-100 space-y-3">
                        {/* Render Holidays in Agenda */}
                        {companyHolidays.map((h) => (
                          <div
                            key={`hol-${h.id}`}
                            className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/50 p-3 rounded-2xl border border-amber-200/60"
                          >
                            <div>
                              <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                🎉 Company Holiday
                              </span>
                              <h3 className="text-sm font-black text-amber-950 mt-1">{h.title}</h3>
                              <p className="text-xs text-amber-800 font-medium">
                                📅 {new Date(h.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                              </p>
                              {h.description && (
                                <p className="text-xs text-amber-700 italic mt-0.5">"{h.description}"</p>
                              )}
                            </div>
                            <span className="text-xs font-bold text-amber-800 bg-white px-3 py-1 rounded-xl border border-amber-300 self-start sm:self-center">
                              Official Holiday
                            </span>
                          </div>
                        ))}

                        {visibleMeetings.map((m) => (
                          <div
                            key={m.id}
                            className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold uppercase">
                                {m.status}
                              </span>
                              <h3 className="text-sm font-black text-slate-900 mt-1">{m.title}</h3>
                              <p className="text-xs text-slate-500 font-medium">
                                🕒 {new Date(m.startTime).toLocaleString()} | Organized by{" "}
                                <strong>{m.organizer.name}</strong>
                              </p>
                              {m.agenda && (
                                <p className="text-xs text-slate-600 italic mt-1">"{m.agenda}"</p>
                              )}
                            </div>
                            <button
                              onClick={() => router.push("/dashboard/meetings")}
                              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl shadow-xs"
                            >
                              View / Join 🎥
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Schedule Meeting Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <h2 className="text-base font-black text-slate-900">Schedule New Meeting</h2>
                <form onSubmit={handleCreateMeetingSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Meeting Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sprint Architecture Sync"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Agenda / Description
                    </label>
                    <textarea
                      placeholder="Meeting objective and discussion points..."
                      value={newAgenda}
                      onChange={(e) => setNewAgenda(e.target.value)}
                      className="w-full h-20 p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Timezone
                      </label>
                      <input
                        type="text"
                        value={newTimezone}
                        onChange={(e) => setNewTimezone(e.target.value)}
                        className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={newStartTime}
                        onChange={(e) => setNewStartTime(e.target.value)}
                        className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        End Time
                      </label>
                      <input
                        type="time"
                        value={newEndTime}
                        onChange={(e) => setNewEndTime(e.target.value)}
                        className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Invite Attendees
                    </label>
                    <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2 divide-y divide-slate-100">
                      {employees
                        .filter((emp) => emp.id !== session.user.id)
                        .map((emp) => {
                          const isSelected = selectedParticipantIds.includes(emp.id);
                          return (
                            <label
                              key={emp.id}
                              className="flex items-center justify-between p-2 hover:bg-slate-50 cursor-pointer text-xs font-semibold text-slate-800"
                            >
                              <span>{emp.name}</span>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedParticipantIds((prev) =>
                                      prev.filter((id) => id !== emp.id)
                                    );
                                  } else {
                                    setSelectedParticipantIds((prev) => [...prev, emp.id]);
                                  }
                                }}
                                className="w-4 h-4 text-orange-500 rounded border-slate-300 focus:ring-orange-500"
                              />
                            </label>
                          );
                        })}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2.5 text-xs bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl shadow-xs disabled:opacity-50"
                    >
                      {submitting ? "Scheduling..." : "Schedule Meeting"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
