"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, Plus, Users, Video } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api-config";

type Meeting = {
  id: number;
  title: string;
  description: string | null;
  agenda?: string | null;
  roomName: string;
  startTime: string;
  endTime: string;
  timezone?: string;
  notes?: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  organizer: {
    id: number;
    name: string;
    email: string;
  };
  project?: {
    id: number;
    name: string;
  };
  members: Array<{
    user: {
      id: number;
      name: string;
    };
    status: string;
  }>;
};

export default function MeetingsPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Schedule / Edit Modal State
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [agenda, setAgenda] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("UTC");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Active LiveKit Call State
  const [activeCallMeeting, setActiveCallMeeting] = useState<Meeting | null>(null);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string>(process.env.NEXT_PUBLIC_LIVEKIT_URL || "");
  const [tokenLoading, setTokenLoading] = useState<boolean>(false);

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
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl("/api/meetings"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch meetings");
      const data = await res.json();
      setMeetings(data.meetings || []);
    } catch (err: any) {
      setError(err.message || "Failed to load meetings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchMeetings();
    }
  }, [session?.token]);

  const openScheduleModal = (meetingToEdit?: Meeting) => {
    const toLocalISO = (isoStr: string) => {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "";
      const offset = d.getTimezoneOffset();
      const local = new Date(d.getTime() - offset * 60000);
      return local.toISOString().slice(0, 16);
    };

    if (meetingToEdit) {
      setEditingMeeting(meetingToEdit);
      setTitle(meetingToEdit.title);
      setDescription(meetingToEdit.description || "");
      setAgenda(meetingToEdit.agenda || "");
      setStartTime(toLocalISO(meetingToEdit.startTime));
      setEndTime(toLocalISO(meetingToEdit.endTime));
      setTimezone(meetingToEdit.timezone || "UTC");
      setNotes(meetingToEdit.notes || "");
    } else {
      const nextHour = new Date();
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);
      const defaultStart = new Date(nextHour.getTime() - nextHour.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      const defaultEnd = new Date(nextHour.getTime() + 3600000 - nextHour.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);

      setEditingMeeting(null);
      setTitle("");
      setDescription("");
      setAgenda("");
      setStartTime(defaultStart);
      setEndTime(defaultEnd);
      setTimezone("UTC");
      setNotes("");
    }
    setShowScheduleModal(true);
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startTime || !endTime) return;

    if (new Date(endTime) <= new Date(startTime)) {
      alert("End time must be after start time");
      return;
    }

    setSubmitting(true);
    try {
      const token = getAuthToken();
      const url = editingMeeting
        ? buildApiUrl(`/api/meetings/${editingMeeting.id}`)
        : buildApiUrl("/api/meetings");
      const method = editingMeeting ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          agenda: agenda.trim(),
          startTime,
          endTime,
          timezone,
          notes: notes.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to save meeting");
      }

      setShowScheduleModal(false);
      fetchMeetings();
    } catch (err: any) {
      alert(err.message || "Error saving meeting");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMeeting = async (meetingId: number) => {
    if (!confirm("Are you sure you want to cancel and delete this meeting?")) return;
    try {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/api/meetings/${meetingId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.message || "Failed to delete meeting");
      }
    } catch (err: any) {
      console.error("Error deleting meeting:", err);
      alert(err.message || "Error deleting meeting");
    }
  };

  const handleJoinCall = async (meeting: Meeting) => {
    setActiveCallMeeting(meeting);
    setTokenLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/api/meetings/${meeting.id}/token`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to get LiveKit room token");
      setLivekitToken(data.token);
      setLivekitUrl(data.url || process.env.NEXT_PUBLIC_LIVEKIT_URL || "");
      // Refresh list to update status if transitioned to IN_PROGRESS
      fetchMeetings();
    } catch (err: any) {
      alert(err.message);
      setActiveCallMeeting(null);
    } finally {
      setTokenLoading(false);
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading meetings...</main>;
  }

  const filteredMeetings = meetings.filter((m) => {
    if (filterStatus === "ALL") return true;
    return m.status === filterStatus;
  });
  const meetingCounts = {
    all: meetings.length,
    scheduled: meetings.filter((m) => m.status === "SCHEDULED").length,
    inProgress: meetings.filter((m) => m.status === "IN_PROGRESS").length,
  };

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} onSignOut={handleSignOut} />
        <section className="dashboard-content !bg-slate-50/70" style={{ paddingBottom: "60px" }}>
          <div className="w-full space-y-4">
            <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#172554] via-[#1e3a6f] to-slate-900 px-5 py-5 text-white shadow-md sm:px-7">
              <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-white/10" />
              <div className="pointer-events-none absolute -right-2 -top-14 h-52 w-52 rounded-full border border-white/10" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-100">
                    <Video size={13} />
                    Collaboration
                  </div>
                  <h1 className="text-xl font-black tracking-tight sm:text-2xl">Meetings &amp; sync sessions</h1>
                  <p className="mt-1 text-xs text-blue-100/80">
                    Plan team discussions and join real-time video rooms.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => router.push("/dashboard/meetings/calendar")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 text-xs font-bold text-white transition hover:bg-white/20 w-full sm:w-auto"
              >
                <CalendarDays size={15} />
                Calendar
              </button>
              <button
                onClick={() => openScheduleModal()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600 w-full sm:w-auto"
              >
                <Plus size={15} />
                Schedule meeting
              </button>
            </div>
              </div>
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Total meetings", count: meetingCounts.all, icon: CalendarDays, tone: "text-blue-700 bg-blue-50" },
                { label: "Scheduled", count: meetingCounts.scheduled, icon: Clock3, tone: "text-orange-700 bg-orange-50" },
                { label: "In progress", count: meetingCounts.inProgress, icon: Video, tone: "text-emerald-700 bg-emerald-50" },
              ].map(({ label, count, icon: Icon, tone }) => (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
                    <Icon size={17} />
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="text-lg font-black leading-tight text-slate-900">{count}</p>
                  </div>
                </div>
              ))}
            </div>

          {/* Status Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {["ALL", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((statusKey) => (
              <button
                key={statusKey}
                onClick={() => setFilterStatus(statusKey)}
                className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold transition-all border ${
                  filterStatus === statusKey
                    ? "bg-[#172554] text-white border-[#172554] shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{statusKey === "ALL" ? "All meetings" : statusKey.replace("_", " ")}</span>
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] ${
                  filterStatus === statusKey ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {statusKey === "ALL"
                    ? meetings.length
                    : meetings.filter((meeting) => meeting.status === statusKey).length}
                </span>
              </button>
            ))}
          </div>

          {/* Meetings Grid */}
          {loading ? (
            <p className="text-xs text-slate-400 animate-pulse font-medium">Loading meetings...</p>
          ) : error ? (
            <p className="text-xs text-rose-500 font-semibold">{error}</p>
          ) : filteredMeetings.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
              <p className="text-slate-400 text-xs font-medium">No meetings found under this status filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredMeetings.map((m) => (
                <div
                  key={m.id}
                  className="group flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-5 lg:flex-row lg:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="max-w-full truncate rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700">
                        {m.roomName}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${
                          m.status === "SCHEDULED"
                            ? "bg-blue-100 text-blue-800"
                            : m.status === "IN_PROGRESS"
                            ? "bg-emerald-100 text-emerald-800"
                            : m.status === "COMPLETED"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-black text-slate-900">{m.title}</h3>
                      <div className="flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        <button
                          onClick={() => openScheduleModal(m)}
                          className="rounded-lg p-2 text-xs hover:bg-slate-100"
                          title="Edit"
                          aria-label={`Edit ${m.title}`}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteMeeting(m.id)}
                          className="rounded-lg p-2 text-xs text-rose-600 hover:bg-rose-50"
                          title="Cancel/Delete"
                          aria-label={`Cancel or delete ${m.title}`}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {m.agenda && (
                      <div className="mt-2 p-2 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-700 font-medium">
                        <strong>Agenda:</strong> {m.agenda}
                      </div>
                    )}

                    <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">
                      {m.description || "No detailed description."}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-medium text-slate-500">
                      <p className="inline-flex items-center gap-1.5">
                        <CalendarDays size={13} className="text-slate-400" />
                        <strong className="text-slate-700">{new Date(m.startTime).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</strong>
                        {new Date(m.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        <span>({m.timezone || "UTC"})</span>
                      </p>
                      <p>Organizer: <strong className="text-slate-700">{m.organizer.name}</strong></p>
                      {m.members.length > 0 && (
                        <p className="inline-flex items-center gap-1.5">
                          <Users size={13} className="text-slate-400" />
                          <strong className="text-slate-700">{m.members.length}</strong> participants
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleJoinCall(m)}
                    className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#172554] text-xs font-extrabold text-white shadow-sm transition hover:bg-[#1E3A8A] lg:w-48"
                  >
                    <Video size={15} />
                    Join meeting
                  </button>
                </div>
              ))}
            </div>
          )}

          </div>
          {/* Schedule / Edit Modal */}
          {showScheduleModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
                <h2 className="text-base font-black text-slate-900">
                  {editingMeeting ? "Edit Meeting" : "Schedule New Meeting"}
                </h2>
                <form onSubmit={handleSaveMeeting} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Meeting Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Weekly Product Sync"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Agenda
                    </label>
                    <input
                      type="text"
                      placeholder="Key topics to discuss..."
                      value={agenda}
                      onChange={(e) => setAgenda(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Start Time
                      </label>
                      <input
                        type="datetime-local"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        End Time
                      </label>
                      <input
                        type="datetime-local"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Timezone
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. UTC, IST, EST"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Description / Notes
                    </label>
                    <textarea
                      placeholder="Additional notes or links..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowScheduleModal(false)}
                      className="px-4 py-2.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2.5 text-xs bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold rounded-xl shadow-xs disabled:opacity-50 transition-all"
                    >
                      {submitting ? "Saving..." : editingMeeting ? "Update Meeting" : "Schedule Meeting"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* LiveKit Video Call Room Launcher Modal */}
          {activeCallMeeting && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
              <div className="bg-slate-900 text-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-800 space-y-6 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="px-2.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full text-xs font-bold">
                      LIVEKIT ROOM: {activeCallMeeting.roomName}
                    </span>
                    <h2 className="text-xl font-bold text-white mt-1">{activeCallMeeting.title}</h2>
                  </div>
                  <button
                    onClick={() => {
                      setActiveCallMeeting(null);
                      setLivekitToken(null);
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition-all"
                  >
                    Leave Call
                  </button>
                </div>

                <div className="flex-1 min-h-[350px] bg-slate-950 rounded-2xl border border-slate-800/80 p-6 flex flex-col items-center justify-center space-y-4">
                  {tokenLoading ? (
                    <p className="text-xs text-slate-400 animate-pulse font-medium">Generating LiveKit security token...</p>
                  ) : livekitToken ? (
                    <div className="text-center space-y-4 max-w-md">
                      <div className="w-20 h-20 bg-orange-600/20 text-orange-500 rounded-full flex items-center justify-center text-3xl mx-auto border border-orange-500/30 animate-pulse">
                        🎙️
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">LiveKit Audio/Video Connected</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Server Target: <span className="font-semibold text-orange-400">{livekitUrl}</span>
                        </p>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-left space-y-1">
                        <p className="text-[11px] text-slate-500 font-bold">LIVEKIT_ROOM_TOKEN</p>
                        <p className="text-xs font-semibold text-emerald-400 truncate">{livekitToken}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-rose-400">Unable to establish LiveKit session.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
