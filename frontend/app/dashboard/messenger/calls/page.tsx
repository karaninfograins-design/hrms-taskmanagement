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
  Smartphone,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Volume1,
  VolumeX,
  ScreenShare,
  ScreenShareOff,
  Maximize2,
  Minimize2,
  Grid,
  Layout,
  User,
  Info,
  Pin,
  Sparkles,
  Monitor,
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
import { playRingtone, playCallerTune, stopRingtone } from "@/lib/ringtone";

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
  phoneNumber?: string | null;
  role?: { id: number; name: string };
  designation?: { id: number; name: string };
  status?: string;
};

// Robust helper to find the video sender on a WebRTC peer connection
// Works whether a video track has already been attached or if it was initialized via addTransceiver
function getVideoSender(pc: RTCPeerConnection): RTCRtpSender | undefined {
  const videoTransceiver = pc.getTransceivers().find(
    (t) => t.receiver?.track?.kind === "video" || t.sender?.track?.kind === "video"
  );
  if (videoTransceiver) {
    if (videoTransceiver.direction === "recvonly" || videoTransceiver.direction === "inactive") {
      try {
        videoTransceiver.direction = "sendrecv";
      } catch (e) {
        console.warn("Set transceiver direction error:", e);
      }
    }
    return videoTransceiver.sender;
  }
  return pc.getSenders().find(
    (s) => s.track?.kind === "video" || (s.track === null && pc.getReceivers().some((r) => r.track?.kind === "video"))
  );
}

type ActiveCall = {
  callSessionId?: number;
  channelName: string;
  targetName: string;
  type: "AUDIO" | "VIDEO";
  peerUserId?: number;
  isGroupCall?: boolean;
  isHost?: boolean;
  meetingId?: number;
};

type RemoteParticipant = {
  userId: number;
  stream: MediaStream;
};

// Production-ready STUN + TURN servers (Google STUN + OpenRelay TURN for strict firewalls/NAT)
const DEFAULT_RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    // Google Public STUN
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },

    // OpenRelay Public STUN + TURN (Metered CA - Relays audio/video across strict NAT and firewalls)
    { urls: "stun:openrelay.metered.ca:80" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
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
  const isSecure =
    typeof window !== "undefined" &&
    (window.isSecureContext ||
      window.location?.protocol === "https:" ||
      window.location?.hostname === "localhost" ||
      window.location?.hostname === "127.0.0.1");

  const hasGetUserMedia =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";

  // Fallback if browser environment lacks getUserMedia (e.g. plain HTTP on mobile browsers)
  if (!hasGetUserMedia) {
    console.warn(
      "[Media] navigator.mediaDevices.getUserMedia unavailable. Fallback to Listen-Only mode."
    );
    if (onNoMicDetected) {
      onNoMicDetected(
        isSecure
          ? "Built-in microphone not accessible on this browser. You have joined in Listen-Only mode (you can hear all audio on your device speaker)."
          : "LAN HTTP Notice: Modern mobile browsers require HTTPS (e.g., https://hrms.infograins.com) to access the phone's built-in microphone over Wi-Fi. You have joined in Listen-Only mode (you can hear audio on your phone speaker). In production over HTTPS, mobile phone mic & speaker work 100% without headphones."
      );
    }
    const silentTrack = createSilentAudioTrack();
    const tracks: MediaStreamTrack[] = [];
    if (silentTrack) tracks.push(silentTrack);
    return {
      stream: new MediaStream(tracks),
      hasAudio: false,
    };
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
        ? "Microphone not detected. Mobile phones have built-in microphones (no headphones needed) — please check if microphone permission was granted in your browser."
        : isPermissionDenied
          ? "Microphone permission is blocked in your browser settings. Mobile phones and laptops do NOT require headphones — simply tap the lock/settings icon in your browser address bar and set Microphone to 'Allow' to speak."
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

// Global persistent audio bridge for all remote participants in meetings / group calls
// Ensures all participants can hear everyone continuously, even when in dock, thumbnails, or minimized
function SingleParticipantAudio({
  participant,
  isSpeakerOn,
  onAudioBlocked,
}: {
  participant: RemoteParticipant;
  isSpeakerOn: boolean;
  onAudioBlocked?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !participant.stream) return;
    if (el.srcObject !== participant.stream) {
      el.srcObject = participant.stream;
    }
    el.muted = false;
    el.volume = isSpeakerOn ? 1.0 : 0.65;
    el.play().catch((err) => {
      if (err.name !== "AbortError") {
        console.warn(`[WebRTC Audio] Autoplay blocked for user ${participant.userId}:`, err);
        onAudioBlocked?.();
      }
    });

    const handleTrack = () => {
      if (el && participant.stream) {
        if (el.srcObject !== participant.stream) {
          el.srcObject = participant.stream;
        }
        el.muted = false;
        el.play().catch(console.warn);
      }
    };

    participant.stream.addEventListener("addtrack", handleTrack);
    return () => {
      participant.stream?.removeEventListener("addtrack", handleTrack);
    };
  }, [participant.stream, isSpeakerOn, onAudioBlocked, participant.userId]);

  return (
    <audio
      ref={audioRef}
      data-participant-id={participant.userId}
      autoPlay
      playsInline
      style={{ position: "fixed", width: "1px", height: "1px", opacity: 0.01, pointerEvents: "none" }}
    />
  );
}

function RemoteAudioBridge({
  participants,
  isSpeakerOn,
  onAudioBlocked,
}: {
  participants: RemoteParticipant[];
  isSpeakerOn: boolean;
  onAudioBlocked?: () => void;
}) {
  return (
    <div className="sr-only pointer-events-none select-none" aria-hidden="true">
      {participants.map((p) => (
        <SingleParticipantAudio
          key={p.userId}
          participant={p}
          isSpeakerOn={isSpeakerOn}
          onAudioBlocked={onAudioBlocked}
        />
      ))}
    </div>
  );
}

