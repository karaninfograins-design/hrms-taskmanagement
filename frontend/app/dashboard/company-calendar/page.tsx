"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarPlus,
  Clock3,
  PartyPopper,
  Palmtree,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api-config";

type Holiday = {
  id: number;
  title: string;
  description?: string | null;
  date: string;
  type: "OFFICIAL_HOLIDAY" | "OPTIONAL_HOLIDAY" | "COMPANY_EVENT";
  createdBy: { id: number; name: string };
};

type HolidayType = Holiday["type"];

const holidayTypes: Array<{ value: "ALL" | HolidayType; label: string }> = [
  { value: "ALL", label: "All events" },
  { value: "OFFICIAL_HOLIDAY", label: "Official holidays" },
  { value: "OPTIONAL_HOLIDAY", label: "Optional holidays" },
  { value: "COMPANY_EVENT", label: "Company events" },
];

const getHolidayDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`);

export default function CompanyCalendarPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<"ALL" | HolidayType>("ALL");

  // Create Holiday Modal State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [type, setType] = useState<"OFFICIAL_HOLIDAY" | "OPTIONAL_HOLIDAY" | "COMPANY_EVENT">("OFFICIAL_HOLIDAY");
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  const fetchHolidays = async () => {
    try {
      const res = await fetch(buildApiUrl("/api/holidays"), {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setHolidays(data.holidays || []);
    } catch (err) {
      console.error("Error fetching holidays:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchHolidays();
    }
  }, [session?.token]);

  const roleName = typeof session?.user?.role === "string"
    ? session.user.role
    : (session?.user?.role as any)?.name || (session?.user?.role === 1 ? "SUPER_ADMIN" : session?.user?.role === 2 ? "ADMIN" : session?.user?.role === 4 ? "HR" : "EMPLOYEE");
  const userRoleId = typeof session?.user?.role === "number"
    ? session.user.role
    : (session?.user?.role as any)?.id || (roleName === "SUPER_ADMIN" ? 1 : roleName === "ADMIN" ? 2 : roleName === "HR" ? 4 : 3);
  const isHrOrAdmin = roleName === "ADMIN" || roleName === "SUPER_ADMIN" || roleName === "HR" || userRoleId === 1 || userRoleId === 2 || userRoleId === 4;

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHrOrAdmin) {
      alert("Only HR, Admins, and Super Admins can create company holidays.");
      return;
    }
    if (!title.trim() || !date) return;

    setSubmitting(true);
    try {
      const res = await fetch(buildApiUrl("/api/holidays"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          date,
          type,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to create company holiday");
      }
      setShowModal(false);
      setTitle("");
      setDescription("");
      setDate("");
      await fetchHolidays();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error adding holiday");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    if (!isHrOrAdmin) {
      alert("Only HR, Admins, and Super Admins can delete company holidays.");
      return;
    }
    if (!confirm("Are you sure you want to delete this company holiday?")) return;
    try {
      const res = await fetch(buildApiUrl(`/api/holidays/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to delete company holiday");
      }
      setHolidays((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      console.error("Error deleting holiday:", err);
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading Company Calendar...</main>;
  }

  const sortedHolidays = [...holidays].sort(
    (a, b) => getHolidayDate(a.date).getTime() - getHolidayDate(b.date).getTime()
  );
  const filteredHolidays = sortedHolidays.filter((h) => {
    if (filterType === "ALL") return true;
    return h.type === filterType;
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingHolidays = sortedHolidays.filter((holiday) => getHolidayDate(holiday.date) >= today);
  const nextHoliday = upcomingHolidays[0];
  const officialCount = holidays.filter((holiday) => holiday.type === "OFFICIAL_HOLIDAY").length;
  const eventCount = holidays.filter((holiday) => holiday.type === "COMPANY_EVENT").length;

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} onSignOut={handleSignOut} />
        <section className="dashboard-content !bg-slate-50/70" style={{ paddingBottom: "80px" }}>
          <div className="w-full space-y-4">
            <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#172554] via-[#1e3a6f] to-slate-900 px-5 py-5 text-white shadow-md sm:px-7 sm:py-6">
              <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-white/10" />
              <div className="pointer-events-none absolute -right-2 -top-14 h-52 w-52 rounded-full border border-white/10" />
              <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-2xl">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100">
                    <CalendarDays size={13} />
                    HR & office policies
                  </div>
                  <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                    Company calendar
                  </h1>
                  <p className="max-w-xl text-sm leading-6 text-blue-100/80">
                    Keep your team in sync with upcoming holidays, optional leave days, and company events.
                  </p>
                </div>
                {isHrOrAdmin && (
                  <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-xs font-bold text-white shadow-md transition hover:bg-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-300/30"
                  >
                    <Plus size={16} />
                    Add calendar event
                  </button>
                )}
              </div>
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500">Upcoming events</p>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <CalendarDays size={17} />
                  </span>
                </div>
                <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{upcomingHolidays.length}</p>
                <p className="mt-1 text-[11px] text-slate-400">On the company calendar</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500">Official holidays</p>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <Palmtree size={17} />
                  </span>
                </div>
                <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{officialCount}</p>
                <p className="mt-1 text-[11px] text-slate-400">Office closure days</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500">Company events</p>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <PartyPopper size={17} />
                  </span>
                </div>
                <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{eventCount}</p>
                <p className="mt-1 text-[11px] text-slate-400">Team moments to look forward to</p>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-orange-800">Next on the calendar</p>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-orange-600">
                    <Clock3 size={17} />
                  </span>
                </div>
                {nextHoliday ? (
                  <>
                    <p className="mt-3 truncate text-sm font-black text-slate-900">{nextHoliday.title}</p>
                    <p className="mt-1 text-[11px] text-orange-800">
                      {getHolidayDate(nextHoliday.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-sm font-black text-slate-900">Nothing scheduled</p>
                    <p className="mt-1 text-[11px] text-orange-800">Check back for the next event</p>
                  </>
                )}
              </div>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-900">Calendar schedule</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {filteredHolidays.length} {filteredHolidays.length === 1 ? "event" : "events"} shown
                  </p>
                </div>
                <div className="flex gap-1.5 overflow-x-auto rounded-xl bg-slate-100 p-1">
                  {holidayTypes.map((item) => {
                    const count = item.value === "ALL"
                      ? holidays.length
                      : holidays.filter((holiday) => holiday.type === item.value).length;
                    const isSelected = filterType === item.value;
                    return (
                      <button
                        key={item.value}
                        onClick={() => setFilterType(item.value)}
                        aria-pressed={isSelected}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                          isSelected
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {item.label}
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                          isSelected ? "bg-orange-50 text-orange-700" : "bg-slate-200/70 text-slate-500"
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
                  ))}
                </div>
              ) : filteredHolidays.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <CalendarPlus size={25} />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-slate-800">
                    {holidays.length === 0 ? "Your calendar is ready" : "No events in this category"}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
                    {holidays.length === 0
                      ? "Company holidays and events will appear here when they are added."
                      : "Try another category to see more calendar events."}
                  </p>
                  {holidays.length === 0 && isHrOrAdmin && (
                    <button
                      onClick={() => setShowModal(true)}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#172554] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
                    >
                      <Plus size={14} />
                      Add the first event
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredHolidays.map((holiday) => {
                    const holidayDate = getHolidayDate(holiday.date);
                    const style = holiday.type === "OFFICIAL_HOLIDAY"
                      ? {
                          accent: "border-l-rose-400",
                          date: "bg-rose-50 text-rose-700",
                          tag: "bg-rose-50 text-rose-700",
                          icon: <Palmtree size={14} />,
                          label: "Official holiday",
                        }
                      : holiday.type === "OPTIONAL_HOLIDAY"
                        ? {
                            accent: "border-l-amber-400",
                            date: "bg-amber-50 text-amber-700",
                            tag: "bg-amber-50 text-amber-700",
                            icon: <CalendarDays size={14} />,
                            label: "Optional holiday",
                          }
                        : {
                            accent: "border-l-violet-400",
                            date: "bg-violet-50 text-violet-700",
                            tag: "bg-violet-50 text-violet-700",
                            icon: <PartyPopper size={14} />,
                            label: "Company event",
                          };

                    return (
                      <article
                        key={holiday.id}
                        className={`group relative flex min-h-36 gap-4 rounded-2xl border border-slate-200/80 border-l-4 ${style.accent} bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md`}
                      >
                        <div className={`flex h-[76px] w-[68px] shrink-0 flex-col items-center justify-center rounded-xl ${style.date}`}>
                          <span className="text-[10px] font-bold uppercase tracking-wider">
                            {holidayDate.toLocaleString(undefined, { month: "short" })}
                          </span>
                          <span className="mt-0.5 text-2xl font-black leading-none">{holidayDate.getDate()}</span>
                          <span className="mt-1 text-[10px] font-semibold">
                            {holidayDate.toLocaleString(undefined, { weekday: "short" })}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-bold ${style.tag}`}>
                              {style.icon}
                              {style.label}
                            </span>
                            {isHrOrAdmin && (
                              <button
                                onClick={() => handleDeleteHoliday(holiday.id)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100"
                                title="Delete event"
                                aria-label={`Delete ${holiday.title}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          <h3 className="mt-2 truncate text-sm font-bold text-slate-900">{holiday.title}</h3>
                          {holiday.description ? (
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                              {holiday.description}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-slate-400">
                              {holidayDate.toLocaleDateString(undefined, {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Add Holiday Modal */}
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-600">Company calendar</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900">Add an event</h2>
                    <p className="mt-1 text-xs text-slate-500">Share an upcoming date with everyone in the company.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close dialog"
                  >
                    <X size={17} />
                  </button>
                </div>
                <form onSubmit={handleCreateHoliday} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Holiday / Event Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Independence Day, Annual Hackathon"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Category Type
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as HolidayType)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    >
                      <option value="OFFICIAL_HOLIDAY">Official Holiday (Office Closed)</option>
                      <option value="OPTIONAL_HOLIDAY">Optional Holiday</option>
                      <option value="COMPANY_EVENT">Company Event / Celebration</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Description / Details
                    </label>
                    <textarea
                      placeholder="Optional details or policy notes..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full h-20 p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? "Saving..." : <><CalendarPlus size={14} /> Save event</>}
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
