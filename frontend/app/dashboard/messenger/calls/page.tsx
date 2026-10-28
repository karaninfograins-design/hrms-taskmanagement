"use client";

import { Suspense } from "react";
import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Users,
  Trash2,
  Clock,
  UserPlus,
  Headphones,
  AlertCircle,
  RefreshCw,
  Search,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";
import { getApiUrl } from "@/lib/api-config";
import {
  showConfirmDialog,
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showNotification,
} from "@/lib/swal";

type CallSession = {
  id: number;
  channelName: string;
  type: "AUDIO" | "VIDEO";
  status: "RINGING" | "ACTIVE" | "ENDED" | "MISSED" | "REJECTED";
  host: { id: number; name: string; email: string };
  participants: Array<{ user: { id: number; name: string } }>;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

type Employee = {
  id: number;
  name: string;
  email: string;
};

type ActiveCall = {
  callSessionId?: number;
  channelName: string;
  targetName: string;
  type: "AUDIO" | "VIDEO";
  peerUserId?: number;
  isGroupCall?: boolean;
  isHost?: boolean;
};

type RemoteParticipant = {
  userId: number;
  stream: MediaStream;
};

function getMediaUnavailableError(): Error {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return new Error(
      "Calls require a secure page. Open this site over HTTPS (localhost is allowed for local development), then try again."
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return new Error(
      "This browser does not provide microphone or camera access. Use a current browser over HTTPS and try again."
    );
  }
  return new Error("Microphone or camera access is unavailable.");
}

function createSilentAudioTrack(): MediaStreamTrack {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0; // complete silence
      oscillator.connect(gainNode);
      const dst = ctx.createMediaStreamDestination();
      gainNode.connect(dst);
      oscillator.start();
      const track = dst.stream.getAudioTracks()[0];
      if (track) {
        track.enabled = false;
        return track;
      }
    }
  } catch (e) {
    console.warn("Unable to create silent Web Audio track:", e);
  }

  // Fallback: dummy track via canvas or empty stream
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const dummyStream = (canvas as unknown as { captureStream?: (fps: number) => MediaStream }).captureStream
    ? (canvas as unknown as { captureStream: (fps: number) => MediaStream }).captureStream(1)
    : new MediaStream();
  return dummyStream.getTracks()[0] as unknown as MediaStreamTrack;
}

async function requestLocalMedia(
  type: "AUDIO" | "VIDEO",
  onNoMicDetected?: (msg: string) => void
): Promise<{ stream: MediaStream; hasAudio: boolean }> {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    throw getMediaUnavailableError();
  }

  const audioOptions = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  let audioTrack: MediaStreamTrack | null = null;
  let videoTrack: MediaStreamTrack | null = null;
  let hasRealMic = false;

  // 1. Try to obtain microphone input
  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: audioOptions,
    });
    audioTrack = audioStream.getAudioTracks()[0] || null;
    hasRealMic = true;
  } catch {
    // Try simple audio constraints without advanced flags
    try {
      const simpleAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      audioTrack = simpleAudioStream.getAudioTracks()[0] || null;
      hasRealMic = true;
    } catch (err) {
      const error = err as Error;
      console.warn("[Media] Microphone capture failed:", error);

      // Check if permission denied vs no device connected
      const isMissingDevice =
        error?.name === "NotFoundError" ||
        error?.name === "DevicesNotFoundError" ||
        (error?.message && error.message.toLowerCase().includes("not found"));

      const isPermissionDenied =
        error?.name === "NotAllowedError" ||
        error?.name === "PermissionDeniedError";

      const promptMsg = isMissingDevice
        ? "No microphone or headphones detected. Please connect a headset or microphone if you wish to speak. You are currently in Listen-Only mode."
        : isPermissionDenied
          ? "Microphone access is blocked in browser settings. You have joined in Listen-Only mode. Please allow microphone permissions to speak."
          : "Microphone is unavailable or in use by another application. You have joined in Listen-Only mode.";

      if (onNoMicDetected) {
        onNoMicDetected(promptMsg);
      }

      // Generate silent audio track so WebRTC negotiation succeeds without throwing an unhandled error!
      audioTrack = createSilentAudioTrack();
      hasRealMic = false;
    }
  }

  // 2. Try to obtain video if this is a VIDEO call
  if (type === "VIDEO") {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      videoTrack = videoStream.getVideoTracks()[0] || null;
    } catch (videoErr) {
      console.warn("[Media] Video camera capture failed:", videoErr);
    }
  }

  const tracks: MediaStreamTrack[] = [];
  if (audioTrack) tracks.push(audioTrack);
  if (videoTrack) tracks.push(videoTrack);

  if (tracks.length === 0) {
    const fallbackTrack = createSilentAudioTrack();
    if (fallbackTrack) tracks.push(fallbackTrack);
  }

  return {
    stream: new MediaStream(tracks),
    hasAudio: hasRealMic,
  };
}


function RemoteParticipantMedia({
  participant,
  name,
  type,
}: {
  participant: RemoteParticipant;
  name: string;
  type: "AUDIO" | "VIDEO";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = participant.stream;
      videoRef.current.play().catch(console.warn);
    }
    if (audioRef.current) {
      audioRef.current.srcObject = participant.stream;
      audioRef.current.muted = false;
      audioRef.current.volume = 1.0;
      audioRef.current.play().catch(console.warn);
    }
  }, [participant.stream]);

  if (type === "AUDIO") {
    return (
      <div
        className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 p-4 cursor-pointer select-none transition-all hover:border-orange-500/40"
        onClick={() => {
          if (audioRef.current && audioRef.current.paused) {
            audioRef.current.play().catch(console.warn);
          }
        }}
        title="Voice connected - Click if you need to resume audio playback"
      >
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          style={{
            position: "fixed",
            left: "-9999px",
            top: "-9999px",
            width: "1px",
            height: "1px",
            opacity: 0.01,
            pointerEvents: "none",
          }}
        />
        <div className="relative mb-3 flex items-center justify-center">
          <div className="absolute w-20 h-20 rounded-full border border-orange-500/20 animate-ping" style={{ animationDuration: "2s" }} />
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-orange-400 border border-orange-500/30">
            <Mic className="w-8 h-8" />
          </div>
        </div>
        <p className="text-sm font-bold text-white">{name}</p>
        <div className="mt-2 flex items-center gap-1">
          <span className="w-1 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          <span className="w-1 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "450ms" }} />
        </div>
        <span className="mt-1 text-[10px] text-slate-400">Audio connected</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-40 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        style={{
          position: "fixed",
          left: "-9999px",
          top: "-9999px",
          width: "1px",
          height: "1px",
          opacity: 0.01,
          pointerEvents: "none",
        }}
      />
      <video ref={videoRef} autoPlay playsInline className="h-full min-h-40 w-full object-cover" />
      <span className="absolute bottom-2 left-2 rounded bg-slate-950/70 px-2 py-1 text-xs font-semibold text-white">
        {name}
      </span>
    </div>
  );
}