function RemoteParticipantMedia({
  participant,
  name,
  type,
  isSpeakerOn = true,
  onAudioBlocked,
  onFocus,
  isFocused = false,
  isThumbnail = false,
  employee,
  onViewProfile,
}: {
  participant: RemoteParticipant;
  name: string;
  type: "AUDIO" | "VIDEO";
  isSpeakerOn?: boolean;
  onAudioBlocked?: () => void;
  onFocus?: () => void;
  isFocused?: boolean;
  isThumbnail?: boolean;
  employee?: Employee;
  onViewProfile?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasLiveVideo = Boolean(
    participant.stream?.getVideoTracks().length &&
    participant.stream.getVideoTracks().some((t) => t.readyState !== "ended")
  );
  const shouldShowVideo = type === "VIDEO" || hasLiveVideo;

  useEffect(() => {
    const bindMedia = () => {
      if (videoRef.current && participant.stream) {
        if (videoRef.current.srcObject !== participant.stream) {
          videoRef.current.srcObject = participant.stream;
        }
        videoRef.current.play().catch(console.warn);
      }
    };
    bindMedia();
    participant.stream?.addEventListener?.("addtrack", bindMedia);
    participant.stream?.addEventListener?.("removetrack", bindMedia);
    return () => {
      participant.stream?.removeEventListener?.("addtrack", bindMedia);
      participant.stream?.removeEventListener?.("removetrack", bindMedia);
    };
  }, [participant.stream, shouldShowVideo]);

  useEffect(() => {
    if (audioRef.current && participant.stream) {
      if (audioRef.current.srcObject !== participant.stream) {
        audioRef.current.srcObject = participant.stream;
      }
      audioRef.current.muted = false;
      audioRef.current.volume = isSpeakerOn ? 1.0 : 0.65;
      audioRef.current.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("[WebRTC Participant] Autoplay blocked, needs user interaction:", err);
          onAudioBlocked?.();
        }
      });
    }
  }, [participant.stream, isSpeakerOn, onAudioBlocked]);

  if (!shouldShowVideo) {
    return (
      <div
        className={`flex min-h-40 flex-col items-center justify-center rounded-2xl border bg-slate-900 p-4 cursor-pointer select-none transition-all relative ${isFocused ? "border-orange-500 ring-2 ring-orange-500/30" : "border-slate-800 hover:border-slate-700"
          }`}
        onClick={() => {
          onFocus?.();
          if (audioRef.current) {
            audioRef.current.muted = false;
            audioRef.current.volume = isSpeakerOn ? 1.0 : 0.65;
            audioRef.current.play().catch(console.warn);
          }
        }}
        title="Click to focus / ensure audio is active"
      >
        {!isThumbnail && (
          <audio
            ref={audioRef}
            data-participant-audio="true"
            autoPlay
            playsInline
            style={{ position: "fixed", width: "1px", height: "1px", opacity: 0.01, pointerEvents: "none" }}
          />
        )}
        <div className="relative mb-3 flex items-center justify-center">
          <div className="absolute w-16 h-16 rounded-full border border-orange-500/20 animate-ping" style={{ animationDuration: "2s" }} />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-orange-400 border border-orange-500/30 text-lg font-bold">
            {name.charAt(0).toUpperCase()}
          </div>
        </div>
        <p className="text-xs sm:text-sm font-bold text-white truncate max-w-full px-2">{name}</p>
        {employee?.role?.name && (
          <span className="text-[10px] text-slate-400 truncate max-w-full">{employee.role.name}</span>
        )}
        <div className="mt-2 flex items-center gap-1">
          <span className="w-1 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          <span className="w-1 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "450ms" }} />
        </div>

        {/* Zoom-style quick profile action */}
        {onViewProfile && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile();
            }}
            className="absolute top-2 right-2 p-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold border border-slate-700 transition-all opacity-80 hover:opacity-100 cursor-pointer shadow-sm"
            title="View User Profile"
          >
            <User className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onFocus}
      className={`relative h-full min-h-44 overflow-hidden rounded-2xl border bg-slate-950 flex items-center justify-center cursor-pointer transition-all ${isFocused ? "border-orange-500 ring-2 ring-orange-500/40" : "border-slate-800 hover:border-slate-700"
        }`}
      title="Click to expand this presentation/video to Full View"
    >
      {!isThumbnail && (
        <audio
          ref={audioRef}
          data-participant-audio="true"
          autoPlay
          playsInline
          style={{ position: "fixed", width: "1px", height: "1px", opacity: 0.01, pointerEvents: "none" }}
        />
      )}
      <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-contain bg-black" />
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-slate-950/80 backdrop-blur-xs px-2.5 py-1 text-xs font-semibold text-white border border-slate-800/80 z-10">
        <span className="truncate max-w-[120px] sm:max-w-[180px]">{name}</span>
        {hasLiveVideo && (
          <span className="px-1.5 py-0.2 rounded bg-orange-500/30 text-orange-300 text-[9px] font-bold shrink-0">
            Live Stream
          </span>
        )}
      </div>

      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
        {onViewProfile && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile();
            }}
            className="p-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-bold border border-slate-700 transition-all opacity-80 hover:opacity-100 cursor-pointer shadow-sm"
            title="View User Profile"
          >
            <User className="w-3.5 h-3.5" />
          </button>
        )}
        {onFocus && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
            }}
            className="p-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-bold border border-slate-700 transition-all opacity-80 hover:opacity-100 cursor-pointer shadow-sm"
            title="Full View Stage"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
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
    meetingId?: number;
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
  const [selectedProfileUser, setSelectedProfileUser] = useState<Employee | null>(null);
  const [addMemberSearch, setAddMemberSearch] = useState<string>("");
  const [invitingEmployeeId, setInvitingEmployeeId] = useState<number | null>(null);
  const [invitedEmployeeIds, setInvitedEmployeeIds] = useState<Set<number>>(new Set());
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true); // Default to Speaker Mode (loudspeaker / hands-free)
  const [isAudioBlocked, setIsAudioBlocked] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isCallMaximized, setIsCallMaximized] = useState<boolean>(false);
  const [focusedParticipantId, setFocusedParticipantId] = useState<number | "local" | null>(null);
  const [swap1to1View, setSwap1to1View] = useState<boolean>(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null); // Always in DOM, plays remote audio for any call type
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const groupPeerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const pendingGroupPeerConnectionsRef = useRef<Map<number, Promise<RTCPeerConnection>>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const originalCameraTrackRef = useRef<MediaStreamTrack | null>(null);
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

  // Play caller tune / ringtone for incoming calls through headphones/speakers
  useEffect(() => {
    if (incomingCall) {
      playRingtone();
    } else {
      stopRingtone();
    }
    return () => {
      stopRingtone();
    };
  }, [incomingCall]);

  useEffect(() => {
    return () => {
      stopRingtone();
    };
  }, []);

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  // Prevent background page scrolling and hide side scrollbars when in active call
  useEffect(() => {
    if (activeCall) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [activeCall]);

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
    if (localVideoRef.current) {
      const activeLocal = screenStreamRef.current || localStreamRef.current;
      if (activeLocal && localVideoRef.current.srcObject !== activeLocal) {
        localVideoRef.current.srcObject = activeLocal;
        localVideoRef.current.play().catch(console.warn);
      }
    }
  }, [activeCall, isScreenSharing, swap1to1View, focusedParticipantId]);

  // Assign remote stream to media elements reactively once DOM is ready
  useEffect(() => {
    if (!remoteStream) return;

    // Always play audio through the dedicated hidden <audio> element
    if (remoteAudioRef.current && remoteStream.getAudioTracks().length > 0) {
      if (remoteAudioRef.current.srcObject !== remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = isSpeakerOn ? 1.0 : 0.65;
      remoteAudioRef.current
        .play()
        .then(() => {
          setIsAudioBlocked(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("Remote audio autoplay blocked, waiting for user gesture:", err);
            setIsAudioBlocked(true);
          }
        });
    }

    // Also wire video element for VIDEO or screen sharing calls
    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.play().catch(console.warn);
    }
  }, [remoteStream, activeCall, isScreenSharing, swap1to1View, isCallMaximized]);

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
    const meetingIdParam = searchParams.get("meetingId");
    const meetingId = meetingIdParam ? Number(meetingIdParam) : undefined;

    if (!socket || isIncomingCall || !channel || !session?.user || startedChannelRef.current === channel) return;
    startedChannelRef.current = channel;

    if (isGroupCall) {
      setCurrentActiveCall({
        callSessionId,
        channelName: channel,
        targetName: groupName || "Group Call",
        type,
        isGroupCall: true,
        isHost: true,
        meetingId,
      });

      if (callSessionId) {
        socket?.emit("call:join", { callSessionId });
      } else {
        socket?.emit(
          "call:initiate",
          {
            type,
            channelName: channel,
          },
          (result: { callSessionId?: number; error?: string }) => {
            if (result?.callSessionId) {
              const current = activeCallRef.current;
              if (current) {
                setCurrentActiveCall({ ...current, callSessionId: result.callSessionId });
              }
              socket?.emit("call:join", { callSessionId: result.callSessionId });
            }
          }
        );
      }

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
      playCallerTune();
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
      meetingId?: number;
    }) => {
      setIncomingCall(data);
    };

    const onCallAccepted = (data: { callSessionId: number; userId: number }) => {
      startTimer();
    };

    const onCallRejected = () => {
      stopRingtone();
      const call = activeCallRef.current;
      if (call?.isGroupCall) {
        showErrorToast("Invited colleague is currently unavailable.");
        return;
      }
      showNotification({
        title: "Call Declined",
        text: "The recipient declined the call or is currently unavailable.",
        icon: "info",
      });
      endWebRTCCall();
    };

    const onCallEnded = (data: { callSessionId: number }) => {
      stopRingtone();
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

    // Screen-share signalling: remote participants rebuild streams from PC receivers
    const onScreenShareStarted = ({ callSessionId, fromUserId }: { callSessionId: number; fromUserId: number }) => {
      const call = activeCallRef.current;
      if (!call || call.callSessionId !== callSessionId) return;
      const pc = groupPeerConnectionsRef.current.get(fromUserId) || (call.peerUserId === fromUserId ? peerConnectionRef.current : null);
      if (!pc) return;
      const freshStream = new MediaStream();
      pc.getReceivers().forEach((receiver) => {
        if (receiver.track && receiver.track.readyState !== "ended") {
          freshStream.addTrack(receiver.track);
        }
      });
      freshStream.getAudioTracks().forEach((t) => { t.enabled = true; });

      if (call.isGroupCall) {
        setRemoteParticipants((prev) => [
          ...prev.filter((p) => p.userId !== fromUserId),
          { userId: fromUserId, stream: freshStream },
        ]);
        if (freshStream.getVideoTracks().length > 0) {
          setFocusedParticipantId(fromUserId);
          setIsCallMaximized(true);
        }
        setFocusedParticipantId(fromUserId);
        setIsCallMaximized(true);
      } else {
        setRemoteStream(freshStream);
        setIsCallMaximized(true);
      }
    };

    const onScreenShareStopped = ({ callSessionId, fromUserId }: { callSessionId: number; fromUserId: number }) => {
      const call = activeCallRef.current;
      if (!call || call.callSessionId !== callSessionId) return;
      const pc = groupPeerConnectionsRef.current.get(fromUserId) || (call.peerUserId === fromUserId ? peerConnectionRef.current : null);
      if (!pc) return;
      const freshStream = new MediaStream();
      pc.getReceivers().forEach((receiver) => {
        if (receiver.track && receiver.track.readyState !== "ended") {
          freshStream.addTrack(receiver.track);
        }
      });
      freshStream.getAudioTracks().forEach((t) => { t.enabled = true; });

      if (call.isGroupCall) {
        setRemoteParticipants((prev) => [
          ...prev.filter((p) => p.userId !== fromUserId),
          { userId: fromUserId, stream: freshStream },
        ]);
        setFocusedParticipantId((current) => (current === fromUserId ? null : current));
      } else {
        setRemoteStream(freshStream);
      }
    };

    socket.on("call:screen-share-started", onScreenShareStarted);
    socket.on("call:screen-share-stopped", onScreenShareStopped);

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
      socket.off("call:screen-share-started", onScreenShareStarted);
      socket.off("call:screen-share-stopped", onScreenShareStopped);
    };
  }, [socket, session?.user.id]);

  function startTimer() {
    stopRingtone();
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
            setIsMicMuted(false);
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
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
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
      const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIGURATION);
      groupPeerConnectionsRef.current.set(targetUserId, pc);
      // Pre-add video transceiver so screen-sharing / camera can be received and sent even if call is AUDIO
      try {
        pc.addTransceiver("video", { direction: "sendrecv" });
      } catch (e) {
        console.warn("addTransceiver video error:", e);
      }
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
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
        const updateParticipantStream = () => {
          // Build a fresh stream from all live receiver tracks for this PC so replaced tracks are captured
          const freshStream = new MediaStream();
          pc.getReceivers().forEach((receiver) => {
            if (receiver.track && receiver.track.readyState !== "ended") {
              freshStream.addTrack(receiver.track);
            }
          });
          freshStream.getAudioTracks().forEach((t) => { t.enabled = true; });
          setRemoteParticipants((prev) => [
            ...prev.filter((p) => p.userId !== targetUserId),
            { userId: targetUserId, stream: freshStream },
          ]);
          if (freshStream.getVideoTracks().some((t) => t.readyState === "live")) {
            setFocusedParticipantId(targetUserId);
            setIsCallMaximized(true);
          }
        };
        // Initial bind
        setRemoteParticipants((prev) => [
          ...prev.filter((participant) => participant.userId !== targetUserId),
          { userId: targetUserId, stream },
        ]);
        if (stream.getVideoTracks().some((t) => t.readyState === "live")) {
          setFocusedParticipantId(targetUserId);
          setIsCallMaximized(true);
        }
        // Listen for track replacement (e.g. screen share via replaceTrack — no new ontrack fires)
        event.track.onunmute = updateParticipantStream;
        event.track.onmute = updateParticipantStream;
        // Also update when tracks are added/removed from the stream
        stream.addEventListener("addtrack", updateParticipantStream);
        stream.addEventListener("removetrack", updateParticipantStream);
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

    // Ensure all audio tracks are enabled so caller's voice is clearly transmitted!
    stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });

    if (localVideoRef.current && type === "VIDEO") {
      localVideoRef.current.srcObject = stream;
    }

    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIGURATION);
    peerConnectionRef.current = pc;
    // Pre-add video transceiver so screen sharing can be streamed/received seamlessly even for AUDIO calls
    try {
      pc.addTransceiver("video", { direction: "sendrecv" });
    } catch (e) {
      console.warn("addTransceiver video error:", e);
    }
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const syncRemoteTracks = () => {
      // Build a consolidated stream with all live tracks (audio + video)
      const freshStream = new MediaStream();
      pc.getReceivers().forEach((receiver) => {
        if (receiver.track && receiver.track.readyState !== "ended") {
          freshStream.addTrack(receiver.track);
        }
      });
      freshStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      setRemoteStream(freshStream);

      if (freshStream.getVideoTracks().some((t) => t.readyState === "live")) {
        setIsCallMaximized(true);
      }

      // Wire audio element if audio tracks are present
      if (remoteAudioRef.current && freshStream.getAudioTracks().length > 0) {
        if (remoteAudioRef.current.srcObject !== freshStream) {
          remoteAudioRef.current.srcObject = freshStream;
        }
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = isSpeakerOn ? 1.0 : 0.65;
        remoteAudioRef.current
          .play()
          .then(() => {
            setIsAudioBlocked(false);
          })
          .catch((err) => {
            if (err.name !== "AbortError") {
              console.warn("[WebRTC] Autoplay pending interaction:", err);
              setIsAudioBlocked(true);
            }
          });
      }
    };

    pc.ontrack = (event) => {
      console.log("[WebRTC P2P] ontrack received:", event.track.kind);
      syncRemoteTracks();
      event.track.onunmute = syncRemoteTracks;
      event.track.onmute = syncRemoteTracks;
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

  // Retry connecting microphone (e.g. after granting mobile browser permission or unmuting)
  async function retryConnectMic() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      showNotification({
        title: "Microphone Inaccessible Over Plain HTTP LAN",
        text: "Browsers require a secure HTTPS connection (e.g. https://hrms.infograins.com) or localhost to capture microphone audio. In production over HTTPS, mobile phone mic & speaker work 100% without any headphones.",
        icon: "warning",
      });
      return;
    }

    try {
      let newMedia: MediaStream;
      try {
        newMedia = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        newMedia = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const newAudioTrack = newMedia.getAudioTracks()[0];
      if (!newAudioTrack) {
        showNotification({
          title: "Microphone Not Detected",
          text: "Microphone not detected. Mobile phones have built-in microphones — please verify site permissions in your browser bar.",
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
        text: "Microphone was not found or access was denied. Mobile phones and laptops do NOT need headphones — tap the lock/settings icon in your browser address bar and grant Microphone permission.",
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
        meetingId: incomingCall.meetingId,
      };
      setCurrentActiveCall(call);

      if (!incomingCall.isGroupCall) {
        await initiateWebRTC(incomingCall.caller.id, false, incomingCall.type);
      }

      socket.emit("call:accept", { callSessionId: incomingCall.callSessionId });
      stopRingtone();
      setIncomingCall(null);
      startTimer();
    } catch (error) {
      console.error("Unable to access call media:", error);
      socket.emit("call:reject", { callSessionId: incomingCall.callSessionId });
      stopRingtone();
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
    stopRingtone();
    if (!incomingCall || !socket) return;
    socket.emit("call:reject", { callSessionId: incomingCall.callSessionId });
    setIncomingCall(null);
    clearCallUrlParams();
  };

  // End Active Call
  function cleanupCall() {
    stopRingtone();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    originalCameraTrackRef.current = null;
    setIsScreenSharing(false);

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
    if (call?.meetingId) {
      const token = getAuthToken();
      if (token) {
        fetch(`${getApiUrl()}/api/meetings/${call.meetingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "COMPLETED" }),
        }).catch((err) => console.error("Error marking meeting completed on call end:", err));
      }
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

  const renegotiateGroupPeer = async (targetUserId: number, pc: RTCPeerConnection) => {
    try {
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket?.emit("webrtc:offer", {
        targetUserId,
        callSessionId: activeCallRef.current?.callSessionId,
        offer,
      });
    } catch (e) {
      console.warn("[WebRTC Group] Renegotiation error:", e);
    }
  };

  const renegotiate1to1 = async (targetUserId: number, pc: RTCPeerConnection) => {
    try {
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket?.emit("webrtc:offer", {
        targetUserId,
        offer,
      });
    } catch (e) {
      console.warn("[WebRTC 1-to-1] Renegotiation error:", e);
    }
  };

  // Screen Sharing
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  const startScreenShare = async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== "function") {
      showWarningToast("Screen sharing is not supported by your current browser or device.");
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
        } as any,
        audio: false,
      });

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      // Save the current camera track so we can restore it when screen share stops
      if (localStreamRef.current) {
        const existingCamTrack = localStreamRef.current.getVideoTracks()[0];
        if (existingCamTrack) {
          originalCameraTrackRef.current = existingCamTrack;
        }
      }

      // Replace video track in 1-on-1 peer connection using robust transceiver sender lookup
      if (peerConnectionRef.current) {
        const sender = getVideoSender(peerConnectionRef.current);
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else if (localStreamRef.current) {
          peerConnectionRef.current.addTrack(screenTrack, localStreamRef.current);
          if (activeCallRef.current?.peerUserId) {
            void renegotiate1to1(activeCallRef.current.peerUserId, peerConnectionRef.current);
          }
        }
        if (activeCallRef.current?.peerUserId) {
          void renegotiate1to1(activeCallRef.current.peerUserId, peerConnectionRef.current);
        }
      }

      // Replace video track across all group peer connections using robust transceiver sender lookup
      for (const [targetUserId, pc] of groupPeerConnectionsRef.current.entries()) {
        const sender = getVideoSender(pc);
        if (sender) {
          await sender.replaceTrack(screenTrack).catch(console.warn);
        } else if (localStreamRef.current) {
          pc.addTrack(screenTrack, localStreamRef.current);
          void renegotiateGroupPeer(targetUserId, pc);
        }
        void renegotiateGroupPeer(targetUserId, pc);
      }

      // Update local stream and preview
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => localStreamRef.current?.removeTrack(t));
        localStreamRef.current.addTrack(screenTrack);
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = new MediaStream([screenTrack]);
      }

      screenStreamRef.current = displayStream;
      setIsScreenSharing(true);
      setIsCallMaximized(true);
      showSuccessToast("Screen sharing started");

      // Notify remote participants so they can re-bind the new video track
      const callSessionId = activeCallRef.current?.callSessionId;
      if (callSessionId && socket) {
        socket.emit("call:screen-share-started", { callSessionId });
      }

      // Auto-stop when user clicks the browser's native floating "Stop sharing" bar
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        console.warn("[ScreenShare] Error starting screen share:", err);
        showErrorToast(err.message || "Failed to share screen");
      }
    }
  };

  const stopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    setIsScreenSharing(false);

    // Notify remote participants that screen share has stopped
    const callSessionId = activeCallRef.current?.callSessionId;
    if (callSessionId && socket) {
      socket.emit("call:screen-share-stopped", { callSessionId });
    }

    // Restore camera track if camera was active, or fetch a fresh camera track
    let restoreTrack = originalCameraTrackRef.current;
    if (!restoreTrack || restoreTrack.readyState === "ended") {
      if (!isCamOff && activeCallRef.current?.type === "VIDEO") {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          restoreTrack = camStream.getVideoTracks()[0] || null;
        } catch (err) {
          console.warn("[ScreenShare] Could not restore camera track:", err);
        }
      }
    }

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => localStreamRef.current?.removeTrack(t));
      if (restoreTrack) {
        localStreamRef.current.addTrack(restoreTrack);
      }

      if (peerConnectionRef.current) {
        const sender = getVideoSender(peerConnectionRef.current);
        if (sender) {
          await sender.replaceTrack(restoreTrack || null).catch(console.warn);
        }
        if (activeCallRef.current?.peerUserId) {
          void renegotiate1to1(activeCallRef.current.peerUserId, peerConnectionRef.current);
        }
      }

      groupPeerConnectionsRef.current.forEach((pc, targetUserId) => {
        const sender = getVideoSender(pc);
        if (sender) {
          sender.replaceTrack(restoreTrack || null).catch(console.warn);
        }
        void renegotiateGroupPeer(targetUserId, pc);
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = restoreTrack ? localStreamRef.current : null;
      }
    }

    originalCameraTrackRef.current = null;
  };

  // Automatically unblock browser autoplay audio silently on user interaction
  const unblockAudio = async () => {
    setIsAudioBlocked(false);
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = isSpeakerOn ? 1.0 : 0.65;
        await remoteAudioRef.current.play();
      } catch (err) {
        // Silent fallback
      }
    }
    const participantAudios = document.querySelectorAll<HTMLAudioElement>(
      "audio[data-participant-audio], audio[data-participant-id]"
    );
    participantAudios.forEach((audioEl) => {
      audioEl.muted = false;
      audioEl.volume = isSpeakerOn ? 1.0 : 0.65;
      audioEl.play().catch(() => null);
    });
  };

  // Auto-listen for interaction during active call to ensure direct audio connection
  useEffect(() => {
    if (!activeCall) return;
    const onUserInteraction = () => {
      void unblockAudio();
    };
    window.addEventListener("click", onUserInteraction, { passive: true });
    window.addEventListener("touchstart", onUserInteraction, { passive: true });
    window.addEventListener("pointerdown", onUserInteraction, { passive: true });
    void unblockAudio();
    return () => {
      window.removeEventListener("click", onUserInteraction);
      window.removeEventListener("touchstart", onUserInteraction);
      window.removeEventListener("pointerdown", onUserInteraction);
    };
  }, [activeCall]);

  // Speaker / Loudspeaker Toggle (Hands-free vs Ear/Headset)
  const toggleSpeaker = async () => {
    const nextState = !isSpeakerOn;
    setIsSpeakerOn(nextState);

    // Apply volume boost to remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = nextState ? 1.0 : 0.65;
      if (typeof (remoteAudioRef.current as any).setSinkId === "function") {
        try {
          const devices = await navigator.mediaDevices?.enumerateDevices?.();
          const speaker = devices?.find(
            (d) => d.kind === "audiooutput" && (d.deviceId === "default" || d.label.toLowerCase().includes("speaker"))
          );
          if (speaker) {
            await (remoteAudioRef.current as any).setSinkId(speaker.deviceId);
          }
        } catch (e) {
          console.warn("setSinkId speaker error:", e);
        }
      }
    }

    const participantAudios = document.querySelectorAll<HTMLAudioElement>("audio[data-participant-audio]");
    participantAudios.forEach((audioEl) => {
      audioEl.volume = nextState ? 1.0 : 0.65;
    });

    showSuccessToast(nextState ? "Speaker: ON (Loudspeaker / Hands-Free)" : "Speaker: Normal (Earpiece)");
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
    playCallerTune();

    socket.emit(
      "call:initiate",
      {
        targetUserId: targetEmp.id,
        type: callType,
        channelName,
      },
      (result: { callSessionId?: number; error?: string }) => {
        if (!result?.callSessionId) {
          stopRingtone();
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
          stopRingtone();
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
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {calls.length > 0 && (
                <button
                  onClick={handleClearAllCalls}
                  className="px-3 py-2 bg-black hover:bg-[#EA580C] hover:text-white text-white font-bold rounded-xl transition-all border border-slate-200 text-xs cursor-pointer flex-1 sm:flex-initial text-center"
                >
                  Clear All Logs
                </button>
              )}
              <button
                onClick={() => setShowStartModal(true)}
                className="px-3 py-2 bg-[#171717] hover:bg-[#EA580C] text-white font-bold rounded-xl transition-all shadow-xs text-xs flex items-center justify-center gap-2 cursor-pointer flex-1 sm:flex-initial"
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
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs whitespace-nowrap border-collapse">
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

              {/* Mobile Cards View */}
              <div className="md:hidden divide-y divide-slate-100">
                {paginatedCalls.map((call) => (
                  <div key={call.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold flex items-center gap-2 text-xs">
                        {call.type === "VIDEO" ? (
                          <Video className="w-4 h-4 text-orange-500" />
                        ) : (
                          <Phone className="w-4 h-4 text-emerald-600" />
                        )}
                        <span className="text-slate-800 font-extrabold">{call.type} Call</span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${call.status === "ACTIVE"
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
                    </div>
                    <div className="text-xs space-y-1">
                      <p className="text-slate-700">
                        <span className="font-semibold text-slate-400 text-[11px]">Host:</span> {call.host.name}
                      </p>
                      <p className="text-slate-500 truncate">
                        <span className="font-semibold text-slate-400 text-[11px]">Participants:</span> {call.participants.map((p) => p.user.name).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                      <span>{new Date(call.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      <button
                        onClick={() => handleDeleteCall(call.id)}
                        className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                        title="Delete call log"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Calling History Pagination Controls */}
              {totalCalls > 0 && (
                <div className="bg-slate-50/80 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs font-medium text-slate-500">
                    Showing <span className="font-bold text-slate-800">{(safePage - 1) * pageSize + 1}</span> to{" "}
                    <span className="font-bold text-slate-800">{Math.min(safePage * pageSize, totalCalls)}</span> of{" "}
                    <span className="font-bold text-slate-800">{totalCalls}</span> call logs
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
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

                      <div className="flex flex-wrap items-center gap-1">
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
              <div className="bg-slate-900 text-white rounded-3xl max-w-sm w-full p-6 sm:p-8 shadow-2xl border border-slate-800 text-center space-y-5 animate-in zoom-in-95 duration-200">
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-25 animate-ping"></span>
                  <div className="relative w-20 h-20 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center border-2 border-orange-500/50 shadow-lg">
                    {incomingCall.type === "VIDEO" ? <Video className="w-9 h-9" /> : <Phone className="w-9 h-9" />}
                  </div>
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                    <Volume2 className="w-3 h-3 animate-pulse" />
                    <span>Ringing...</span>
                  </div>
                  <h3 className="text-lg font-black text-white truncate">
                    {incomingCall.conversationName || incomingCall.caller.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Incoming {incomingCall.isGroupCall ? "group " : ""}{incomingCall.type.toLowerCase()} call from <strong className="text-slate-200">{incomingCall.caller.name}</strong>
                  </p>
                </div>
                <div className="flex items-center justify-center gap-4 pt-1">
                  <button
                    onClick={handleRejectIncomingCall}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-700 active:scale-95 text-white transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                    title="Decline"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>Decline</span>
                  </button>
                  <button
                    onClick={handleAcceptIncomingCall}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                    title="Answer"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Answer</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Always-mounted audio element for remote audio */}
          <audio
            ref={remoteAudioRef}
            data-remote-audio="true"
            autoPlay
            playsInline
            style={{ position: "fixed", width: "1px", height: "1px", opacity: 0.01, pointerEvents: "none" }}
          />

          {/* Always-mounted persistent audio bridge for all group and meeting participants */}
          <RemoteAudioBridge
            participants={remoteParticipants}
            isSpeakerOn={isSpeakerOn}
            onAudioBlocked={() => setIsAudioBlocked(true)}
          />

          {/* Active WebRTC Call Screen Overlay */}
          {activeCall && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-2 sm:p-4 overflow-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              onClick={unblockAudio}
              onTouchStart={unblockAudio}
            >

              <div className={`bg-slate-900 text-white shadow-2xl border border-slate-700/60 flex flex-col overflow-hidden transition-all duration-200 ${isCallMaximized
                ? "fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none p-2 sm:p-4 z-50 bg-slate-950 flex flex-col"
                : "h-[88vh] sm:h-[92vh] max-w-6xl w-full rounded-2xl sm:rounded-3xl p-3 sm:p-5 flex flex-col"
                }`}
                style={{ boxShadow: "0 0 60px rgba(239,68,68,0.15), 0 25px 50px rgba(0,0,0,0.8)" }}
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 truncate">
                      {activeCall.type === "VIDEO" ? (
                        <Video className="w-5 h-5 text-orange-400 shrink-0" />
                      ) : (
                        <Mic className="w-5 h-5 text-orange-400 shrink-0" />
                      )}
                      <span className="truncate">{activeCall.isGroupCall ? `Group Call — ${activeCall.targetName}` : `Call with ${activeCall.targetName}`}</span>
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-block w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                      <p className="text-xs text-emerald-400 font-mono font-bold">
                        {formatTime(callDuration)}
                      </p>
                      <span className="text-[10px] text-slate-400">•</span>
                      <span className="text-[11px] font-semibold text-orange-400 flex items-center gap-1">
                        {isSpeakerOn ? <Volume2 className="w-3.5 h-3.5" /> : <Volume1 className="w-3.5 h-3.5" />}
                        {isSpeakerOn ? "Speaker: ON (Hands-free)" : "Speaker: Normal"}
                      </span>
                      {isScreenSharing && (
                        <>
                          <span className="text-[10px] text-slate-400">•</span>
                          <span className="text-[11px] font-bold text-slate-200 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-600 flex items-center gap-1">
                            <ScreenShare className="w-3.5 h-3.5 text-slate-300" />
                            Sharing Screen
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Top-right action buttons */}
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    {/* Full View / Maximize Toggle */}
                    <button
                      onClick={() => setIsCallMaximized(!isCallMaximized)}
                      className="px-3 sm:px-3.5 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-md"
                      title={isCallMaximized ? "Exit Full View" : "Full View Screen"}
                    >
                      {isCallMaximized ? <Minimize2 className="w-4 h-4 text-orange-400" /> : <Maximize2 className="w-4 h-4 text-orange-400" />}
                      <span className="hidden xs:inline">{isCallMaximized ? "Exit Full View" : "Full View"}</span>
                    </button>

                    <button
                      onClick={() => setShowAddMemberModal(true)}
                      className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center gap-1.5 sm:gap-2 cursor-pointer shadow-md"
                      title="Add Member to Call"
                    >
                      <UserPlus className="w-4 h-4 text-orange-400" />
                      <span className="hidden xs:inline">Add Member</span>
                    </button>
                    <button
                      onClick={endWebRTCCall}
                      className="px-3.5 sm:px-5 py-2 sm:py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-extrabold text-xs rounded-xl transition-all shadow-lg flex items-center gap-1.5 sm:gap-2 cursor-pointer"
                      style={{ boxShadow: "0 0 20px rgba(239,68,68,0.5)" }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                      </svg>
                      <span>End Call</span>
                    </button>
                  </div>
                </div>

                {/* Listen-Only Notification Banner */}
                {hasNoMic && (
                  <div className="mb-3 px-3.5 py-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-300">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-orange-400 shrink-0" />
                      <span><strong>Listen-Only Mode:</strong> Phone microphone inactive. You can hear all voice on speakerphone. Grant browser mic permission or tap Connect Mic to speak.</span>
                    </div>
                    <button
                      onClick={retryConnectMic}
                      className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-black rounded-lg text-[10px] transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-sm"
                    >
                      <RefreshCw className="w-3 h-3" /> Connect Mic
                    </button>
                  </div>
                )}

                {/* Video / Audio Streams Display */}
                <div className="flex-1 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800/80 relative flex flex-col min-h-0 w-full">
                  {activeCall.isGroupCall ? (
                    (() => {
                      const liveVideoParticipant = remoteParticipants.find(p => p.stream?.getVideoTracks().some(t => t.readyState !== "ended" && t.enabled));
                      const effectiveFocusId = focusedParticipantId !== null
                        ? focusedParticipantId
                        : (liveVideoParticipant ? liveVideoParticipant.userId : (isScreenSharing ? "local" : null));

                      const focusedParticipant = typeof effectiveFocusId === "number"
                        ? remoteParticipants.find(p => p.userId === effectiveFocusId)
                        : null;
                      const focusedEmployee = typeof effectiveFocusId === "number"
                        ? employees.find((e) => e.id === effectiveFocusId)
                        : null;

                      if (effectiveFocusId && (focusedParticipant || effectiveFocusId === "local")) {
                        return (
                          <div className="flex-1 flex flex-col h-full w-full min-h-0 relative">
                            {/* Main Stage View */}
                            <div className="flex-1 relative w-full h-full min-h-0 bg-black flex items-center justify-center overflow-hidden">
                              {effectiveFocusId === "local" ? (
                                <video
                                  ref={localVideoRef}
                                  autoPlay
                                  playsInline
                                  muted
                                  className="w-full h-full object-contain bg-black"
                                />
                              ) : focusedParticipant ? (
                                <RemoteParticipantMedia
                                  participant={focusedParticipant}
                                  name={focusedEmployee?.name || `Participant #${focusedParticipant.userId}`}
                                  type={activeCall.type}
                                  isSpeakerOn={isSpeakerOn}
                                  onAudioBlocked={() => setIsAudioBlocked(true)}
                                  isFocused={true}
                                  employee={focusedEmployee || undefined}
                                  onViewProfile={() => {
                                    if (focusedEmployee) setSelectedProfileUser(focusedEmployee);
                                  }}
                                />
                              ) : null}

                              {/* Stage Badge & Grid Toggle & Profile */}
                              <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 z-10">
                                <span className="px-2.5 py-1 bg-slate-900/90 border border-slate-700/80 text-white text-[11px] font-bold rounded-lg backdrop-blur-xs flex items-center gap-1.5 shadow-md">
                                  <span>🖥️</span>
                                  <span>
                                    {effectiveFocusId === "local"
                                      ? "Your Presentation (Full View Stage)"
                                      : `${focusedEmployee?.name || "Participant"}'s Screen`}
                                  </span>
                                </span>
                                {focusedEmployee && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedProfileUser(focusedEmployee)}
                                    className="px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-bold rounded-lg border border-slate-700 transition-all cursor-pointer flex items-center gap-1 shadow-md"
                                    title="View User Profile"
                                  >
                                    <User className="w-3.5 h-3.5 text-orange-400" />
                                    <span>Profile</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setFocusedParticipantId(null)}
                                  className="px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-bold rounded-lg border border-slate-700 transition-all cursor-pointer flex items-center gap-1 shadow-md"
                                  title="Switch to Equal Grid View"
                                >
                                  <Grid className="w-3.5 h-3.5" />
                                  <span>Grid View</span>
                                </button>
                              </div>
                            </div>

                            {/* Bottom Participant Filmstrip Dock */}
                            <div className="h-28 sm:h-32 bg-slate-900/95 border-t border-slate-800 flex items-center gap-2.5 px-3 overflow-x-auto shrink-0 [scrollbar-width:thin]">
                              {/* Local Preview in Dock */}
                              <div
                                onClick={() => setFocusedParticipantId(effectiveFocusId === "local" ? null : "local")}
                                className={`h-24 w-36 sm:h-28 sm:w-44 bg-slate-950 border-2 rounded-xl overflow-hidden shrink-0 relative cursor-pointer transition-all ${effectiveFocusId === "local" ? "border-orange-500 ring-2 ring-orange-500/40" : "border-slate-700 hover:border-slate-500"
                                  }`}
                                title="Click to view your camera/screen on Main Stage"
                              >
                                <video
                                  ref={localVideoRef}
                                  autoPlay
                                  playsInline
                                  muted
                                  className="w-full h-full object-contain bg-black"
                                />
                                <span className="absolute bottom-1 left-1.5 bg-slate-900/80 text-[10px] font-bold text-white px-1.5 py-0.5 rounded">
                                  {isScreenSharing ? "Your Screen" : "You"}
                                </span>
                              </div>

                              {/* Remote Participants in Dock */}
                              {remoteParticipants.map((participant) => {
                                const emp = employees.find((e) => e.id === participant.userId);
                                return (
                                  <div
                                    key={participant.userId}
                                    onClick={() => setFocusedParticipantId(effectiveFocusId === participant.userId ? null : participant.userId)}
                                    className={`h-24 w-36 sm:h-28 sm:w-44 bg-slate-950 border-2 rounded-xl overflow-hidden shrink-0 relative cursor-pointer transition-all ${effectiveFocusId === participant.userId ? "border-orange-500 ring-2 ring-orange-500/40" : "border-slate-700 hover:border-slate-500"
                                      }`}
                                    title="Click to view on Main Stage in Full View"
                                  >
                                    <RemoteParticipantMedia
                                      participant={participant}
                                      name={emp?.name || `Employee #${participant.userId}`}
                                      type={activeCall.type}
                                      isSpeakerOn={isSpeakerOn}
                                      onAudioBlocked={() => setIsAudioBlocked(true)}
                                      onFocus={() => setFocusedParticipantId(participant.userId)}
                                      isFocused={effectiveFocusId === participant.userId}
                                      isThumbnail={true}
                                      employee={emp}
                                      onViewProfile={() => {
                                        if (emp) setSelectedProfileUser(emp);
                                      }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="grid h-full w-full min-h-0 flex-1 grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 p-2 sm:p-3 overflow-y-auto">
                          {remoteParticipants.map((participant) => {
                            const emp = employees.find((employee) => employee.id === participant.userId);
                            return (
                              <RemoteParticipantMedia
                                key={participant.userId}
                                participant={participant}
                                name={emp?.name || `Employee #${participant.userId}`}
                                type={activeCall.type}
                                isSpeakerOn={isSpeakerOn}
                                onAudioBlocked={() => setIsAudioBlocked(true)}
                                onFocus={() => setFocusedParticipantId(participant.userId)}
                                employee={emp}
                                onViewProfile={() => {
                                  if (emp) setSelectedProfileUser(emp);
                                }}
                              />
                            );
                          })}
                          {remoteParticipants.length === 0 && (
                            <div className="col-span-full flex flex-col items-center justify-center gap-3 text-sm text-slate-400 py-12">
                              <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500 animate-pulse">
                                <Users className="w-7 h-7" />
                              </div>
                              <p>Waiting for group members to join...</p>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    /* 1-on-1 Call Stage */
                    <div className="flex-1 h-full w-full min-h-0 relative flex items-center justify-center bg-black overflow-hidden">
                      {/* Full View stage button */}
                      <button
                        type="button"
                        onClick={() => setIsCallMaximized(!isCallMaximized)}
                        className="absolute top-3 right-3 px-3 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-bold rounded-lg border border-slate-700/80 backdrop-blur-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-lg z-30"
                        title={isCallMaximized ? "Exit Full View" : "Full View Screen"}
                      >
                        {isCallMaximized ? <Minimize2 className="w-3.5 h-3.5 text-orange-400" /> : <Maximize2 className="w-3.5 h-3.5 text-orange-400" />}
                        <span>{isCallMaximized ? "Exit Full View" : "Full View"}</span>
                      </button>
                      {isScreenSharing ? (
                        !swap1to1View ? (
                          <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-contain bg-black"
                          />
                        ) : (
                          <video
                            ref={remoteVideoRef}
                            muted
                            autoPlay
                            playsInline
                            className="w-full h-full object-contain bg-black"
                          />
                        )
                      ) : activeCall.type === "VIDEO" || remoteStream?.getVideoTracks().some(t => t.readyState === "live") ? (
                        !swap1to1View ? (
                          <video
                            ref={remoteVideoRef}
                            muted
                            autoPlay
                            playsInline
                            className="w-full h-full object-contain bg-black"
                          />
                        ) : (
                          <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-contain bg-black"
                          />
                        )
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

                      {/* 1-on-1 PiP Window in corner */}
                      {(activeCall.type === "VIDEO" || isScreenSharing || remoteStream?.getVideoTracks().some(t => t.readyState === "live")) && (
                        <div
                          onClick={() => setSwap1to1View(!swap1to1View)}
                          className="absolute bottom-3 right-3 w-36 h-24 sm:w-48 sm:h-32 bg-slate-900 border-2 border-slate-700 hover:border-orange-500/80 rounded-xl overflow-hidden shadow-2xl cursor-pointer transition-all z-20 group"
                          title="Click to swap views"
                        >
                          {isScreenSharing ? (
                            !swap1to1View ? (
                              <video
                                ref={remoteVideoRef}
                                muted
                                autoPlay
                                playsInline
                                className="w-full h-full object-contain bg-black"
                              />
                            ) : (
                              <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-contain bg-black"
                              />
                            )
                          ) : (
                            !swap1to1View ? (
                              <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-contain bg-black"
                              />
                            ) : (
                              <video
                                ref={remoteVideoRef}
                                muted
                                autoPlay
                                playsInline
                                className="w-full h-full object-contain bg-black"
                              />
                            )
                          )}
                          <div className="absolute bottom-1 left-2 text-[9px] font-bold text-white/80 bg-slate-900/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <span>{isScreenSharing && !swap1to1View ? activeCall.targetName : "You"}</span>
                            <span className="text-[8px] text-orange-400 group-hover:inline hidden">(Swap)</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Call Control Toolbar */}
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-800 flex flex-wrap items-center justify-center gap-2.5 sm:gap-4">
                  {/* Mute Mic / No Mic */}
                  {hasNoMic ? (
                    <button
                      onClick={retryConnectMic}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg bg-amber-500/20 border-2 border-amber-500 text-amber-400 hover:bg-amber-500/30 cursor-pointer"
                      title="No microphone active. Tap to enable phone built-in microphone."
                    >
                      <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                      <span className="text-[8px] font-bold">No Mic</span>
                    </button>
                  ) : (
                    <button
                      onClick={toggleMic}
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg ${isMicMuted
                        ? "bg-rose-600/20 border-2 border-rose-500 text-rose-400"
                        : "bg-slate-800 border-2 border-slate-700 text-slate-200 hover:bg-slate-700"
                        }`}
                      title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                      {isMicMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                      <span className="text-[8px] font-bold">{isMicMuted ? "Muted" : "Mic"}</span>
                    </button>
                  )}

                  {/* Camera Toggle — only for video */}
                  {activeCall.type === "VIDEO" && (
                    <button
                      onClick={toggleCam}
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg ${isCamOff
                        ? "bg-rose-600/20 border-2 border-rose-500 text-rose-400"
                        : "bg-slate-800 border-2 border-slate-700 text-slate-200 hover:bg-slate-700"
                        }`}
                      title={isCamOff ? "Turn Camera On" : "Turn Camera Off"}
                    >
                      {isCamOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
                      <span className="text-[8px] font-bold">{isCamOff ? "Cam Off" : "Camera"}</span>
                    </button>
                  )}

                  {/* Screen Share Toggle — only in meeting calls (not in regular chat group calls) */}
                  {Boolean(
                    activeCall.meetingId ||
                    activeCall.channelName?.startsWith("meeting-") ||
                    activeCall.channelName?.startsWith("room-") ||
                    activeCall.targetName?.toLowerCase().includes("meeting")
                  ) && (
                      <button
                        onClick={toggleScreenShare}
                        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg cursor-pointer ${isScreenSharing
                          ? "bg-slate-700 border-2 border-slate-400 text-slate-100 hover:bg-slate-600"
                          : "bg-slate-800 border-2 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-500"
                          }`}
                        title={isScreenSharing ? "Stop Sharing Screen" : "Share Your Screen"}
                      >
                        {isScreenSharing ? (
                          <ScreenShareOff className="w-4 h-4 sm:w-5 sm:h-5 text-slate-100" />
                        ) : (
                          <ScreenShare className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" />
                        )}
                        <span className="text-[8px] font-bold">
                          {isScreenSharing ? "Stop Share" : "Share"}
                        </span>
                      </button>
                    )}

                  {/* Speaker / Loudspeaker Mode Toggle */}
                  <button
                    onClick={toggleSpeaker}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg cursor-pointer ${isSpeakerOn
                      ? "bg-orange-500/20 border-2 border-orange-500 text-orange-400 hover:bg-orange-500/30"
                      : "bg-slate-800 border-2 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                    title={isSpeakerOn ? "Speaker ON (Loudspeaker / Hands-Free mode). Tap for normal earpiece." : "Speaker Normal. Tap to enable loud speakerphone."}
                  >
                    {isSpeakerOn ? <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" /> : <Volume1 className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" />}
                    <span className="text-[8px] font-bold">{isSpeakerOn ? "Speaker" : "Normal"}</span>
                  </button>

                  {/* Add Member Button in Toolbar */}
                  <button
                    onClick={() => setShowAddMemberModal(true)}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg bg-slate-800 border-2 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-orange-500/50 cursor-pointer"
                    title="Add Member to Call"
                  >
                    <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                    <span className="text-[8px] font-bold">Add</span>
                  </button>

                  {/* ============ ENHANCED END CALL BUTTON ============ */}
                  <button
                    onClick={endWebRTCCall}
                    className="relative w-16 h-12 sm:w-20 sm:h-14 rounded-2xl text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 cursor-pointer"
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
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 relative z-10" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                    </svg>
                    <span className="text-[8px] sm:text-[9px] font-extrabold relative z-10 tracking-wide">END</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* No Microphone Detected Friendly Dialog Modal */}
          {micPromptMessage && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
              <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-white">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shrink-0">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Microphone Access Notice
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {micPromptMessage}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50 text-xs text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Are headphones or a headset required?</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-normal pl-6">
                    <strong className="text-emerald-400">NO, headphones are NOT required!</strong> Mobile phones and laptops have high-quality built-in microphones and loud speakers. Both HR and employees can join, listen on speakerphone, and speak directly through the phone without any headset. Built-in Acoustic Echo Cancellation (AEC) automatically removes echo.
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
                    className="px-4 py-2.5 text-xs bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry / Connect Phone Mic
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
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                  <input
                    type="text"
                    value={addMemberSearch}
                    onChange={(e) => setAddMemberSearch(e.target.value)}
                    placeholder="Search by name or email"
                    style={{ paddingLeft: "40px" }}
                    className="w-full h-10 !pl-10 pr-3 text-xs bg-slate-800/90 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
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

          {/* Zoom-style Participant Profile Modal */}
          {selectedProfileUser && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
              <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm p-6 text-white shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => setSelectedProfileUser(null)}
                  className="absolute top-3.5 right-3.5 w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
                  title="Close Profile"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-2xl font-black text-white shadow-lg mb-3">
                    {selectedProfileUser.name.charAt(0).toUpperCase()}
                  </div>
                  <h3 className="text-base font-bold text-white">{selectedProfileUser.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedProfileUser.email}</p>

                  <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5">
                    {selectedProfileUser.role?.name && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                        {selectedProfileUser.role.name}
                      </span>
                    )}
                    {selectedProfileUser.designation?.name && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {selectedProfileUser.designation.name}
                      </span>
                    )}
                  </div>

                  <div className="w-full mt-5 pt-3.5 border-t border-slate-800 text-xs text-slate-400 space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Call Status:</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Connected
                      </span>
                    </div>
                    {remoteParticipants.some((p) => p.userId === selectedProfileUser.id && p.stream?.getVideoTracks().some((t) => t.readyState !== "ended")) && (
                      <div className="flex items-center justify-between">
                        <span>Video / Screen:</span>
                        <span className="text-orange-400 font-semibold flex items-center gap-1">
                          <Monitor className="w-3.5 h-3.5" /> Active Live Stream
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="w-full mt-5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFocusedParticipantId(selectedProfileUser.id);
                        setIsCallMaximized(true);
                        setSelectedProfileUser(null);
                      }}
                      className="flex-1 py-2 px-3 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs rounded-xl transition shadow flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Pin className="w-3.5 h-3.5" />
                      <span>Pin to Stage</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProfileUser(null)}
                      className="py-2 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs rounded-xl transition cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
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
