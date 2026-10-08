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
  const [livekitUrl, setLivekitUrl] = useState<string>("ws://localhost:7880");
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
      const res = await fetch("http://localhost:5000/api/meetings", {
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
    if (meetingToEdit) {
      setEditingMeeting(meetingToEdit);
      setTitle(meetingToEdit.title);
      setDescription(meetingToEdit.description || "");
      setAgenda(meetingToEdit.agenda || "");
      setStartTime(new Date(meetingToEdit.startTime).toISOString().slice(0, 16));
      setEndTime(new Date(meetingToEdit.endTime).toISOString().slice(0, 16));
      setTimezone(meetingToEdit.timezone || "UTC");
      setNotes(meetingToEdit.notes || "");
    } else {
      setEditingMeeting(null);
      setTitle("");
      setDescription("");
      setAgenda("");
      setStartTime("");
      setEndTime("");
      setTimezone("UTC");
      setNotes("");
    }
    setShowScheduleModal(true);
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startTime || !endTime) return;

    setSubmitting(true);
    try {
      const token = getAuthToken();
      const url = editingMeeting
        ? `http://localhost:5000/api/meetings/${editingMeeting.id}`
        : "http://localhost:5000/api/meetings";
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
        const errData = await res.json();
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
      const res = await fetch(`http://localhost:5000/api/meetings/${meetingId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
      }
    } catch (err) {
      console.error("Error deleting meeting:", err);
    }
  };

  const handleJoinCall = async (meeting: Meeting) => {
    setActiveCallMeeting(meeting);
    setTokenLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`http://localhost:5000/api/meetings/${meeting.id}/token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to get LiveKit room token");
      const data = await res.json();
      setLivekitToken(data.token);
      setLivekitUrl(data.url || "ws://localhost:7880");
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

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 welcome mb-6">
            <div>
              <p className="eyebrow">COLLABORATION</p>
              <h1 className="text-2xl font-black text-slate-900">Meetings & Sync Sessions</h1>
              <p className="text-xs text-slate-500 font-medium">
                Manage team agendas, timezones, sync notes, and join real-time LiveKit audio/video rooms.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/dashboard/meetings/calendar")}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-all"
              >
                📆 Calendar View
              </button>
              <button
                onClick={() => openScheduleModal()}
                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs"
              >
                + Schedule Meeting
              </button>
            </div>
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-2 mb-6 overflow-x-auto">
            {["ALL", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((statusKey) => (
              <button
                key={statusKey}
                onClick={() => setFilterStatus(statusKey)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  filterStatus === statusKey
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {statusKey === "ALL" ? "All Meetings" : statusKey.replace("_", " ")}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMeetings.map((m) => (
                <div
                  key={m.id}
                  className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-0.5 text-[10px] font-mono font-extrabold rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                        {m.roomName}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 text-[10px] font-black rounded-full uppercase ${
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

                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-black text-slate-900">{m.title}</h3>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button
                          onClick={() => openScheduleModal(m)}
                          className="p-1 hover:bg-slate-100 rounded text-xs"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteMeeting(m.id)}
                          className="p-1 hover:bg-rose-50 text-rose-600 rounded text-xs"
                          title="Cancel/Delete"
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

                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                      {m.description || "No detailed description."}
                    </p>

                    <div className="mt-4 space-y-1 text-xs text-slate-500 font-medium">
                      <p>📅 <strong>Start:</strong> {new Date(m.startTime).toLocaleString()} ({m.timezone || "UTC"})</p>
                      <p>👤 <strong>Organizer:</strong> {m.organizer.name}</p>
                      {m.members.length > 0 && (
                        <p>👥 <strong>Members:</strong> {m.members.map((mb) => mb.user.name).join(", ")}</p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleJoinCall(m)}
                    className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs flex items-center justify-center gap-2"
                  >
                    <span>🎥</span> Join LiveKit Room
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Schedule / Edit Modal */}
          {showScheduleModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
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
                      className="px-4 py-2.5 text-xs bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl shadow-xs disabled:opacity-50"
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
                    <span className="px-2.5 py-0.5 bg-orange-500/20 text-orange-400 rounded-full text-xs font-mono font-bold">
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
                          Server Target: <span className="font-mono text-orange-400">{livekitUrl}</span>
                        </p>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-left space-y-1">
                        <p className="text-[11px] text-slate-500 font-mono">LIVEKIT_ROOM_TOKEN</p>
                        <p className="text-xs font-mono text-emerald-400 truncate">{livekitToken}</p>
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