function CallsLoadingFallback() {
  const { session, logout } = useAuth();
  const router = useRouter();
  const handleSignOut = () => {
    logout();
    router.replace("/");
  };
  return (
    <main className="app-shell">
      <Navbar user={session?.user as any} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session?.user} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          <div className="welcome mb-6">
            <h2 className="text-2xl font-black text-slate-800">Audio & Video Calls</h2>
            <p className="text-xs text-slate-500 font-medium">Calling history</p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={<CallsLoadingFallback />}>
      <CallsContent />
    </Suspense>
  );
}

function CallsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isLoading, logout } = useAuth();
  const { socket } = useSocket();

  // Clears all call-related URL params so refresh doesn't re-trigger the call overlay
  const clearCallUrlParams = () => {
    router.replace("/dashboard/messenger/calls", { scroll: false });
  };

  const [calls, setCalls] = useState<CallSession[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [targetEmpId, setTargetEmpId] = useState<string>("");
  const [callType, setCallType] = useState<"AUDIO" | "VIDEO">("VIDEO");

  // Call Logs Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const totalCalls = calls.length;
  const totalPages = Math.max(1, Math.ceil(totalCalls / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedCalls = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return calls.slice(startIndex, startIndex + pageSize);
  }, [calls, safePage, pageSize]);

  // WebRTC & Call Overlay State
  const [incomingCall, setIncomingCall] = useState<{
    callSessionId: number;
    channelName: string;
    caller: { id: number; name: string; email: string };
    type: "AUDIO" | "VIDEO";
    conversationName?: string | null;
    isGroupCall?: boolean;
  } | null>(null);

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null); // Stored in state so useEffect can react when DOM is ready

  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isCamOff, setIsCamOff] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [hasNoMic, setHasNoMic] = useState<boolean>(false);
  const [micPromptMessage, setMicPromptMessage] = useState<string | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState<boolean>(false);
  const [addMemberSearch, setAddMemberSearch] = useState<string>("");
  const [invitingEmployeeId, setInvitingEmployeeId] = useState<number | null>(null);
  const [invitedEmployeeIds, setInvitedEmployeeIds] = useState<Set<number>>(new Set());

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null); // Always in DOM, plays remote audio for any call type
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const groupPeerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const pendingGroupPeerConnectionsRef = useRef<Map<number, Promise<RTCPeerConnection>>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localMediaPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const startedChannelRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // P2P race-condition buffers: offer and ICE candidates can arrive before the PC is created
  const pendingP2POfferRef = useRef<{ fromUserId: number; offer: RTCSessionDescriptionInit } | null>(null);
  const pendingP2PIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const setCurrentActiveCall = (call: ActiveCall | null) => {
    activeCallRef.current = call;
    setActiveCall(call);
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

  // Fetch Call History
  const fetchCalls = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/calls`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        showErrorToast("Failed to load call logs");
        return;
      }
      const data = await res.json();
      setCalls(data.calls || []);
    } catch (err) {
      console.error("Error fetching calls:", err);
      showErrorToast("Network error loading call logs");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCall = async (callId: number) => {
    const isConfirmed = await showConfirmDialog({
      title: "Delete Call Log?",
      text: "Are you sure you want to delete this call log? This action cannot be undone.",
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/calls/${callId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        showErrorToast("Failed to delete call log");
        return;
      }
      setCalls((prev) => prev.filter((c) => c.id !== callId));
      showSuccessToast("Call log deleted successfully");
    } catch (err) {
      console.error("Error deleting call log:", err);
      showErrorToast("Error deleting call log");
    }
  };

  const handleClearAllCalls = async () => {
    const isConfirmed = await showConfirmDialog({
      title: "Clear All Call Logs?",
      text: "Are you sure you want to clear your entire call history? All logs will be permanently deleted.",
      confirmButtonText: "Yes, clear all",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/calls`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        showErrorToast("Failed to clear call logs");
        return;
      }
      setCalls([]);
      setCurrentPage(1);
      showSuccessToast("All call logs have been cleared");
    } catch (err) {
      console.error("Error clearing call logs:", err);
      showErrorToast("Error clearing call logs");
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchCalls();
    }
  }, [session?.token]);

  useEffect(() => {
    if (searchParams.get("incomingCall") !== "true") return;
    const callSessionId = Number(searchParams.get("callSessionId"));
    const callerId = Number(searchParams.get("callerId"));
    const channelName = searchParams.get("activeChannel");
    const callerName = searchParams.get("callerName");
    if (!callSessionId || !callerId || !channelName || !callerName) return;

    setIncomingCall({
      callSessionId,
      channelName,
      caller: {
        id: callerId,
        name: callerName,
        email: searchParams.get("callerEmail") || "",
      },
      type: (searchParams.get("type") as "AUDIO" | "VIDEO") || "VIDEO",
      conversationName: searchParams.get("groupName"),
      isGroupCall: searchParams.get("groupCall") === "true",
    });
  }, [searchParams]);

  useEffect(() => {
    if (activeCall?.type === "VIDEO" && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [activeCall]);

  // ✅ KEY FIX: Assign remote stream to media elements reactively once DOM is ready
  // This runs whenever remoteStream changes or the activeCall mounts the video/audio elements
  useEffect(() => {
    if (!remoteStream) return;

    // Always play audio through the dedicated hidden <audio> element
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch((err) => {
        console.warn("Remote audio autoplay blocked, waiting for user gesture:", err);
      });
    }

    // Also wire video element for VIDEO calls
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, activeCall]); // re-run when activeCall changes (DOM elements mount/unmount)

  // Fetch employees
  useEffect(() => {
    if (!session?.token) return;
    fetch(`${getApiUrl()}/api/employees`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch employees");
        return res.json();
      })
      .then((data) => setEmployees(data.employees || []))
      .catch((err) => {
        console.error("Error fetching employees:", err);
        showErrorToast("Could not load employees list");
      });
  }, [session?.token]);

  // Handle URL query parameters if navigated directly from chats page
  useEffect(() => {
    const channel = searchParams.get("activeChannel");
    const targetId = searchParams.get("target");
    const type = (searchParams.get("type") as "AUDIO" | "VIDEO") || "VIDEO";
    const isGroupCall = searchParams.get("groupCall") === "true";
    const isIncomingCall = searchParams.get("incomingCall") === "true";
    const callSessionId = Number(searchParams.get("callSessionId")) || undefined;
    const groupName = searchParams.get("groupName");
    const targetNameParam = searchParams.get("targetName");

    if (!socket || isIncomingCall || !channel || !session?.user || startedChannelRef.current === channel) return;
    startedChannelRef.current = channel;

    if (isGroupCall && callSessionId) {
      setCurrentActiveCall({
        callSessionId,
        channelName: channel,
        targetName: groupName || "Group",
        type,
        isGroupCall: true,
        isHost: true,
      });
      // Broadcast host joining to group participants
      socket?.emit("call:join", { callSessionId });
      void prepareGroupCallMedia(type).catch((error) => {
        console.error("Unable to access group call media:", error);
        showNotification({
          title: "Media Access Notice",
          text: error instanceof Error ? error.message : "Could not access your microphone or camera.",
          icon: "warning",
        });
        endWebRTCCall();
      });
    } else if (targetId) {
      const targetEmp = employees.find((e) => e.id === Number(targetId));
      setCurrentActiveCall({
        callSessionId,
        channelName: channel,
        targetName: targetEmp?.name || targetNameParam || `Employee #${targetId}`,
        type,
        peerUserId: Number(targetId),
      });
      void initiateWebRTC(Number(targetId), true, type).catch((error: unknown) => {
        console.error("Error setting up WebRTC media:", error);
        if (callSessionId) socket?.emit("call:end", { callSessionId });
        cleanupCall();
        showNotification({
          title: "Media Setup Notice",
          text: error instanceof Error ? error.message : "Unable to set up call media.",
          icon: "warning",
        });
      });
    }
  }, [searchParams, employees, session?.user, socket]);

  // Socket Event Listeners for Call Ringing & WebRTC Signaling
  useEffect(() => {
    if (!socket) return;

    const onIncomingCall = (data: {
      callSessionId: number;
      channelName: string;
      caller: { id: number; name: string; email: string };
      type: "AUDIO" | "VIDEO";
      conversationName?: string | null;
      isGroupCall?: boolean;
    }) => {
      setIncomingCall(data);
    };

    const onCallAccepted = (data: { callSessionId: number; userId: number }) => {
      startTimer();
    };

    const onCallRejected = () => {
      if (activeCallRef.current?.isGroupCall) return;
      showNotification({
        title: "Call Declined",
        text: "The recipient declined the call or is currently unavailable.",
        icon: "info",
      });
      endWebRTCCall();
    };

    const onCallEnded = (data: { callSessionId: number }) => {
      if (activeCallRef.current?.callSessionId !== data.callSessionId) return;
      cleanupCall();
    };

    const onParticipantJoined = async ({
      callSessionId,
      participantIds,
    }: {
      callSessionId: number;
      participantIds: number[];
    }) => {
      const call = activeCallRef.current;
      if (
        !call ||
        call.callSessionId !== callSessionId ||
        typeof session?.user.id !== "number"
      ) return;

      // If active call was 1-on-1 and now has >2 participants, upgrade to group call view
      if (!call.isGroupCall && participantIds.length > 2) {
        if (call.peerUserId && remoteStream) {
          setRemoteParticipants((prev) => {
            if (prev.some((p) => p.userId === call.peerUserId)) return prev;
            return [...prev, { userId: call.peerUserId!, stream: remoteStream }];
          });
        }
        setCurrentActiveCall({
          ...call,
          isGroupCall: true,
          targetName: call.targetName.includes("Group")
            ? call.targetName
            : `${call.targetName} & others`,
        });
      }

      startTimer();
      for (const participantId of participantIds) {
        if (
          participantId !== session.user.id &&
          session.user.id < participantId &&
          !groupPeerConnectionsRef.current.has(participantId)
        ) {
          if (peerConnectionRef.current && participantId === call.peerUserId) {
            continue;
          }
          await createGroupPeerConnection(participantId, true);
        }
      }
    };

    const onParticipantInvited = (data: {
      callSessionId: number;
      invitedUserId: number;
      invitedUser?: { id: number; name: string };
      invitedBy?: { id: number; name: string };
    }) => {
      const call = activeCallRef.current;
      if (call?.callSessionId !== data.callSessionId) return;
      setInvitedEmployeeIds((prev) => new Set(prev).add(data.invitedUserId));

      if (call && !call.isGroupCall) {
        if (call.peerUserId && remoteStream) {
          setRemoteParticipants((prev) => {
            if (prev.some((p) => p.userId === call.peerUserId)) return prev;
            return [...prev, { userId: call.peerUserId!, stream: remoteStream }];
          });
        }
        setCurrentActiveCall({
          ...call,
          isGroupCall: true,
          targetName: call.targetName.includes("Group")
            ? call.targetName
            : `${call.targetName} & others`,
        });
      }
    };

    const onParticipantLeft = ({
      callSessionId,
      userId,
    }: {
      callSessionId: number;
      userId: number;
    }) => {
      if (activeCallRef.current?.callSessionId !== callSessionId) return;
      groupPeerConnectionsRef.current.get(userId)?.close();
      groupPeerConnectionsRef.current.delete(userId);
      pendingIceCandidatesRef.current.delete(userId);
      setRemoteParticipants((prev) => prev.filter((participant) => participant.userId !== userId));
    };

    const onWebRTCOffer = async ({
      fromUserId,
      offer,
      callSessionId,
    }: {
      fromUserId: number;
      offer: RTCSessionDescriptionInit;
      callSessionId?: number;
    }) => {
      const call = activeCallRef.current;
      if (call?.isGroupCall || (callSessionId && call && call.callSessionId === callSessionId)) {
        if (call && !call.isGroupCall) {
          if (call.peerUserId && remoteStream) {
            setRemoteParticipants((prev) => {
              if (prev.some((p) => p.userId === call.peerUserId)) return prev;
              return [...prev, { userId: call.peerUserId!, stream: remoteStream }];
            });
          }
          setCurrentActiveCall({
            ...call,
            isGroupCall: true,
            targetName: call.targetName.includes("Group")
              ? call.targetName
              : `${call.targetName} & others`,
          });
        }
        const pc = await createGroupPeerConnection(fromUserId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushPendingIceCandidates(fromUserId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { targetUserId: fromUserId, answer, callSessionId });
        return;
      }
      // P2P path: if PC isn't created yet (callee hasn't accepted), buffer the offer
      if (!peerConnectionRef.current) {
        console.log("[WebRTC] Offer arrived before PC was ready — buffering for later");
        pendingP2POfferRef.current = { fromUserId, offer };
        return;
      }
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      // Flush any buffered ICE candidates that arrived before this offer
      for (const c of pendingP2PIceCandidatesRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingP2PIceCandidatesRef.current = [];
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit("webrtc:answer", { targetUserId: fromUserId, answer });
    };

    const onWebRTCAnswer = async ({
      fromUserId,
      answer,
      callSessionId,
    }: {
      fromUserId: number;
      answer: RTCSessionDescriptionInit;
      callSessionId?: number;
    }) => {
      if (groupPeerConnectionsRef.current.has(fromUserId)) {
        const pc = groupPeerConnectionsRef.current.get(fromUserId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingIceCandidates(fromUserId, pc);
        return;
      }
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        // Flush all buffered ICE candidates that arrived before the answer
        for (const c of pendingP2PIceCandidatesRef.current) {
          if (c && c.candidate) {
            try {
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c));
            } catch (err) {
              console.warn("[WebRTC] Error adding buffered ICE candidate:", err);
            }
          }
        }
        pendingP2PIceCandidatesRef.current = [];
      }
    };

    const onWebRTCIceCandidate = async ({
      fromUserId,
      candidate,
      callSessionId,
    }: {
      fromUserId: number;
      candidate: RTCIceCandidateInit;
      callSessionId?: number;
    }) => {
      if (groupPeerConnectionsRef.current.has(fromUserId)) {
        const pc = groupPeerConnectionsRef.current.get(fromUserId);
        if (!pc || !pc.remoteDescription) {
          const pending = pendingIceCandidatesRef.current.get(fromUserId) || [];
          pending.push(candidate);
          pendingIceCandidatesRef.current.set(fromUserId, pending);
          return;
        }
        if (candidate && candidate.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn("[WebRTC Group] Error adding ICE candidate:", err);
          }
        }
        return;
      }
      // P2P path: buffer ICE candidates if PC isn't ready or remote description not set yet
      if (!peerConnectionRef.current || !peerConnectionRef.current.remoteDescription) {
        console.log("[WebRTC] ICE candidate arrived before PC/remote-desc ready — buffering");
        pendingP2PIceCandidatesRef.current.push(candidate);
        return;
      }
      if (candidate && candidate.candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn("[WebRTC] Error adding ICE candidate:", err);
        }
      }
    };

    socket.on("incoming:call", onIncomingCall);
    socket.on("call:accepted", onCallAccepted);
    socket.on("call:rejected", onCallRejected);
    socket.on("call:ended", onCallEnded);
    socket.on("call:participant-joined", onParticipantJoined);
    socket.on("call:participant-invited", onParticipantInvited);
    socket.on("call:participant-left", onParticipantLeft);
    socket.on("webrtc:offer", onWebRTCOffer);
    socket.on("webrtc:answer", onWebRTCAnswer);
    socket.on("webrtc:ice-candidate", onWebRTCIceCandidate);

    if (activeCallRef.current?.isGroupCall && activeCallRef.current.callSessionId) {
      socket.emit("call:join", { callSessionId: activeCallRef.current.callSessionId });
    }

    return () => {
      socket.off("incoming:call", onIncomingCall);
      socket.off("call:accepted", onCallAccepted);
      socket.off("call:rejected", onCallRejected);
      socket.off("call:ended", onCallEnded);
      socket.off("call:participant-joined", onParticipantJoined);
      socket.off("call:participant-invited", onParticipantInvited);
      socket.off("call:participant-left", onParticipantLeft);
      socket.off("webrtc:offer", onWebRTCOffer);
      socket.off("webrtc:answer", onWebRTCAnswer);
      socket.off("webrtc:ice-candidate", onWebRTCIceCandidate);
    };
  }, [socket, session?.user.id]);

  function startTimer() {
    if (timerRef.current) return;
    setCallDuration(0);
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }

  async function prepareGroupCallMedia(type: "AUDIO" | "VIDEO") {
    if (!localStreamRef.current) {
      if (!localMediaPromiseRef.current) {
        localMediaPromiseRef.current = (async () => {
          const res = await requestLocalMedia(type, (msg) => {
            setMicPromptMessage(msg);
            setHasNoMic(true);
            setIsMicMuted(true);
          });
          if (!res.hasAudio) {
            setHasNoMic(true);
            setIsMicMuted(true);
          } else {
            setHasNoMic(false);
          }
          return res.stream;
        })();
      }
      try {
        localStreamRef.current = await localMediaPromiseRef.current;
      } finally {
        localMediaPromiseRef.current = null;
      }
    }
    if (localVideoRef.current && type === "VIDEO") {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }

  async function flushPendingIceCandidates(userId: number, pc: RTCPeerConnection) {
    const candidates = pendingIceCandidatesRef.current.get(userId) || [];
    pendingIceCandidatesRef.current.delete(userId);
    for (const candidate of candidates) {
      if (candidate && candidate.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn("[WebRTC Group] Error adding ICE candidate:", err);
        }
      }
    }
  }

  async function createGroupPeerConnection(targetUserId: number, isCaller: boolean) {
    const existingConnection = groupPeerConnectionsRef.current.get(targetUserId);
    if (existingConnection) return existingConnection;
    const pendingConnection = pendingGroupPeerConnectionsRef.current.get(targetUserId);
    if (pendingConnection) return pendingConnection;

    const setupConnection = async () => {
      const call = activeCallRef.current;
      if (!call?.callSessionId) throw new Error("Group call session is not ready");
      await prepareGroupCallMedia(call.type);
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      groupPeerConnectionsRef.current.set(targetUserId, pc);
      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
      pc.ontrack = (event) => {
        const stream = (event.streams && event.streams[0])
          ? event.streams[0]
          : new MediaStream([event.track]);
        stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        setRemoteParticipants((prev) => [
          ...prev.filter((participant) => participant.userId !== targetUserId),
          { userId: targetUserId, stream },
        ]);
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit("webrtc:ice-candidate", {
            targetUserId,
            callSessionId: call.callSessionId,
            candidate: event.candidate,
          });
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          groupPeerConnectionsRef.current.delete(targetUserId);
          setRemoteParticipants((prev) => prev.filter((participant) => participant.userId !== targetUserId));
        }
      };
      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit("webrtc:offer", {
          targetUserId,
          callSessionId: call.callSessionId,
          offer,
        });
      }
      return pc;
    };

    const connectionPromise = setupConnection();
    pendingGroupPeerConnectionsRef.current.set(targetUserId, connectionPromise);
    try {
      return await connectionPromise;
    } finally {
      pendingGroupPeerConnectionsRef.current.delete(targetUserId);
    }
  }

  // WebRTC Media & PeerConnection Initialization
  async function initiateWebRTC(targetUserId: number, isCaller: boolean, type: "AUDIO" | "VIDEO") {
    let stream = localStreamRef.current;
    if (!stream) {
      const res = await requestLocalMedia(type, (msg) => {
        setMicPromptMessage(msg);
        setHasNoMic(true);
        setIsMicMuted(true);
      });
      stream = res.stream;
      localStreamRef.current = stream;
      if (!res.hasAudio) {
        setHasNoMic(true);
        setIsMicMuted(true);
      } else {
        setHasNoMic(false);
        setIsMicMuted(false);
      }
    }

    // Set audio track enabled status according to mic availability
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !hasNoMic;
    });

    if (localVideoRef.current && type === "VIDEO") {
      localVideoRef.current.srcObject = stream;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
    });
    peerConnectionRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      console.log("[WebRTC P2P] ontrack received:", event.track.kind, event.streams);
      const incomingStream = (event.streams && event.streams[0])
        ? event.streams[0]
        : new MediaStream([event.track]);

      // Unmute all remote audio tracks
      incomingStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      setRemoteStream(incomingStream);

      // Immediately wire audio element so headphones output without delay
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = incomingStream;
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.play().catch((err) => {
          console.warn("[WebRTC] Autoplay pending interaction:", err);
        });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("webrtc:ice-candidate", {
          targetUserId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC P2P] Connection state:", pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC P2P] ICE state:", pc.iceConnectionState);
    };

    if (isCaller) {
      // Caller: create and send the offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit("webrtc:offer", { targetUserId, offer });
      } catch (error) {
        pc.close();
        peerConnectionRef.current = null;
        throw error;
      }
    } else {
      // Callee: process any buffered offer + ICE candidates that arrived before we were ready
      const pending = pendingP2POfferRef.current;
      if (pending) {
        console.log("[WebRTC] Processing buffered offer now that PC is ready");
        pendingP2POfferRef.current = null;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(pending.offer));
          // Flush buffered ICE candidates
          for (const c of pendingP2PIceCandidatesRef.current) {
            if (c && c.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } catch (err) {
                console.warn("[WebRTC Callee] Error adding buffered ICE candidate:", err);
              }
            }
          }
          pendingP2PIceCandidatesRef.current = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket?.emit("webrtc:answer", { targetUserId: pending.fromUserId, answer });
        } catch (error) {
          console.error("[WebRTC] Failed to process buffered offer:", error);
          pc.close();
          peerConnectionRef.current = null;
          throw error;
        }
      }
    }
  }

  // Retry connecting microphone when user plugs in headphones / headset / mic
  async function retryConnectMic() {
    try {
      const newMedia = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const newAudioTrack = newMedia.getAudioTracks()[0];
      if (!newAudioTrack) {
        showNotification({
          title: "Microphone Not Detected",
          text: "Microphone not detected. Please verify your headphones or microphone connection.",
          icon: "warning",
        });
        return;
      }

      // Replace audio track in localStreamRef
      if (localStreamRef.current) {
        const oldTracks = localStreamRef.current.getAudioTracks();
        oldTracks.forEach((t) => {
          localStreamRef.current?.removeTrack(t);
          t.stop();
        });
        localStreamRef.current.addTrack(newAudioTrack);
      }

      // Replace audio track in 1-on-1 peer connection
      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) {
          await sender.replaceTrack(newAudioTrack);
        }
      }

      // Replace audio track in all group peer connections
      groupPeerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) {
          sender.replaceTrack(newAudioTrack).catch(console.warn);
        }
      });

      newAudioTrack.enabled = true;
      setIsMicMuted(false);
      setHasNoMic(false);
      setMicPromptMessage(null);
      showSuccessToast("Microphone connected successfully");
    } catch (err) {
      console.error("Retry microphone error:", err);
      showNotification({
        title: "Microphone Notice",
        text: "Microphone was not found or access was denied. Please plug in your headphones/mic and grant permission in browser settings.",
        icon: "warning",
      });
    }
  }

  // Available employees that can be invited into the active call
  const availableEmployeesToInvite = useMemo(() => {
    if (!employees) return [];
    const inCallUserIds = new Set<number>();
    if (session?.user?.id) inCallUserIds.add(session.user.id);
    if (activeCall?.peerUserId) inCallUserIds.add(activeCall.peerUserId);
    remoteParticipants.forEach((p) => inCallUserIds.add(p.userId));

    return employees.filter((emp) => {
      if (inCallUserIds.has(emp.id)) return false;
      if (!addMemberSearch.trim()) return true;
      const q = addMemberSearch.toLowerCase();
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q)
      );
    });
  }, [employees, session?.user?.id, activeCall?.peerUserId, remoteParticipants, addMemberSearch]);

  const handleInviteMemberToCall = (targetUserId: number) => {
    if (!activeCall?.callSessionId || !socket) return;
    setInvitingEmployeeId(targetUserId);

    socket.emit(
      "call:invite",
      {
        callSessionId: activeCall.callSessionId,
        targetUserId,
      },
      (res: { success?: boolean; error?: string }) => {
        setInvitingEmployeeId(null);
        if (res?.error) {
          showErrorToast(res.error);
        } else {
          showSuccessToast("Invitation sent to colleague");
          setInvitedEmployeeIds((prev) => new Set(prev).add(targetUserId));
          // If this was a 1-on-1 call, upgrade it to group call representation
          if (activeCall && !activeCall.isGroupCall) {
            if (activeCall.peerUserId && remoteStream) {
              setRemoteParticipants((prev) => {
                if (prev.some((p) => p.userId === activeCall.peerUserId)) return prev;
                return [...prev, { userId: activeCall.peerUserId!, stream: remoteStream }];
              });
            }
            setCurrentActiveCall({
              ...activeCall,
              isGroupCall: true,
              targetName: activeCall.targetName.includes("Group")
                ? activeCall.targetName
                : `${activeCall.targetName} & others`,
            });
          }
        }
      }
    );
  };

  // Accept Incoming Call
  const handleAcceptIncomingCall = async () => {
    if (!incomingCall || !socket) return;

    try {
      await prepareGroupCallMedia(incomingCall.type);

      const call = {
        callSessionId: incomingCall.callSessionId,
        channelName: incomingCall.channelName,
        targetName: incomingCall.conversationName || incomingCall.caller.name,
        type: incomingCall.type,
        peerUserId: incomingCall.caller.id,
        isGroupCall: Boolean(incomingCall.isGroupCall),
        isHost: false,
      };
      setCurrentActiveCall(call);

      if (!incomingCall.isGroupCall) {
        await initiateWebRTC(incomingCall.caller.id, false, incomingCall.type);
      }

      socket.emit("call:accept", { callSessionId: incomingCall.callSessionId });
      setIncomingCall(null);
      startTimer();
    } catch (error) {
      console.error("Unable to access call media:", error);
      socket.emit("call:reject", { callSessionId: incomingCall.callSessionId });
      setIncomingCall(null);
      cleanupCall();
      showNotification({
        title: "Call Media Error",
        text: error instanceof Error ? error.message : "Could not access your microphone or camera.",
        icon: "warning",
      });
    }
  };

  // Reject Incoming Call
  const handleRejectIncomingCall = () => {
    if (!incomingCall || !socket) return;
    socket.emit("call:reject", { callSessionId: incomingCall.callSessionId });
    setIncomingCall(null);
    clearCallUrlParams();
  };

  // End Active Call
  function cleanupCall() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    groupPeerConnectionsRef.current.forEach((connection) => connection.close());
    groupPeerConnectionsRef.current.clear();
    pendingGroupPeerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
    localMediaPromiseRef.current = null;
    startedChannelRef.current = null; // Reset so a fresh call can be started again
    // Clear P2P race-condition buffers
    pendingP2POfferRef.current = null;
    pendingP2PIceCandidatesRef.current = [];
    setRemoteParticipants([]);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setCurrentActiveCall(null);
    setCallDuration(0);
    setRemoteStream(null); // Clear remote stream state
    setHasNoMic(false);
    setMicPromptMessage(null);
    setShowAddMemberModal(false);
    setInvitedEmployeeIds(new Set());
    setInvitingEmployeeId(null);
    // Always clear URL params after ending a call so page refresh doesn't re-open it
    clearCallUrlParams();
    fetchCalls();
  }

  function endWebRTCCall() {
    const call = activeCallRef.current;
    if (socket && call?.callSessionId) {
      socket.emit("call:end", { callSessionId: call.callSessionId });
    }
    cleanupCall();
  }

  // Mic & Camera Toggles
  const toggleMic = () => {
    if (hasNoMic) {
      retryConnectMic();
      return;
    }
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCam = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOff(!videoTrack.enabled);
      }
    }
  };

  // Initiate New Call from Modal
  const handleStartCallSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEmpId || !socket) return;

    const targetEmp = employees.find((e) => e.id === Number(targetEmpId));
    if (!targetEmp) return;

    try {
      await prepareGroupCallMedia(callType);
    } catch (error) {
      console.error("Unable to access call media:", error);
      showNotification({
        title: "Media Access Error",
        text: error instanceof Error ? error.message : "Could not access your microphone or camera.",
        icon: "warning",
      });
      return;
    }

    const channelName = `call-${Date.now()}`;
    setShowStartModal(false);
    const newCall: ActiveCall = {
      channelName,
      targetName: targetEmp.name,
      type: callType,
      peerUserId: targetEmp.id,
    };
    setCurrentActiveCall(newCall);

    socket.emit(
      "call:initiate",
      {
        targetUserId: targetEmp.id,
        type: callType,
        channelName,
      },
      (result: { callSessionId?: number; error?: string }) => {
        if (!result?.callSessionId) {
          showNotification({
            title: "Unable to Start Call",
            text: result?.error || "Unable to start the call session.",
            icon: "error",
          });
          cleanupCall();
          return;
        }
        setCurrentActiveCall({ ...newCall, callSessionId: result.callSessionId });
        void initiateWebRTC(targetEmp.id, true, callType).catch((error: unknown) => {
          console.error("Error setting up WebRTC media:", error);
          socket.emit("call:end", { callSessionId: result.callSessionId });
          cleanupCall();
          showNotification({
            title: "WebRTC Setup Error",
            text: error instanceof Error ? error.message : "Unable to set up call media.",
            icon: "error",
          });
        });
      }
    );
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading Calls...</main>;
  }

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 welcome mb-6">
            <div>
              <h2 className="text-2xl font-black text-slate-800">Audio & Video Calls</h2>
              <p className="text-xs text-slate-500 font-medium">
                Calling history
              </p>
            </div>
            <div className="flex items-center gap-2">
              {calls.length > 0 && (
                <button
                  onClick={handleClearAllCalls}
                  className="px-3 py-2 bg-black hover:bg-[#EA580C] hover:text-white text-white font-bold rounded-xl transition-all border border-slate-200 text-xs cursor-pointer"
                >
                  Clear All Logs
                </button>
              )}
              <button
                onClick={() => setShowStartModal(true)}
                className="px-3 py-2  bg-[#171717] hover:bg-[#EA580C] text-white font-bold rounded-xl transition-all shadow-xs text-xs flex items-center gap-2 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" /> + New Call
              </button>
            </div>
          </div>

          {/* Call History Table */}
          {loading ? (
            <p className="text-xs text-slate-400 font-medium animate-pulse">Loading call logs...</p>
          ) : calls.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-400 text-xs font-medium">No call logs recorded yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-4">Type</th>
                      <th className="p-4">Host</th>
                      <th className="p-4">Participants</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Date & Time</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedCalls.map((call) => (
                      <tr key={call.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-bold flex items-center gap-2">
                          {call.type === "VIDEO" ? (
                            <Video className="w-4 h-4 text-orange-500" />
                          ) : (
                            <Phone className="w-4 h-4 text-emerald-600" />
                          )}
                          <span>{call.type} Call</span>
                        </td>
                        <td className="p-4 text-slate-900 font-semibold">{call.host.name}</td>
                        <td className="p-4 text-slate-500">
                          {call.participants.map((p) => p.user.name).join(", ")}
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${call.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : call.status === "ENDED"
                                ? "bg-slate-100 text-slate-700"
                                : call.status === "MISSED"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                          >
                            {call.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 font-medium">
                          {new Date(call.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteCall(call.id)}
                            className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                            title="Delete call log"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Calling History Pagination Controls */}
              {totalCalls > 0 && (
                <div className="bg-slate-50/80 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs font-medium text-slate-500">
                    Showing <span className="font-bold text-slate-800">{(safePage - 1) * pageSize + 1}</span> to{" "}
                    <span className="font-bold text-slate-800">{Math.min(safePage * pageSize, totalCalls)}</span> of{" "}
                    <span className="font-bold text-slate-800">{totalCalls}</span> call logs
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                      <span>Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="h-8 px-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 cursor-pointer shadow-xs"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="h-8 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Previous</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((pageNum) => {
                            if (totalPages <= 5) return true;
                            if (pageNum === 1 || pageNum === totalPages) return true;
                            return Math.abs(pageNum - safePage) <= 1;
                          })
                          .map((pageNum, idx, arr) => {
                            const prevNum = arr[idx - 1];
                            const showEllipsis = prevNum && pageNum - prevNum > 1;

                            return (
                              <div key={pageNum} className="flex items-center gap-1">
                                {showEllipsis && (
                                  <span className="text-slate-400 text-xs px-1 select-none">...</span>
                                )}
                                <button
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${safePage === pageNum
                                    ? "bg-[#EA580C] text-white shadow-xs"
                                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                    }`}
                                >
                                  {pageNum}
                                </button>
                              </div>
                            );
                          })}
                      </div>

                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="h-8 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                        title="Next Page"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Incoming Call Ringing Dialog Modal */}
          {incomingCall && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
              <div className="bg-slate-900 text-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-800 text-center space-y-6 animate-bounce">
                <div className="w-20 h-20 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center mx-auto border-2 border-orange-500/40 animate-pulse">
                  {incomingCall.type === "VIDEO" ? <Video className="w-9 h-9" /> : <Phone className="w-9 h-9" />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    {incomingCall.conversationName || incomingCall.caller.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Incoming {incomingCall.isGroupCall ? "group " : ""}{incomingCall.type} call from {incomingCall.caller.name}...
                  </p>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={handleRejectIncomingCall}
                    className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                    title="Decline"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </button>
                  <button
                    onClick={handleAcceptIncomingCall}
                    className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                    title="Accept"
                  >
                    <Phone className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Always-mounted audio element for remote audio - offscreen so Chromium audio engine keeps hardware output active for headphones/speakers */}
          <audio
            ref={remoteAudioRef}
            autoPlay
            playsInline
            style={{
              position: "fixed",
              left: "-9999px",
              top: "-9999px",
              width: "1px",
              height: "1px",
              opacity: 0.01,
              pointerEvents: "none",
            }}
          />

          {/* Active WebRTC Call Screen Overlay */}
          {activeCall && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4">

              <div className="bg-slate-900 text-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-700/60 flex flex-col max-h-[90vh]"
                style={{ boxShadow: "0 0 60px rgba(239,68,68,0.15), 0 25px 50px rgba(0,0,0,0.8)" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      {activeCall.type === "VIDEO" ? (
                        <Video className="w-5 h-5 text-orange-400" />
                      ) : (
                        <Mic className="w-5 h-5 text-orange-400" />
                      )}
                      <span>{activeCall.isGroupCall ? `Group Call — ${activeCall.targetName}` : `Call with ${activeCall.targetName}`}</span>
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-block w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                      <p className="text-xs text-emerald-400 font-mono font-bold">
                        {formatTime(callDuration)}
                      </p>
                    </div>
                  </div>
                  {/* Top-right action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddMemberModal(true)}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center gap-2 cursor-pointer shadow-md"
                      title="Add Member to Call"
                    >
                      <UserPlus className="w-4 h-4 text-orange-400" />
                      <span>Add Member</span>
                    </button>
                    <button
                      onClick={endWebRTCCall}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-extrabold text-xs rounded-xl transition-all shadow-lg flex items-center gap-2 cursor-pointer"
                      style={{ boxShadow: "0 0 20px rgba(239,68,68,0.5)" }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                      </svg>
                      End Call
                    </button>
                  </div>
                </div>

                {/* Listen-Only Notification Banner */}
                {hasNoMic && (
                  <div className="mb-3 px-3.5 py-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-300">
                    <div className="flex items-center gap-2">
                      <Headphones className="w-4 h-4 text-amber-400 shrink-0" />
                      <span><strong>Listen-Only Mode:</strong> No microphone detected. You can hear others clearly, but your voice is not transmitted.</span>
                    </div>
                    <button
                      onClick={retryConnectMic}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-[10px] transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Connect Mic
                    </button>
                  </div>
                )}

                {/* Video / Audio Streams Display */}
                <div className={`flex-1 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 relative min-h-[360px] ${activeCall.isGroupCall ? "p-3" : "flex items-center justify-center"}`}>
                  {activeCall.isGroupCall ? (
                    <div className="grid h-full min-h-[330px] grid-cols-1 gap-3 sm:grid-cols-2">
                      {remoteParticipants.map((participant) => (
                        <RemoteParticipantMedia
                          key={participant.userId}
                          participant={participant}
                          name={employees.find((employee) => employee.id === participant.userId)?.name || `Employee #${participant.userId}`}
                          type={activeCall.type}
                        />
                      ))}
                      {remoteParticipants.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center gap-3 text-sm text-slate-400">
                          <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500 animate-pulse">
                            <Users className="w-7 h-7" />
                          </div>
                          <p>Waiting for group members to join...</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      {activeCall.type === "VIDEO" ? (
                        <video
                          ref={remoteVideoRef}
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover rounded-2xl"
                        />
                      ) : (
                        <div
                          className="text-center space-y-4 cursor-pointer select-none"
                          onClick={() => {
                            if (remoteAudioRef.current && remoteAudioRef.current.paused) {
                              remoteAudioRef.current.play().catch(console.warn);
                            }
                          }}
                          title="Click anywhere to ensure audio is playing"
                        >
                          {/* Animated audio waveform rings */}
                          <div className="relative flex items-center justify-center">
                            <div className="absolute w-40 h-40 rounded-full border border-orange-500/20 animate-ping" style={{ animationDuration: "2s" }}></div>
                            <div className="absolute w-32 h-32 rounded-full border border-orange-500/30 animate-ping" style={{ animationDuration: "1.5s" }}></div>
                            <div className="w-24 h-24 bg-gradient-to-br from-orange-500/20 to-rose-500/20 text-orange-400 rounded-full flex items-center justify-center border border-orange-500/40">
                              <Mic className="w-10 h-10 text-orange-400" />
                            </div>
                          </div>
                          <p className="text-base font-bold text-white mt-6">{activeCall.targetName}</p>
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="w-1.5 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                            <span className="w-1.5 h-6 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                            <span className="w-1.5 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                            <span className="w-1.5 h-5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "450ms" }}></span>
                            <span className="w-1.5 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "600ms" }}></span>
                          </div>
                          <p className="text-xs text-slate-400">Voice call active • Audio connected</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Local Video Stream Preview (PiP) */}
                  {activeCall.type === "VIDEO" && (
                    <div className="absolute bottom-4 right-4 w-40 h-28 bg-slate-900 border-2 border-orange-500/50 rounded-xl overflow-hidden shadow-2xl">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-1 left-2 text-[9px] font-bold text-white/70">You</div>
                    </div>
                  )}
                </div>

                {/* Call Control Toolbar */}
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-center gap-4">
                  {/* Mute Mic / No Mic */}
                  {hasNoMic ? (
                    <button
                      onClick={retryConnectMic}
                      className="w-14 h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg bg-amber-500/20 border-2 border-amber-500 text-amber-400 hover:bg-amber-500/30 cursor-pointer"
                      title="No microphone detected. Click to connect headphones or microphone."
                    >
                      <MicOff className="w-5 h-5 text-amber-400" />
                      <span className="text-[8px] font-bold">No Mic</span>
                    </button>
                  ) : (
                    <button
                      onClick={toggleMic}
                      className={`w-14 h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg ${isMicMuted
                        ? "bg-rose-600/20 border-2 border-rose-500 text-rose-400"
                        : "bg-slate-800 border-2 border-slate-700 text-slate-200 hover:bg-slate-700"
                        }`}
                      title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                      {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      <span className="text-[8px] font-bold">{isMicMuted ? "Muted" : "Mic"}</span>
                    </button>
                  )}

                  {/* Camera Toggle — only for video */}
                  {activeCall.type === "VIDEO" && (
                    <button
                      onClick={toggleCam}
                      className={`w-14 h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg ${isCamOff
                        ? "bg-rose-600/20 border-2 border-rose-500 text-rose-400"
                        : "bg-slate-800 border-2 border-slate-700 text-slate-200 hover:bg-slate-700"
                        }`}
                      title={isCamOff ? "Turn Camera On" : "Turn Camera Off"}
                    >
                      {isCamOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                      <span className="text-[8px] font-bold">{isCamOff ? "Cam Off" : "Camera"}</span>
                    </button>
                  )}

                  {/* Add Member Button in Toolbar */}
                  <button
                    onClick={() => setShowAddMemberModal(true)}
                    className="w-14 h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg bg-slate-800 border-2 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-orange-500/50 cursor-pointer"
                    title="Add Member to Call"
                  >
                    <UserPlus className="w-5 h-5 text-orange-400" />
                    <span className="text-[8px] font-bold">Add</span>
                  </button>

                  {/* ============ ENHANCED END CALL BUTTON ============ */}
                  <button
                    onClick={endWebRTCCall}
                    className="relative w-20 h-14 rounded-2xl text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 cursor-pointer"
                    style={{
                      background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                      boxShadow: "0 0 30px rgba(220,38,38,0.6), 0 4px 15px rgba(0,0,0,0.4)",
                    }}
                    title="End Call"
                  >
                    {/* Pulse ring animation */}
                    <span
                      className="absolute inset-0 rounded-2xl animate-ping"
                      style={{ background: "rgba(220,38,38,0.3)", animationDuration: "1.5s" }}
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 relative z-10" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                    </svg>
                    <span className="text-[9px] font-extrabold relative z-10 tracking-wide">END</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* No Microphone / Headset Detected Friendly Dialog Modal */}
          {micPromptMessage && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
              <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-white">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Headphones className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Microphone / Headset Not Detected
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {micPromptMessage}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50 text-xs text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Are headphones required?</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal pl-6">
                    <strong>No</strong>, headphones are not required to hear this call (your device speakers work fine). However, a microphone or headset with mic is needed if you want other participants to hear your voice.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setMicPromptMessage(null)}
                    className="px-4 py-2.5 text-xs text-slate-300 font-bold hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    Continue in Listen-Only Mode
                  </button>
                  <button
                    type="button"
                    onClick={retryConnectMic}
                    className="px-4 py-2.5 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry / Connect Mic
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add Member During Active Call Modal */}
          {showAddMemberModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-white">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
                      <UserPlus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">Add Member to Call</h3>
                      <p className="text-[11px] text-slate-400">Invite a colleague into this ongoing call</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddMemberModal(false)}
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={addMemberSearch}
                    onChange={(e) => setAddMemberSearch(e.target.value)}
                    placeholder="Search colleagues by name or email..."
                    className="w-full h-10 pl-9 pr-3 text-xs bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>

                {/* Employee List */}
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {availableEmployeesToInvite.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      {addMemberSearch ? "No colleagues match your search." : "All available colleagues are already in this call."}
                    </div>
                  ) : (
                    availableEmployeesToInvite.map((emp) => {
                      const isInvited = invitedEmployeeIds.has(emp.id);
                      const isInviting = invitingEmployeeId === emp.id;

                      return (
                        <div
                          key={emp.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <p className="text-xs font-bold text-white truncate">{emp.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{emp.email}</p>
                            </div>
                          </div>

                          <div className="shrink-0 ml-2">
                            {isInvited ? (
                              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                <Check className="w-3 h-3" /> Calling...
                              </span>
                            ) : (
                              <button
                                onClick={() => handleInviteMemberToCall(emp.id)}
                                disabled={isInviting}
                                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                              >
                                {isInviting ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" /> Calling...
                                  </>
                                ) : (
                                  <>
                                    <Phone className="w-3 h-3" /> Invite
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setShowAddMemberModal(false)}
                    className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Start New Call Modal */}
          {showStartModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
                <h2 className="text-base font-black text-slate-900">Start Audio / Video Call</h2>
                <form onSubmit={handleStartCallSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Select Employee
                    </label>
                    <select
                      value={targetEmpId}
                      onChange={(e) => setTargetEmpId(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      required
                    >
                      <option value="">-- Choose Employee --</option>
                      {employees
                        .filter((e) => e.id !== session.user.id)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.email})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Call Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCallType("VIDEO")}
                        className={`py-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${callType === "VIDEO"
                          ? "bg-orange-50 border-orange-500 text-orange-700"
                          : "bg-slate-50 border-slate-200 text-slate-600"
                          }`}
                      >
                        <Video className="w-4 h-4" /> Video Call
                      </button>
                      <button
                        type="button"
                        onClick={() => setCallType("AUDIO")}
                        className={`py-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${callType === "AUDIO"
                          ? "bg-orange-50 border-orange-500 text-orange-700"
                          : "bg-slate-50 border-slate-200 text-slate-600"
                          }`}
                      >
                        <Phone className="w-4 h-4" /> Audio Call
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowStartModal(false)}
                      className="px-4 py-2.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2.5 text-xs bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Call Now ➔
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
