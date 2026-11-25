"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  Plus,
  Users,
  Video,
  Volume2,
  Volume1,
  Mic,
  MicOff,
  PhoneCall,
  Pencil,
  Trash2,
  CheckCircle2,
  PhoneOff,
  Search,
  X,
  Check,
  Copy,
  Play,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MeetingCalendarView } from "@/components/meetings/meeting-calendar-view";
import { getAuthToken } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api-config";
import { showConfirmDialog, showSuccessToast, showErrorToast, showWarningToast } from "@/lib/swal";

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

const STATUS_FILTER_TABS: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "All meetings" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

// Robust clipboard helper that works in both secure and insecure contexts (HTTP/LAN IP)
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand below
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return Boolean(successful);
  } catch (err) {
    console.warn("Fallback copy error:", err);
    return false;
  }
}

export default function MeetingsPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();
  const { socket } = useSocket();

  const [activeTab, setActiveTab] = useState<"meetings" | "calendar">("meetings");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [standupStatus, setStandupStatus] = useState<{
    isLive: boolean;
    callSessionId?: number;
    hostId?: number;
    hostName?: string;
    participantsCount?: number;
  }>({ isLive: false });
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
  const [editStatus, setEditStatus] = useState<"SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED">("SCHEDULED");
  const [employees, setEmployees] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<number[]>([]);
  const [attendeeSearchQuery, setAttendeeSearchQuery] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Active LiveKit Call State
  const [activeCallMeeting, setActiveCallMeeting] = useState<Meeting | null>(null);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string>(process.env.NEXT_PUBLIC_LIVEKIT_URL || "");
  const [tokenLoading, setTokenLoading] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [audioTestPlaying, setAudioTestPlaying] = useState<boolean>(false);

  const playSpeakerTestSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      setAudioTestPlaying(true);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(isSpeakerOn ? 0.35 : 0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      setTimeout(() => setAudioTestPlaying(false), 500);
    } catch (e) {
      console.warn("Audio test error:", e);
      setAudioTestPlaying(false);
    }
  };

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
      if (data.standupStatus) {
        setStandupStatus(data.standupStatus);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load meetings");
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl("/api/employees"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch {
      // Handled gracefully for users without view employee permission
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchMeetings();
      fetchEmployees();
    }
  }, [session?.token]);

  useEffect(() => {
    if (!socket) return;
    const onMeetingCreated = (newMeeting: Meeting) => {
      setMeetings((prev) => {
        if (prev.some((m) => m.id === newMeeting.id)) return prev;
        return [newMeeting, ...prev];
      });
    };
    const onMeetingUpdated = (data: {
      meetingId: number;
      status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
      meeting?: Meeting;
    }) => {
      setMeetings((prev) =>
        prev.map((m) => {
          if (m.id !== data.meetingId) return m;
          if (data.meeting) return { ...m, ...data.meeting, status: data.status };
          return { ...m, status: data.status };
        })
      );
    };
    const onMeetingDeleted = (data: { meetingId: number }) => {
      setMeetings((prev) => prev.filter((m) => m.id !== data.meetingId));
    };
    const onStandupStatus = (data: {
      isLive: boolean;
      callSessionId?: number;
      hostId?: number;
      hostName?: string;
      participantsCount?: number;
    }) => {
      setStandupStatus(data);
    };

    socket.on("meeting:created", onMeetingCreated);
    socket.on("meeting:updated", onMeetingUpdated);
    socket.on("meeting:deleted", onMeetingDeleted);
    socket.on("standup:status", onStandupStatus);

    socket.emit("standup:get-status", (res: any) => {
      if (res && typeof res === "object") {
        setStandupStatus(res);
      }
    });

    return () => {
      socket.off("meeting:created", onMeetingCreated);
      socket.off("meeting:updated", onMeetingUpdated);
      socket.off("meeting:deleted", onMeetingDeleted);
      socket.off("standup:status", onStandupStatus);
    };
  }, [socket]);

  const canManageMeeting = (m: Meeting) => {
    if (!session?.user) return false;
    const role = session.user.role;
    return (
      (m.organizer?.id != null && m.organizer.id === session.user.id) ||
      role === "ADMIN" ||
      role === "SUPER_ADMIN" ||
      role === "HR"
    );
  };

  const handleCompleteMeeting = async (meetingId: number) => {
    const isConfirmed = await showConfirmDialog({
      title: "End Meeting Call?",
      text: "Are you sure you want to end this meeting call for all participants and mark it as completed?",
      confirmButtonText: "Yes, end meeting",
      confirmButtonColor: "#e11d48",
      icon: "warning",
    });
    if (!isConfirmed) return;
    try {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/api/meetings/${meetingId}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to mark meeting as completed");
      }
      setMeetings((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, status: "COMPLETED" } : m))
      );
      showSuccessToast("Meeting completed successfully");
      fetchMeetings();
    } catch (err: any) {
      showErrorToast(err.message || "Failed to complete meeting");
    }
  };

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
      setEditStatus(meetingToEdit.status);
      setSelectedParticipantIds(
        (meetingToEdit.members || [])
          .map((m) => m.user?.id)
          .filter((id): id is number => typeof id === "number" && id !== meetingToEdit.organizer?.id)
      );
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
      setEditStatus("SCHEDULED");
      setSelectedParticipantIds([]);
    }
    setAttendeeSearchQuery("");
    setShowScheduleModal(true);
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startTime || !endTime) return;

    if (new Date(endTime) <= new Date(startTime)) {
      showWarningToast("End time must be after start time");
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
          participantIds: selectedParticipantIds,
          ...(editingMeeting ? { status: editStatus } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to save meeting");
      }

      setShowScheduleModal(false);
      showSuccessToast(editingMeeting ? "Meeting updated successfully" : "Meeting scheduled successfully");
      fetchMeetings();
    } catch (err: any) {
      showErrorToast(err.message || "Error saving meeting");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMeeting = async (meetingId: number) => {
    const isConfirmed = await showConfirmDialog({
      title: "Cancel & Delete Meeting?",
      text: "Are you sure you want to cancel and delete this meeting? This cannot be undone.",
      confirmButtonText: "Yes, delete meeting",
      confirmButtonColor: "#c03352ff",
      icon: "warning",
    });
    if (!isConfirmed) return;
    try {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/api/meetings/${meetingId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
        showSuccessToast("Meeting deleted successfully");
      } else {
        const errData = await res.json().catch(() => ({}));
        showErrorToast(errData.message || "Failed to delete meeting");
      }
    } catch (err: any) {
      console.error("Error deleting meeting:", err);
      showErrorToast(err.message || "Error deleting meeting");
    }
  };

  const handleJoinCall = async (meeting: Meeting) => {
    enterMeetingCallRoom(meeting);
  };

  const enterMeetingCallRoom = (meeting: Meeting) => {
    const isPermanent = meeting.roomName === "permanent-daily-standup" || meeting.roomName?.startsWith("permanent-");
    if (!isPermanent && meeting.status === "COMPLETED") {
      showWarningToast("This meeting has already ended and is marked as completed.");
      return;
    }
    const channelName = meeting.roomName || `meeting-${meeting.id}`;
    const targetUserIds = [
      meeting.organizer?.id,
      ...(meeting.members || []).map((m) => m.user?.id),
    ].filter((id): id is number => typeof id === "number" && id !== session?.user?.id);

    const isHost =
      meeting.organizer?.id === session?.user?.id ||
      session?.user?.role === "SUPER_ADMIN" ||
      session?.user?.role === "ADMIN";

    if (socket) {
      socket.emit(
        "call:initiate",
        {
          targetUserIds,
          type: "VIDEO",
          channelName,
          meetingId: meeting.id,
        },
        (result: { callSessionId?: number; error?: string }) => {
          const params = new URLSearchParams({
            activeChannel: channelName,
            groupCall: "true",
            groupName: meeting.title,
            type: "VIDEO",
            meetingId: String(meeting.id),
            meetingOrganizerId: String(meeting.organizer?.id || ""),
            isHost: isHost ? "true" : "false",
            ...(result?.callSessionId ? { callSessionId: String(result.callSessionId) } : {}),
          });
          router.push(`/dashboard/messenger/calls?${params.toString()}`);
        }
      );
    } else {
      const params = new URLSearchParams({
        activeChannel: channelName,
        groupCall: "true",
        groupName: meeting.title,
        type: "VIDEO",
        meetingId: String(meeting.id),
        meetingOrganizerId: String(meeting.organizer?.id || ""),
        isHost: isHost ? "true" : "false",
      });
      router.push(`/dashboard/messenger/calls?${params.toString()}`);
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
    completed: meetings.filter((m) => m.status === "COMPLETED").length,
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
                    onClick={() => setActiveTab(activeTab === "calendar" ? "meetings" : "calendar")}
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-3.5 text-xs font-bold transition w-full sm:w-auto cursor-pointer ${activeTab === "calendar" ? "bg-white text-slate-900 shadow-sm" : "bg-white/10 text-white hover:bg-white/20"
                      }`}
                  >
                    <CalendarDays size={15} />
                    {activeTab === "calendar" ? "View Meeting List" : "Calendar View"}
                  </button>
                  <button
                    onClick={() => openScheduleModal()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600 w-full sm:w-auto cursor-pointer"
                  >
                    <Plus size={15} />
                    Schedule meeting
                  </button>
                </div>
              </div>
            </header>

            {/* Segmented Tab Switcher (Matching Messenger Chats/Calls Style) */}
            <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl border border-slate-200/80 shadow-2xs w-fit">
              <button
                type="button"
                onClick={() => setActiveTab("meetings")}
                className={`flex items-center gap-2 py-2 px-3.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer select-none active:scale-[0.98] ${activeTab === "meetings"
                  ? "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                  }`}
              >
                <Video size={14} />
                <span>Video Meetings</span>
                {meetings.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === "meetings" ? "bg-white/20 text-white" : "bg-slate-300 text-slate-700"
                      }`}
                  >
                    {meetings.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("calendar")}
                className={`flex items-center gap-2 py-2 px-3.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer select-none active:scale-[0.98] ${activeTab === "calendar"
                  ? "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                  }`}
              >
                <CalendarDays size={14} />
                <span>Meeting Calendar</span>
              </button>
            </div>

            {activeTab === "calendar" ? (
              <MeetingCalendarView onSwitchToMeetings={() => setActiveTab("meetings")} />
            ) : (
              <>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Total meetings", count: meetingCounts.all, icon: CalendarDays, tone: "text-blue-700 bg-blue-50" },
                    { label: "Scheduled", count: meetingCounts.scheduled, icon: Clock3, tone: "text-orange-700 bg-orange-50" },
                    { label: "In progress", count: meetingCounts.inProgress, icon: Video, tone: "text-emerald-700 bg-emerald-50" },
                    { label: "Completed", count: meetingCounts.completed, icon: CheckCircle2, tone: "text-slate-700 bg-slate-100" },
                  ].map(({ label, count, icon: Icon, tone }) => (
                    <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-2xs">
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
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {STATUS_FILTER_TABS.map(({ key, label }) => {
                    const isSelected = filterStatus === key;
                    const count =
                      key === "ALL"
                        ? meetings.length
                        : meetings.filter((meeting) => meeting.status === key).length;

                    return (
                      <button
                        key={key}
                        onClick={() => setFilterStatus(key)}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${isSelected
                          ? "bg-[#172554] text-white shadow-xs ring-1 ring-[#172554]"
                          : "bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50 hover:text-slate-900 shadow-2xs"
                          }`}
                      >
                        <span>{label}</span>
                        <span
                          className={`inline-flex items-center justify-center min-w-[20px] h-5 rounded-full px-1.5 text-[10px] font-bold ${isSelected
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-600"
                            }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Daily Standup & Team Update Meeting Room (Dynamic Live Lifecycle) */}
                {(() => {
                  const permMeeting = meetings.find(
                    (m) => m.roomName === "permanent-daily-standup" || m.roomName?.startsWith("permanent-")
                  );
                  const canHost =
                    session?.user?.role === "ADMIN" ||
                    session?.user?.role === "SUPER_ADMIN" ||
                    session?.user?.role === "HR";
                  const isLive = Boolean(standupStatus?.isLive);

                  return (
                    <div
                      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 p-4 sm:p-5 shadow-sm ${isLive
                          ? "border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-100/60 ring-2 ring-emerald-500/20"
                          : "border-slate-200/90 bg-white"
                        }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start sm:items-center gap-3.5">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-md transition-colors ${isLive
                                ? "bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-emerald-500/20"
                                : "bg-slate-100 text-slate-500 border border-slate-200/80"
                              }`}
                          >
                            <Video size={20} className={isLive ? "animate-pulse" : ""} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {isLive ? (
                                <>
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-300 shadow-2xs">
                                    <span className="h-2 w-2 rounded-full bg-emerald-600 animate-ping"></span>
                                    LIVE NOW
                                  </span>
                                  {Boolean(standupStatus.participantsCount) && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-emerald-200 shadow-2xs">
                                      <Users size={11} className="text-emerald-700" />
                                      {standupStatus.participantsCount} in meeting
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">
                                  Not Live
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-black text-slate-900">
                              Daily Standup &amp; Team Update Meeting
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {isLive
                                ? `Active right now${standupStatus.hostName ? ` (started by ${standupStatus.hostName})` : ""}. Join the team call.`
                                : canHost
                                  ? "Standup is currently offline. As an Admin/HR, click 'Start Standup' to begin today's meeting."
                                  : "Waiting for an Admin or HR to start today's meeting. This card updates live when it begins."}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                          {isLive ? (
                            <button
                              type="button"
                              onClick={() => {
                                const params = new URLSearchParams({
                                  activeChannel: "permanent-daily-standup",
                                  groupCall: "true",
                                  groupName: "Daily Standup & Team Update Meeting",
                                  type: "VIDEO",
                                  isHost: canHost ? "true" : "false",
                                  ...(standupStatus.callSessionId
                                    ? { callSessionId: String(standupStatus.callSessionId) }
                                    : {}),
                                  ...(permMeeting ? { meetingId: String(permMeeting.id) } : {}),
                                });
                                router.push(`/dashboard/messenger/calls?${params.toString()}`);
                              }}
                              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-emerald-600/25 transition-all active:scale-95 cursor-pointer"
                            >
                              <Video size={16} />
                              <span>Join Meeting</span>
                            </button>
                          ) : canHost ? (
                            <button
                              type="button"
                                onClick = { async() => {
                                const isConfirmed = await showConfirmDialog({
                            title: "Start Daily Standup?",
                          text: "This will start the Daily Standup & Team Update Meeting for the entire team. All employees will see a live 'Join' button instantly. Continue?",
                          confirmButtonText: "Yes, Start Standup",
                          cancelButtonText: "Cancel",
                                });
                          if (!isConfirmed) return;
                          const params = new URLSearchParams({
                            activeChannel: "permanent-daily-standup",
                          groupCall: "true",
                          groupName: "Daily Standup & Team Update Meeting",
                          type: "VIDEO",
                          isHost: "true",
                          ...(permMeeting ? {meetingId: String(permMeeting.id) } : { }),
                                });
                          router.push(`/dashboard/messenger/calls?${params.toString()}`);
                              }}
                          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer"
                            >
                          <Play size={15} />
                          <span>Start Standup</span>
                        </button>
                        ) : (
                        <button
                          type="button"
                          onClick={() => {
                            showWarningToast("The Daily Standup has not started yet. It will unlock automatically as soon as an Admin or HR starts the meeting.");
                          }}
                          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-500 border border-slate-200 px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer"
                        >
                          <Clock3 size={14} className="animate-pulse text-slate-400" />
                          <span>Waiting to Start...</span>
                        </button>
                          )}
                      </div>
                    </div>
                    </div>
            );
                })()}

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
                    className="group flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-blue-200 hover:shadow-md sm:p-5 lg:flex-row lg:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="max-w-full truncate rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700">
                          {m.roomName}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border ${m.status === "SCHEDULED"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : m.status === "IN_PROGRESS"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : m.status === "COMPLETED"
                                ? "bg-slate-100 text-slate-700 border-slate-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}
                        >
                          {m.status === "IN_PROGRESS" && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                          )}
                          {m.status === "SCHEDULED"
                            ? "Scheduled"
                            : m.status === "IN_PROGRESS"
                              ? "In progress"
                              : m.status === "COMPLETED"
                                ? "Completed"
                                : "Cancelled"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-black text-slate-900">{m.title}</h3>
                        {canManageMeeting(m) ? (
                          <div className="flex items-center gap-1.5 opacity-90 hover:opacity-100">
                            <button
                              onClick={() => openScheduleModal(m)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 shadow-2xs cursor-pointer"
                              title="Edit meeting"
                              aria-label={`Edit ${m.title}`}
                            >
                              <Pencil size={13} className="text-slate-600" />
                            </button>
                            <button
                              onClick={() => handleDeleteMeeting(m.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 shadow-2xs cursor-pointer"
                              title="Cancel or delete meeting"
                              aria-label={`Cancel or delete ${m.title}`}
                            >
                              <Trash2 size={13} className="text-rose-600" />
                            </button>
                          </div>
                        ) : null}
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
                        <p>Organizer: <strong className="text-slate-700">{m.organizer?.name || "Organizer"}</strong></p>
                        {(m.members || []).length > 0 && (
                          <p className="inline-flex items-center gap-1.5">
                            <Users size={13} className="text-slate-400" />
                            <strong className="text-slate-700">{(m.members || []).length}</strong> participants
                          </p>
                        )}
                      </div>
                    </div>

                    {m.status === "COMPLETED" ? (
                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                        <div className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-4 text-xs font-bold text-slate-500 whitespace-nowrap cursor-not-allowed select-none">
                          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                          <span>Completed</span>
                        </div>
                        {/* {canManageMeeting(m) && (
                              <button
                                onClick={() => handleDeleteMeeting(m.id)}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 shadow-2xs cursor-pointer"
                                title="Delete meeting"
                                aria-label={`Delete ${m.title}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            )} */}
                      </div>
                    ) : m.status === "CANCELLED" ? (
                      <div className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-5 text-xs font-bold text-rose-600 whitespace-nowrap cursor-not-allowed select-none">
                        <span>Cancelled</span>
                      </div>
                    ) : m.status === "IN_PROGRESS" ? (
                      <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
                        <button
                          onClick={() => handleJoinCall(m)}
                          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-4.5 text-xs font-black text-white shadow-md transition hover:from-emerald-500 hover:to-teal-600 whitespace-nowrap cursor-pointer active:scale-95"
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                          </span>
                          <Video size={15} className="shrink-0" />
                          <span>Rejoin Meeting</span>
                        </button>
                        {canManageMeeting(m) && (
                          <button
                            onClick={() => handleCompleteMeeting(m.id)}
                            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 shadow-2xs whitespace-nowrap cursor-pointer"
                            title="End call for all and mark as completed"
                          >
                            <PhoneOff size={14} className="shrink-0" />
                            <span>End</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleJoinCall(m)}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#172554] px-5 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#1E3A8A] whitespace-nowrap cursor-pointer"
                      >
                        <Video size={15} className="shrink-0" />
                        <span>{canManageMeeting(m) ? "Start Meeting" : "Join meeting"}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
            )}

      </div>
      {/* Schedule / Edit Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-4 sm:p-5 shadow-2xl border border-slate-200/90 space-y-3.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">
                {editingMeeting ? "Edit Meeting" : "Schedule New Meeting"}
              </h2>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveMeeting} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Meeting Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly Product Sync"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-9 px-3 text-xs bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/15 focus:border-orange-500 transition-all font-normal text-slate-800 placeholder:text-slate-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Agenda
                </label>
                <input
                  type="text"
                  placeholder="Key topics to discuss..."
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  className="w-full h-9 px-3 text-xs bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/15 focus:border-orange-500 transition-all font-normal text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-9 px-2.5 text-xs bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/15 focus:border-orange-500 transition-all font-normal text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-9 px-2.5 text-xs bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/15 focus:border-orange-500 transition-all font-normal text-slate-800"
                    required
                  />
                </div>
              </div>

              {editingMeeting && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Meeting Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full h-9 px-3 text-xs bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/15 font-medium text-slate-700"
                  >
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
              )}

              {employees.length > 0 && (() => {
                const eligibleEmployees = employees.filter((emp) => emp.id !== session?.user?.id);
                const q = attendeeSearchQuery.toLowerCase().trim();
                const filteredEmployees = eligibleEmployees.filter((emp) => {
                  if (!q) return true;
                  return emp.name.toLowerCase().includes(q) || (emp.email && emp.email.toLowerCase().includes(q));
                });
                const allFilteredSelected = filteredEmployees.length > 0 && filteredEmployees.every((emp) => selectedParticipantIds.includes(emp.id));

                return (
                  <div className="space-y-1.5 pt-0.5">
                    {/* Header bar with counter & refined quick action links */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <label className="text-xs font-semibold text-slate-700 leading-none">
                          Invite Attendees
                        </label>
                        <span className="inline-flex items-center justify-center h-4 min-w-[18px] px-1 rounded-full text-[10px] font-semibold leading-none bg-slate-100 text-slate-600 border border-slate-200/80 shrink-0">
                          {selectedParticipantIds.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            const targetIds = filteredEmployees.map((e) => e.id);
                            setSelectedParticipantIds((prev) => Array.from(new Set([...prev, ...targetIds])));
                          }}
                          className="px-1.5 py-0.5 font-medium text-slate-600 hover:text-orange-600 hover:bg-orange-50/80 rounded transition-colors cursor-pointer"
                          title="Select all displayed attendees"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (q) {
                              const targetIds = new Set(filteredEmployees.map((e) => e.id));
                              setSelectedParticipantIds((prev) => prev.filter((id) => !targetIds.has(id)));
                            } else {
                              setSelectedParticipantIds([]);
                            }
                          }}
                          className="px-1.5 py-0.5 font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          title="Clear all selected attendees"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    {/* Search Bar supporting real-time typing */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                      <input
                        type="text"
                        value={attendeeSearchQuery}
                        onChange={(e) => setAttendeeSearchQuery(e.target.value)}
                        placeholder="Type name or email to search..."
                        style={{ paddingLeft: "38px", paddingRight: "32px" }}
                        className="w-full h-9 !pl-10 !pr-8 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium transition-all"
                      />
                      {attendeeSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setAttendeeSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Member Selection List */}
                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50 p-1 [scrollbar-width:thin]">
                      {filteredEmployees.length === 0 ? (
                        <div className="py-5 text-center">
                          <p className="text-xs text-slate-500 font-medium">
                            No attendees match &quot;{attendeeSearchQuery}&quot;
                          </p>
                          <button
                            type="button"
                            onClick={() => setAttendeeSearchQuery("")}
                            className="mt-1 text-[11px] text-orange-600 font-bold hover:underline cursor-pointer"
                          >
                            Clear search
                          </button>
                        </div>
                      ) : (
                        filteredEmployees.map((emp) => {
                          const isSelected = selectedParticipantIds.includes(emp.id);
                          const initial = emp.name.trim().charAt(0).toUpperCase();

                          return (
                            <div
                              key={emp.id}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedParticipantIds((prev) => prev.filter((id) => id !== emp.id));
                                } else {
                                  setSelectedParticipantIds((prev) => [...prev, emp.id]);
                                }
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all select-none ${isSelected
                                ? "bg-orange-50/90 border border-orange-200/90 text-orange-950 shadow-2xs"
                                : "hover:bg-slate-100/80 border border-transparent text-slate-700"
                                }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${isSelected
                                    ? "bg-orange-500 text-white"
                                    : "bg-slate-200 text-slate-600"
                                    }`}
                                >
                                  {initial}
                                </div>
                                <div className="truncate">
                                  <p className="text-xs font-bold truncate leading-tight">{emp.name}</p>
                                  <p className="text-[10px] text-slate-400 font-normal truncate">{emp.email}</p>
                                </div>
                              </div>
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${isSelected
                                  ? "bg-orange-500 border-orange-500 text-white"
                                  : "border-slate-300 bg-white"
                                  }`}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-3.5 py-2 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold rounded-xl shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                >
                  {submitting ? "Saving..." : editingMeeting ? "Update Meeting" : "Schedule Meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )
      }

      {/* LiveKit Video Call Room Launcher Modal */}
      {
        activeCallMeeting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <div className="bg-slate-900 text-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-800 space-y-6 flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white">{activeCallMeeting.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setActiveCallMeeting(null);
                      setLivekitToken(null);
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Leave Call
                  </button>
                  {activeCallMeeting && canManageMeeting(activeCallMeeting) && (
                    <button
                      onClick={async () => {
                        const isConfirmed = await showConfirmDialog({
                          title: "End Meeting for All?",
                          text: "Are you sure you want to end this meeting call for all participants?",
                          confirmButtonText: "Yes, end meeting",
                          confirmButtonColor: "#e11d48",
                          icon: "warning",
                        });
                        if (!isConfirmed) return;
                        await handleCompleteMeeting(activeCallMeeting.id);
                        setActiveCallMeeting(null);
                        setLivekitToken(null);
                      }}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <PhoneOff size={14} />
                      <span>End Call (Host)</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-[260px] bg-slate-950 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center space-y-5 py-10">
                {tokenLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                    <p className="text-xs text-slate-400 font-medium">Preparing your session…</p>
                  </div>
                ) : livekitToken ? (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl">
                      🎙️
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{activeCallMeeting.title}</p>
                      <p className="text-xs text-slate-400 mt-1">Your audio is ready. Click below to join.</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-rose-400">Unable to establish session. Please try again.</p>
                )}
              </div>

              {/* Meeting Controls Toolbar with Speaker Button */}
              <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Speaker Button (Hands-free / Loudspeaker) */}
                  <button
                    onClick={() => setIsSpeakerOn((prev) => !prev)}
                    className={`h-10 px-3.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer text-xs ${isSpeakerOn
                      ? "bg-orange-500/20 border-2 border-orange-500 text-orange-400 hover:bg-orange-500/30"
                      : "bg-slate-800 border-2 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                    title={isSpeakerOn ? "Speaker ON (Loudspeaker hands-free mode). Click for normal." : "Speaker Normal (Earpiece / Headset). Click for loudspeaker."}
                  >
                    {isSpeakerOn ? <Volume2 className="w-4 h-4 text-orange-400" /> : <Volume1 className="w-4 h-4 text-slate-400" />}
                    <span>{isSpeakerOn ? "Speaker: ON" : "Speaker: Normal"}</span>
                  </button>

                  {/* Test Speaker Chime Button */}
                  <button
                    onClick={playSpeakerTestSound}
                    disabled={audioTestPlaying}
                    className="h-10 px-3 rounded-xl font-bold flex items-center gap-1.5 transition-all bg-slate-800 border-2 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600 text-xs cursor-pointer"
                    title="Play audio test tone to verify speaker output without headphones"
                  >
                    <Volume2 className={`w-3.5 h-3.5 text-emerald-400 ${audioTestPlaying ? "animate-bounce" : ""}`} />
                    <span>{audioTestPlaying ? "Playing Chime..." : "🔊 Test Speaker"}</span>
                  </button>

                  {/* Mic Toggle */}
                  <button
                    onClick={() => setIsMicMuted((prev) => !prev)}
                    className={`h-10 px-3 rounded-xl font-bold flex items-center gap-1.5 transition-all text-xs cursor-pointer ${isMicMuted
                      ? "bg-rose-500/20 border-2 border-rose-500 text-rose-400"
                      : "bg-slate-800 border-2 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                  >
                    {isMicMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{isMicMuted ? "Muted" : "Mic ON"}</span>
                  </button>
                </div>

                {/* Open Interactive WebRTC Group Call Room */}
                <button
                  onClick={() => enterMeetingCallRoom(activeCallMeeting)}
                  className="h-11 px-5 rounded-xl font-black flex items-center gap-2 transition-all bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white hover:opacity-95 shadow-lg text-xs cursor-pointer w-full sm:w-auto justify-center active:scale-95"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>Enter Meeting Room Now (Talk & Listen)</span>
                </button>
              </div>
            </div>
          </div>
        )
      }
    </section >
      </div >
    </main >
  );
}
