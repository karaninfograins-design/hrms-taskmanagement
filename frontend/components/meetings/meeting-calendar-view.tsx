"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getAuthToken } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api-config";
import { showSuccessToast, showErrorToast, showWarningToast } from "@/lib/swal";

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
  members?: Array<{ user: { id: number; name: string }; status?: string }>;
  participants?: Array<{ user: { id: number; name: string } }>;
};

const toLocalDateStr = (dateInput: string | Date) => {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

type ViewMode = "MONTH" | "WEEK" | "DAY" | "AGENDA";

export function MeetingCalendarView({
  onSwitchToMeetings,
}: {
  onSwitchToMeetings?: () => void;
}) {
  const router = useRouter();

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

  const fetchMeetings = async () => {
    try {
      const res = await fetch(buildApiUrl("/api/meetings"), {
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
      const res = await fetch(buildApiUrl("/api/employees"), {
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
      const year = currentDate.getFullYear();
      const res = await fetch(buildApiUrl(`/api/holidays?year=${year}`), {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCompanyHolidays(data.holidays || []);
      }
    } catch (err) {
      console.error("Error fetching company holidays:", err);
    }
  };

  useEffect(() => {
    fetchMeetings();
    fetchEmployees();
    fetchHolidays();
  }, [currentDate.getFullYear()]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthName = monthNames[month];

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handlePrev = () => {
    if (viewMode === "MONTH") {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === "WEEK") {
      const prevWeek = new Date(currentDate);
      prevWeek.setDate(currentDate.getDate() - 7);
      setCurrentDate(prevWeek);
    } else {
      const prevDay = new Date(currentDate);
      prevDay.setDate(currentDate.getDate() - 1);
      setCurrentDate(prevDay);
    }
  };

  const handleNext = () => {
    if (viewMode === "MONTH") {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === "WEEK") {
      const nextWeek = new Date(currentDate);
      nextWeek.setDate(currentDate.getDate() + 7);
      setCurrentDate(nextWeek);
    } else {
      const nextDay = new Date(currentDate);
      nextDay.setDate(currentDate.getDate() + 1);
      setCurrentDate(nextDay);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const toggleStatusFilter = (status: string) => {
    setSelectedStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const getFilteredMeetings = () => {
    return meetings.filter((m) => selectedStatusFilters.includes(m.status));
  };

  const getMeetingsForDay = (targetDate: Date) => {
    const dateStr = toLocalDateStr(targetDate);
    return getFilteredMeetings().filter((m) => {
      const mDateStr = toLocalDateStr(m.startTime);
      return mDateStr === dateStr;
    });
  };

  const getHolidaysForDay = (targetDate: Date) => {
    const dateStr = toLocalDateStr(targetDate);
    return companyHolidays.filter((h) => {
      const hDateStr = toLocalDateStr(h.date);
      return hDateStr === dateStr;
    });
  };

  const calendarHeading = (() => {
    if (viewMode === "MONTH") {
      return `${monthName} ${year}`;
    }
    if (viewMode === "DAY") {
      return `${currentDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`;
    }
    if (viewMode === "WEEK") {
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${endOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return `${monthName} ${year} Agenda`;
  })();

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      showWarningToast("Please enter a meeting title");
      return;
    }

    try {
      setSubmitting(true);
      const startDateTime = new Date(`${newDate}T${newStartTime}:00`);
      const endDateTime = new Date(`${newDate}T${newEndTime}:00`);

      if (endDateTime <= startDateTime) {
        showWarningToast("End time must be after start time");
        setSubmitting(false);
        return;
      }

      const res = await fetch(buildApiUrl("/api/meetings"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          agenda: newAgenda.trim() || undefined,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          timezone: newTimezone,
          participantIds: selectedParticipantIds,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to schedule meeting");
      }

      showSuccessToast("Meeting scheduled successfully!");
      setShowCreateModal(false);
      setNewTitle("");
      setNewAgenda("");
      setSelectedParticipantIds([]);
      fetchMeetings();
    } catch (err: any) {
      console.error(err);
      showErrorToast(err.message || "Failed to schedule meeting");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SCHEDULED":
        return "bg-blue-50 text-blue-700 border-blue-200/60";
      case "IN_PROGRESS":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/60 animate-pulse";
      case "COMPLETED":
        return "bg-slate-50 text-slate-600 border-slate-200/60";
      case "CANCELLED":
        return "bg-rose-50 text-rose-700 border-rose-200/60";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Calendar Header / Navigation Controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleToday}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 cursor-pointer"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              aria-label="Previous period"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleNext}
              aria-label="Next period"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="min-w-36 text-sm font-black text-slate-900 pl-1">{calendarHeading}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex w-fit items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(["MONTH", "WEEK", "DAY", "AGENDA"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  viewMode === mode
                    ? "bg-white text-orange-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {mode.charAt(0) + mode.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#ea580c] px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#c2410c] cursor-pointer"
          >
            <Plus size={15} />
            New Meeting
          </button>
        </div>
      </div>

      {/* Main Layout: Left Mini-Calendar Sidebar + Calendar Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Sidebar Widgets */}
        <div className="space-y-4 lg:col-span-3">
          {/* Mini Calendar Card */}
          <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                Mini calendar
              </h3>
              <CalendarDays size={14} className="text-slate-400" />
            </div>
            <div className="text-center text-xs font-bold text-orange-600">
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
                    className={`w-7 h-7 mx-auto rounded-lg text-[11px] font-bold flex items-center justify-center transition-all cursor-pointer ${
                      isToday
                        ? "bg-[#ea580c] text-white font-black shadow-xs"
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
          <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
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
            <div className="bg-white rounded-2xl p-12 text-center text-xs text-slate-400 font-medium border border-slate-200">
              Loading calendar schedule...
            </div>
          ) : (
            <>
              {/* 1. MONTH VIEW */}
              {viewMode === "MONTH" && (
                <div className="overflow-x-auto scrollbar-none no-scrollbar rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-black text-slate-500 uppercase tracking-wider py-3">
                      <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                    </div>
                    <div className="grid grid-cols-7 auto-rows-fr bg-slate-200 gap-px">
                      {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                        <div key={`empty-${idx}`} className="bg-slate-50/60 min-h-[90px] p-2" />
                      ))}
                      {daysArray.map((day) => {
                        const thisDay = new Date(year, month, day);
                        const isToday =
                          day === new Date().getDate() &&
                          month === new Date().getMonth() &&
                          year === new Date().getFullYear();
                        const dayMeetings = getMeetingsForDay(thisDay);
                        const dayHolidays = getHolidaysForDay(thisDay);

                        return (
                          <div
                            key={`day-${day}`}
                            className={`bg-white min-h-[100px] p-2 flex flex-col justify-between transition hover:bg-orange-50/20`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span
                                className={`text-xs font-black inline-flex items-center justify-center w-6 h-6 rounded-full ${
                                  isToday ? "bg-[#ea580c] text-white" : "text-slate-800"
                                }`}
                              >
                                {day}
                              </span>
                            </div>

                            <div className="space-y-1 flex-1 overflow-y-auto max-h-[75px] scrollbar-none no-scrollbar">
                              {dayHolidays.map((h: any) => (
                                <div
                                  key={h.id}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 truncate"
                                  title={`Holiday: ${h.name}`}
                                >
                                  🎉 {h.name}
                                </div>
                              ))}
                              {dayMeetings.map((m) => (
                                <button
                                  key={m.id}
                                  onClick={() => {
                                    if (onSwitchToMeetings) onSwitchToMeetings();
                                    else router.push(`/dashboard/meetings?meetingId=${m.id}`);
                                  }}
                                  className={`w-full text-left text-[10px] font-bold px-1.5 py-0.5 rounded border truncate cursor-pointer transition ${getStatusBadge(m.status)}`}
                                  title={`${m.title} (${new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                                >
                                  {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {m.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. WEEK VIEW */}
              {viewMode === "WEEK" && (
                <div className="overflow-x-auto scrollbar-none no-scrollbar rounded-2xl border border-slate-200/80 bg-white shadow-sm p-4">
                  <div className="grid grid-cols-7 gap-2 min-w-[680px]">
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const startOfWeek = new Date(currentDate);
                      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + idx);
                      const isToday =
                        startOfWeek.toDateString() === new Date().toDateString();
                      const dayMeetings = getMeetingsForDay(startOfWeek);
                      const dayHolidays = getHolidaysForDay(startOfWeek);

                      return (
                        <div key={idx} className="border border-slate-200 rounded-xl p-3 min-h-[300px] flex flex-col bg-slate-50/50">
                          <div className="text-center pb-2 border-b border-slate-200 mb-2">
                            <p className="text-[10px] font-black uppercase text-slate-400">
                              {startOfWeek.toLocaleDateString("en-US", { weekday: "short" })}
                            </p>
                            <span
                              className={`text-xs font-black inline-flex items-center justify-center w-6 h-6 rounded-full mt-0.5 ${
                                isToday ? "bg-[#ea580c] text-white" : "text-slate-800"
                              }`}
                            >
                              {startOfWeek.getDate()}
                            </span>
                          </div>

                          <div className="space-y-1.5 flex-1 overflow-y-auto">
                            {dayHolidays.map((h: any) => (
                              <div
                                key={h.id}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200"
                              >
                                🎉 {h.name}
                              </div>
                            ))}
                            {dayMeetings.map((m) => (
                              <div
                                key={m.id}
                                className={`p-2 rounded-xl border text-[11px] font-semibold space-y-1 ${getStatusBadge(m.status)}`}
                              >
                                <p className="font-black truncate">{m.title}</p>
                                <p className="text-[10px] opacity-80">
                                  {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{" "}
                                  {new Date(m.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

              {/* 3. DAY / AGENDA VIEW */}
              {(viewMode === "DAY" || viewMode === "AGENDA") && (
                <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-5 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Events for {calendarHeading}
                  </h3>
                  {getMeetingsForDay(currentDate).length === 0 && getHolidaysForDay(currentDate).length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400 font-medium">
                      No meetings or holidays scheduled for this date.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {getHolidaysForDay(currentDate).map((h: any) => (
                        <div key={h.id} className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                          <div>
                            <span className="text-xs font-black text-emerald-800">🎉 Holiday: {h.name}</span>
                            <p className="text-[11px] text-emerald-700">{h.description || "Official Company Holiday"}</p>
                          </div>
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800">Holiday</span>
                        </div>
                      ))}
                      {getMeetingsForDay(currentDate).map((m) => (
                        <div key={m.id} className={`p-4 rounded-xl border flex items-center justify-between ${getStatusBadge(m.status)}`}>
                          <div className="space-y-1">
                            <span className="text-xs font-black text-slate-900">{m.title}</span>
                            <p className="text-[11px] text-slate-500">
                              {new Date(m.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                              {new Date(m.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              if (onSwitchToMeetings) onSwitchToMeetings();
                              else router.push(`/dashboard/meetings?meetingId=${m.id}`);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50 cursor-pointer"
                          >
                            Open
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-black text-slate-900">Schedule New Meeting</h3>
            <form onSubmit={handleCreateMeeting} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Weekly Engineering Sync"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Agenda / Description</label>
                <textarea
                  value={newAgenda}
                  onChange={(e) => setNewAgenda(e.target.value)}
                  placeholder="Optional agenda notes..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:border-orange-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:border-orange-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:border-orange-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-extrabold bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Scheduling..." : "Schedule Meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

