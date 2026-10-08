"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";

type Holiday = {
  id: number;
  title: string;
  description?: string | null;
  date: string;
  type: "OFFICIAL_HOLIDAY" | "OPTIONAL_HOLIDAY" | "COMPANY_EVENT";
  createdBy: { id: number; name: string };
};

export default function CompanyCalendarPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>("ALL");

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
      const res = await fetch("http://localhost:5000/api/holidays", {
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
    : (session?.user?.role as any)?.name || "";
  const isHrOrAdmin = roleName === "ADMIN" || roleName === "SUPER_ADMIN" || roleName === "HR";

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;

    setSubmitting(true);
    try {
      const res = await fetch("http://localhost:5000/api/holidays", {
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

      if (!res.ok) throw new Error("Failed to create company holiday");
      setShowModal(false);
      setTitle("");
      setDescription("");
      setDate("");
      await fetchHolidays();
    } catch (err: any) {
      alert(err.message || "Error adding holiday");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    if (!confirm("Are you sure you want to delete this company holiday?")) return;
    try {
      const res = await fetch(`http://localhost:5000/api/holidays/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        setHolidays((prev) => prev.filter((h) => h.id !== id));
      }
    } catch (err) {
      console.error("Error deleting holiday:", err);
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading Company Calendar...</main>;
  }

  const filteredHolidays = holidays.filter((h) => {
    if (filterType === "ALL") return true;
    return h.type === filterType;
  });

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 welcome mb-6">
            <div>
              <p className="eyebrow">HR & OFFICE POLICIES</p>
              <h1 className="text-2xl font-black text-slate-900">Company Office Calendar</h1>
              <p className="text-xs text-slate-500 font-medium">
                Official company holidays, optional leave days, and corporate events schedule for all employees.
              </p>
            </div>

            {isHrOrAdmin && (
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs flex items-center gap-2"
              >
                <span>🎉</span> Mark Company Holiday / Event
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 mb-6 overflow-x-auto">
            {["ALL", "OFFICIAL_HOLIDAY", "OPTIONAL_HOLIDAY", "COMPANY_EVENT"].map((typeKey) => (
              <button
                key={typeKey}
                onClick={() => setFilterType(typeKey)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  filterType === typeKey
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {typeKey === "ALL"
                  ? "All Events"
                  : typeKey === "OFFICIAL_HOLIDAY"
                  ? "🔴 Official Holidays"
                  : typeKey === "OPTIONAL_HOLIDAY"
                  ? "🟠 Optional Holidays"
                  : "🔵 Company Events"}
              </button>
            ))}
          </div>

          {/* Holidays List Grid */}
          {loading ? (
            <p className="text-xs text-slate-400 font-medium animate-pulse">Loading office calendar...</p>
          ) : filteredHolidays.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-3">
                🗓️
              </div>
              <h3 className="text-sm font-bold text-slate-700">No Holidays Recorded</h3>
              <p className="text-xs text-slate-400 mt-1">
                There are no official office holidays or company events under this filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredHolidays.map((holiday) => {
                const holidayDate = new Date(holiday.date);
                const dayNum = holidayDate.getDate();
                const monthStr = holidayDate.toLocaleString("default", { month: "short" });
                const weekdayStr = holidayDate.toLocaleString("default", { weekday: "short" });

                return (
                  <div
                    key={holiday.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex items-start gap-4 hover:shadow-md transition-shadow relative group"
                  >
                    {/* Date Badge */}
                    <div className="w-14 h-16 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center flex-shrink-0 shadow-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {monthStr}
                      </span>
                      <span className="text-xl font-black text-orange-400 leading-none">
                        {dayNum}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium mt-0.5">
                        {weekdayStr}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            holiday.type === "OFFICIAL_HOLIDAY"
                              ? "bg-rose-100 text-rose-800"
                              : holiday.type === "OPTIONAL_HOLIDAY"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {holiday.type.replace("_", " ")}
                        </span>

                        {isHrOrAdmin && (
                          <button
                            onClick={() => handleDeleteHoliday(holiday.id)}
                            className="opacity-0 group-hover:opacity-100 text-rose-600 font-bold text-xs hover:bg-rose-50 px-1.5 py-0.5 rounded-lg transition-opacity"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        )}
                      </div>

                      <h3 className="text-sm font-black text-slate-900 mt-1.5">{holiday.title}</h3>
                      {holiday.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {holiday.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Holiday Modal */}
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <h2 className="text-base font-black text-slate-900">Mark Office Holiday / Event</h2>
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
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    >
                      <option value="OFFICIAL_HOLIDAY">🔴 Official Holiday (Office Closed)</option>
                      <option value="OPTIONAL_HOLIDAY">🟠 Optional Holiday</option>
                      <option value="COMPANY_EVENT">🔵 Company Event / Celebration</option>
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
                      className="px-4 py-2.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2.5 text-xs bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl shadow-xs disabled:opacity-50"
                    >
                      {submitting ? "Saving..." : "Save Holiday"}
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
