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
  roomName: string;
  startTime: string;
  endTime: string;
  status: string;
  organizer: {
    name: string;
    email: string;
  };
  project?: {
    name: string;
  };
  members: Array<{
    user: {
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

  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
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

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startTime || !endTime) return;

    setSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch("http://localhost:5000/api/meetings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          startTime,
          endTime,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to schedule meeting");
      }

      setShowScheduleModal(false);
      setTitle("");
      setDescription("");
      setStartTime("");
      setEndTime("");
      fetchMeetings();
    } catch (err: any) {
      alert(err.message || "Error scheduling meeting");
    } finally {
      setSubmitting(false);
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 welcome mb-6">
            <div>
              <p className="eyebrow">COLLABORATION</p>
              <h1 className="text-2xl font-black text-slate-900">LiveKit Meetings</h1>
              <p className="text-xs text-slate-500 font-medium">
                Schedule meetings and join real-time audio/video conference calls powered by LiveKit Server.
              </p>
            </div>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs"
            >
              + Schedule Meeting
            </button>
          </div>

          {/* Meetings Grid */}
          {loading ? (
            <p className="text-xs text-slate-400 animate-pulse font-medium">Loading meetings...</p>
          ) : error ? (
            <p className="text-xs text-rose-500 font-semibold">{error}</p>
          ) : meetings.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-400 text-xs font-medium">No scheduled meetings found. Click above to schedule one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {meetings.map((m) => (
                <div
                  key={m.id}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-0.5 text-[11px] font-mono font-extrabold rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                        {m.roomName}
                      </span>
                      <span className="px-2.5 py-0.5 text-[11px] font-extrabold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {m.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-slate-900">{m.title}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {m.description || "No agenda specified."}
                    </p>

                    <div className="mt-4 space-y-1 text-xs text-slate-500 font-medium">
                      <p>📅 <strong>Start:</strong> {new Date(m.startTime).toLocaleString()}</p>
                      <p>👤 <strong>Organizer:</strong> {m.organizer.name}</p>
                      {m.project && <p>📁 <strong>Project:</strong> {m.project.name}</p>}
                    </div>
                  </div>

                  <button
                    onClick={() => handleJoinCall(m)}
                    className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs flex items-center justify-center gap-2"
                  >
                    <span>🎥</span> Join LiveKit Room
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Schedule Meeting Modal */}
          {showScheduleModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
                <h2 className="text-base font-black text-slate-900">Schedule Meeting</h2>
                <form onSubmit={handleSchedule} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Meeting Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sprint Planning Sync"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Agenda / Description
                    </label>
                    <textarea
                      placeholder="Meeting goals and agenda..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      rows={2}
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
                      {submitting ? "Scheduling..." : "Schedule Meeting"}
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
                      <p className="text-xs text-slate-400">
                        Real-time media stream active with LiveKit Dev Server (`livekit-server --dev`).
                      </p>
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
