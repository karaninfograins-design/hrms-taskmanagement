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
  MessageSquare,
  Send,
  Crown,
  UserX,
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

// Robust helpers to manage Camera and Screen Share transceivers independently on WebRTC peer connection
// Unified Plan: Transceiver 0 = Audio, Transceiver 1 = Camera Video, Transceiver 2 = Screen Share Video
function getCameraSender(pc: RTCPeerConnection): RTCRtpSender | undefined {
  const transceivers = pc.getTransceivers();
  const camTr = transceivers.length > 1
    ? transceivers[1]
    : transceivers.find((t) => t.receiver?.track?.kind === "video" || t.sender?.track?.kind === "video");
  if (camTr) {
    if (camTr.direction === "recvonly" || camTr.direction === "inactive") {
      try { camTr.direction = "sendrecv"; } catch (e) { /* ignore */ }
    }
    return camTr.sender;
  }
  return pc.getSenders().find((s) => s.track?.kind === "video");
}

function getScreenSender(pc: RTCPeerConnection): RTCRtpSender | undefined {
  const transceivers = pc.getTransceivers();
  if (transceivers.length > 2) {
    const screenTr = transceivers[2];
    if (screenTr.direction === "recvonly" || screenTr.direction === "inactive") {
      try { screenTr.direction = "sendrecv"; } catch (e) { /* ignore */ }
    }
    return screenTr.sender;
  }
  // If transceiver 2 doesn't exist yet on this PC, add it as a dedicated video transceiver
  try {
    const screenTr = pc.addTransceiver("video", { direction: "sendrecv" });
    return screenTr.sender;
  } catch (e) {
    return undefined;
  }
}

function getVideoSender(pc: RTCPeerConnection): RTCRtpSender | undefined {
  return getCameraSender(pc);
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
  meetingOrganizerId?: number;
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
    } catch (videoErr: any) {
      if (videoErr?.name === "NotFoundError" || videoErr?.name === "DevicesNotFoundError") {
        console.info("[Media] No video camera hardware detected — joining meeting in audio mode.");
      } else if (videoErr?.name === "NotAllowedError" || videoErr?.name === "PermissionDeniedError") {
        console.info("[Media] Camera permission denied — joining meeting in audio mode.");
      } else {
        console.warn("[Media] Video camera capture skipped:", videoErr?.message || videoErr);
      }
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

    participant.stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });

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
        el.volume = isSpeakerOn ? 1.0 : 0.65;
        participant.stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        el.play().catch(console.warn);
      }
    };

    participant.stream.addEventListener("addtrack", handleTrack);
    const audioTracks = participant.stream.getAudioTracks();
    audioTracks.forEach((track) => {
      track.addEventListener("unmute", handleTrack);
    });

    return () => {
      participant.stream?.removeEventListener("addtrack", handleTrack);
      audioTracks.forEach((track) => {
        track.removeEventListener("unmute", handleTrack);
      });
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
  isStage = false,
  employee,
  onViewProfile,
  isRemoteVideoOff = false,
}: {
  participant: RemoteParticipant;
  name: string;
  type: "AUDIO" | "VIDEO";
  isSpeakerOn?: boolean;
  onAudioBlocked?: () => void;
  onFocus?: () => void;
  isFocused?: boolean;
  isThumbnail?: boolean;
  isStage?: boolean;
  employee?: Employee;
  onViewProfile?: () => void;
  isRemoteVideoOff?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // When a participant is already focused on the Main Stage, suppress mounting a duplicate <video>
  // in the bottom thumbnail dock to prevent hardware decoder contention and black screen on mobile devices
  const isSuppressedThumbnail = isThumbnail && isFocused;

  const [hasLiveVideo, setHasLiveVideo] = useState(() => {
    return Boolean(
      !isRemoteVideoOff &&
      participant.stream?.getVideoTracks().some(
        (t) => t.readyState !== "ended" && t.enabled
      )
    );
  });

  const hasAnyVideoTrack = Boolean(
    participant.stream?.getVideoTracks().some((t) => t.readyState !== "ended")
  );

  const shouldShowVideo = !isRemoteVideoOff && (hasLiveVideo || hasAnyVideoTrack || isStage);

  // Check live video track state dynamically without forcing constant re-renders
  useEffect(() => {
    const stream = participant.stream;
    if (!stream || isRemoteVideoOff) {
      setHasLiveVideo(false);
      return;
    }

    const updateLiveState = () => {
      const live = !isRemoteVideoOff && Boolean(stream.getVideoTracks().some(
        (t) => t.readyState !== "ended" && t.enabled
      ));
      setHasLiveVideo((prev) => (prev !== live ? live : prev));
    };

    updateLiveState();

    stream.addEventListener("addtrack", updateLiveState);
    stream.addEventListener("removetrack", updateLiveState);
    const vts = stream.getVideoTracks();
    vts.forEach((vt) => {
      vt.addEventListener("unmute", updateLiveState);
      vt.addEventListener("mute", updateLiveState);
      vt.addEventListener("ended", updateLiveState);
    });

    // Poll every 800ms for the first 10s to catch cases where events don't fire (common in WebRTC)
    let polls = 0;
    const pollInterval = setInterval(() => {
      updateLiveState();
      polls++;
      if (polls >= 13) clearInterval(pollInterval); // stop after ~10s
    }, 800);

    return () => {
      clearInterval(pollInterval);
      stream.removeEventListener("addtrack", updateLiveState);
      stream.removeEventListener("removetrack", updateLiveState);
      vts.forEach((vt) => {
        vt.removeEventListener("unmute", updateLiveState);
        vt.removeEventListener("mute", updateLiveState);
        vt.removeEventListener("ended", updateLiveState);
      });
    };
  }, [participant.stream, isRemoteVideoOff]);

  // Bind stream once and keep video playing smoothly without interrupting load requests
  useEffect(() => {
    if (isSuppressedThumbnail) return;
    const videoEl = videoRef.current;
    const stream = participant.stream;
    if (!videoEl || !stream) return;

    // Explicitly set mobile playback properties on DOM node
    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.playsInline = true;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }

    if (!shouldShowVideo) {
      if (!videoEl.paused) videoEl.pause();
      return;
    }

    const playVideo = () => {
      if (videoEl) {
        videoEl.muted = true;
        videoEl.defaultMuted = true;
        videoEl.playsInline = true;
        const promise = videoEl.play();
        if (promise !== undefined) {
          promise.catch((err) => {
            if (err.name !== "AbortError") {
              console.warn("[WebRTC Video] Play warning:", err);
            }
          });
        }
      }
    };

    playVideo();

    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach((vt) => {
      vt.addEventListener("unmute", playVideo);
    });

    return () => {
      videoTracks.forEach((vt) => {
        vt.removeEventListener("unmute", playVideo);
      });
    };
  }, [participant.stream, shouldShowVideo, isSuppressedThumbnail]);

  return (
    <div
      onClick={onFocus}
      className={
        isStage
          ? "relative w-full h-full bg-black flex items-center justify-center overflow-hidden"
          : `relative w-full h-full min-h-40 overflow-hidden rounded-2xl border bg-slate-950 flex items-center justify-center cursor-pointer transition-all ${isFocused ? "border-orange-500 ring-2 ring-orange-500/40" : "border-slate-800 hover:border-slate-700"
          }`
      }
      title={shouldShowVideo ? "Click to expand this presentation/video to Full View" : "Click to focus participant"}
    >
      {/* If this participant is already focused on the Main Stage, show an On Stage badge card in thumbnail dock to avoid duplicate video decoding */}
      {isSuppressedThumbnail ? (
        <div className="flex flex-col items-center justify-center p-3 select-none text-center w-full h-full bg-slate-900/90">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-base font-bold mb-1">
            {name.charAt(0).toUpperCase()}
          </div>
          <p className="text-xs font-bold text-white truncate max-w-full px-1">{name}</p>
          <span className="text-[10px] font-semibold text-orange-400 flex items-center gap-1 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            On Stage
          </span>
        </div>
      ) : (
        <>
          {/* Video element is mounted to decode incoming video stream */}
          <video
            ref={videoRef}
            muted
            autoPlay
            playsInline
            className={`h-full w-full object-contain bg-black ${shouldShowVideo ? "block" : "hidden"}`}
            onLoadedMetadata={(e) => {
              const el = e.target as HTMLVideoElement;
              el.muted = true;
              el.defaultMuted = true;
              el.playsInline = true;
              const promise = el.play();
              if (promise !== undefined) {
                promise.catch((err) => {
                  if (err.name !== "AbortError") console.warn(err);
                });
              }
            }}
          />

          {/* Audio / Avatar Placeholder when video is not active */}
          {!shouldShowVideo && (
            <div className="flex flex-col items-center justify-center p-4 select-none">
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
            </div>
          )}
        </>
      )}

      {/* Badge Overlay */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-slate-950/80 backdrop-blur-xs px-2.5 py-1 text-xs font-semibold text-white border border-slate-800/80 z-10">
        <span className="truncate max-w-[120px] sm:max-w-[180px]">{name}</span>
        {hasLiveVideo && (
          <span className="px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 text-[9px] font-bold shrink-0">
            🎥 On
          </span>
        )}
        {!hasLiveVideo && !isRemoteVideoOff && (
          <span className="px-1.5 py-0.2 rounded bg-slate-700/60 text-slate-400 text-[9px] font-bold shrink-0">
            Connecting...
          </span>
        )}
        {isRemoteVideoOff && (
          <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 text-[9px] font-bold shrink-0">
            Cam Off
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

// Zoom-Style Presentation Screen Share Component (Supports multiple simultaneous active screens)
function ScreenShareView({
  stream,
  name,
  isLocal = false,
  isFocused = false,
  onToggleFocus,
}: {
  stream: MediaStream | null;
  name: string;
  isLocal?: boolean;
  isFocused?: boolean;
  onToggleFocus?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasLiveTrack, setHasLiveTrack] = useState(() => {
    return isLocal || Boolean(stream?.getVideoTracks().some((t) => t.readyState === "live" && !t.muted));
  });

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !stream) return;

    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute("playsinline", "true");
    videoEl.setAttribute("webkit-playsinline", "true");

    const attachAndPlay = () => {
      if (!videoEl || !stream) return;
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      const isLive = isLocal || Boolean(stream.getVideoTracks().some((t) => t.readyState === "live" && !t.muted));
      setHasLiveTrack(isLive);
      videoEl.play().catch((err) => {
        if (err.name !== "AbortError") console.warn("[ScreenShareView] Play:", err);
      });
    };

    // Re-bind forces video decoder pipeline reconnection on mobile when track un-mutes
    const forceRebindOnUnmute = () => {
      if (!videoEl || !stream) return;
      videoEl.srcObject = null;
      videoEl.srcObject = stream;
      setHasLiveTrack(true);
      videoEl.play().catch(() => null);
    };

    attachAndPlay();

    const vts = stream.getVideoTracks();
    stream.addEventListener("addtrack", attachAndPlay);
    stream.addEventListener("removetrack", attachAndPlay);
    vts.forEach((vt) => {
      vt.addEventListener("unmute", forceRebindOnUnmute);
      vt.addEventListener("mute", attachAndPlay);
    });

    const watchdog = setInterval(() => {
      if (videoEl && stream) {
        const hasLive = isLocal || Boolean(stream.getVideoTracks().some((t) => t.readyState === "live" && !t.muted));
        setHasLiveTrack(hasLive);
        if (hasLive && (videoEl.paused || videoEl.currentTime === 0)) {
          if (videoEl.srcObject !== stream) {
            videoEl.srcObject = stream;
          }
          void videoEl.play().catch(() => null);
        }
      }
    }, 500);

    return () => {
      clearInterval(watchdog);
      stream.removeEventListener("addtrack", attachAndPlay);
      stream.removeEventListener("removetrack", attachAndPlay);
      vts.forEach((vt) => {
        vt.removeEventListener("unmute", forceRebindOnUnmute);
        vt.removeEventListener("mute", attachAndPlay);
      });
    };
  }, [stream, isLocal]);

  return (
    <div
      onClick={() => {
        if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(console.warn);
        }
      }}
      className="relative w-full h-full min-h-48 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center group shadow-xl cursor-pointer"
      title="Click to resume playback if paused"
    >
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        className="w-full h-full object-contain bg-black"
        onLoadedMetadata={(e) => {
          const el = e.target as HTMLVideoElement;
          el.muted = true;
          el.defaultMuted = true;
          el.playsInline = true;
          setHasLiveTrack(true);
          void el.play().catch(() => null);
        }}
        onLoadedData={() => setHasLiveTrack(true)}
        onPlaying={() => setHasLiveTrack(true)}
        onTimeUpdate={() => {
          if (videoRef.current && videoRef.current.currentTime > 0) {
            setHasLiveTrack(true);
          }
        }}
      />

      {/* Loading state before WebRTC packets arrive */}
      {!hasLiveTrack && !isLocal && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-white z-5 pointer-events-none p-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-3 animate-pulse">
            <Monitor className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-200">Connecting to {name}&apos;s screen...</p>
          <span className="text-xs text-slate-400 mt-1">Establishing high-definition video feed</span>
        </div>
      )}

      {/* Top Header Badge */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-md pointer-events-auto">
          <Monitor className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-white tracking-wide">
            {isLocal ? "Your Screen (Sharing)" : `${name}'s Screen`}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
            LIVE
          </span>
        </div>
        {onToggleFocus && (
          <button
            type="button"
            onClick={onToggleFocus}
            className="p-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl border border-slate-700/80 shadow-md pointer-events-auto transition-all cursor-pointer"
            aria-label={isFocused ? "Exit Full Screen" : "Expand to Full Screen"}
          >
            {isFocused ? <Minimize2 className="w-4 h-4 text-orange-400" /> : <Maximize2 className="w-4 h-4" />}
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

  // Clears all call-related URL params and returns cleanly to Meetings or Messenger dashboard
  const clearCallUrlParams = () => {
    const isMeeting = Boolean(
      activeCallRef.current?.meetingId ||
      activeCallRef.current?.channelName === "permanent-daily-standup" ||
      activeCallRef.current?.channelName?.startsWith("permanent-") ||
      searchParams.get("meetingId") ||
      searchParams.get("activeChannel") === "permanent-daily-standup" ||
      searchParams.get("activeChannel")?.startsWith("permanent-")
    );
    if (isMeeting) {
      router.replace("/dashboard/meetings");
    } else {
      router.replace("/dashboard/messenger/chats");
    }
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
  const [remoteVideoOffMap, setRemoteVideoOffMap] = useState<Map<number, boolean>>(new Map());
  const [screenSharingUserId, setScreenSharingUserId] = useState<number | null>(null);

  // Zoom-Style Meeting Panels & Lifecycle State
  const [showParticipantsDrawer, setShowParticipantsDrawer] = useState<boolean>(false);
  const [showChatDrawer, setShowChatDrawer] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    senderId: number;
    senderName: string;
    senderAvatar?: string | null;
    text: string;
    createdAt: string;
  }>>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [meetingEndedInfo, setMeetingEndedInfo] = useState<{
    endedByName: string;
    meetingTitle?: string;
    duration?: string;
  } | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStageVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null); // Always in DOM, plays remote audio for any call type
  const audioUnblockedRef = useRef<boolean>(false);
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
  // Canonical MediaStream per participant to prevent reload loops & AbortErrors
  const remoteStreamMapRef = useRef<Map<number, MediaStream>>(new Map());
  // Canonical MediaStreams for multi-participant screen sharing (independent from camera feeds)
  const remoteScreenMapRef = useRef<Map<number, MediaStream>>(new Map());
  // List of all user IDs currently sharing screens in this call/meeting (supports multiple simultaneous shares)
  const [activeScreenSharerIds, setActiveScreenSharerIds] = useState<number[]>([]);
  const activeScreenSharersRef = useRef<number[]>([]);
  const updateActiveScreenSharers = (updater: number[] | ((prev: number[]) => number[])) => {
    setActiveScreenSharerIds((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      activeScreenSharersRef.current = next;
      return next;
    });
  };
  // Real-time synchronization: tracks all joined member user IDs immediately from socket without needing page refresh
  const [meetingParticipantIds, setMeetingParticipantIds] = useState<number[]>([]);
  const [screenStreamsVersion, setScreenStreamsVersion] = useState<number>(0);
  const [focusedScreenSharerId, setFocusedScreenSharerId] = useState<number | "local" | null>(null);
  // Track camera off state in a ref so socket closures always read the latest value
  const isCamOffRef = useRef<boolean>(false);
  const isMicMutedRef = useRef<boolean>(false);
  const incomingCallRef = useRef<typeof incomingCall>(null);
  const pendingGroupOffersRef = useRef<Map<number, { offer: RTCSessionDescriptionInit; callSessionId?: number }>>(new Map());
  const handleAcceptIncomingCallRef = useRef<() => void>(() => { });
  const onWebRTCOfferRef = useRef<((data: { fromUserId: number; offer: RTCSessionDescriptionInit; callSessionId?: number }) => Promise<void>) | null>(null);

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

  // Keep isCamOffRef in sync so socket closures always see the latest camera state
  // Keep isCamOffRef and isMicMutedRef and incomingCallRef in sync
  useEffect(() => {
    isCamOffRef.current = isCamOff;
  }, [isCamOff]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
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
    const callerId = Number(searchParams.get("callerId") || searchParams.get("target"));
    const channelName = searchParams.get("activeChannel");
    const callerName = searchParams.get("callerName") || searchParams.get("targetName");
    if (!callSessionId || !callerId || !channelName || !callerName) return;

    const incomingData = {
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
      meetingId: searchParams.get("meetingId") ? Number(searchParams.get("meetingId")) : undefined,
    };
    setIncomingCall(incomingData);
    incomingCallRef.current = incomingData;
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("autoAccept") === "true" && incomingCall) {
      handleAcceptIncomingCallRef.current?.();
    }
  }, [incomingCall, searchParams]);

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
      if (remoteVideoRef.current.paused) {
        remoteVideoRef.current.play().catch((err) => {
          if (err.name !== "AbortError") console.warn(err);
        });
      }
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
    const isHostParam = searchParams.get("isHost") === "true";
    const organizerIdParam = searchParams.get("meetingOrganizerId");
    const meetingOrganizerId = organizerIdParam ? Number(organizerIdParam) : undefined;

    if (!socket || isIncomingCall || !channel || !session?.user) return;
    if (startedChannelRef.current === channel && activeCallRef.current?.callSessionId) return;
    startedChannelRef.current = channel;

    if (isGroupCall) {
      const isHost = isHostParam || (meetingOrganizerId ? meetingOrganizerId === session.user.id : true);
      const currentCall = activeCallRef.current;
      const resolvedSessionId = callSessionId || currentCall?.callSessionId;
      setCurrentActiveCall({
        callSessionId: resolvedSessionId,
        channelName: channel,
        targetName: groupName || "Group Call",
        type,
        isGroupCall: true,
        isHost,
        meetingId,
        meetingOrganizerId,
      });

      if (resolvedSessionId) {
        socket?.emit("call:join", { callSessionId: resolvedSessionId });
      } else {
        socket?.emit(
          "call:initiate",
          {
            type,
            channelName: channel,
          },
          (result: { callSessionId?: number; error?: string }) => {
            if (result?.error) {
              showErrorToast(result.error);
              router.replace("/dashboard/meetings");
              return;
            }
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

    const onCallAccepted = async (data: { callSessionId: number; userId: number }) => {
      startTimer();
      stopRingtone();
      // Callee is now active on the calls page! Ensure the offer is delivered to the callee
      const pc = peerConnectionRef.current;
      if (pc && activeCallRef.current?.peerUserId === data.userId) {
        if (pc.localDescription) {
          socket?.emit("webrtc:offer", {
            targetUserId: data.userId,
            offer: pc.localDescription,
            callSessionId: data.callSessionId,
          });
        } else if (pc.signalingState === "stable") {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket?.emit("webrtc:offer", {
              targetUserId: data.userId,
              offer,
              callSessionId: data.callSessionId,
            });
          } catch (e) {
            console.warn("[WebRTC 1-to-1] Failed to create offer on call:accepted:", e);
          }
        }
      }
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

    const onCallEnded = (data: { callSessionId: number; endedBy?: number; endedByName?: string; channelName?: string }) => {
      stopRingtone();
      if (activeCallRef.current?.callSessionId !== data.callSessionId) return;
      const call = activeCallRef.current;
      const durationSeconds = callDuration;
      const mins = Math.floor(durationSeconds / 60);
      const secs = durationSeconds % 60;
      const durationStr = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

      setMeetingEndedInfo({
        endedByName: data.endedByName || "The Host",
        meetingTitle: call?.targetName || "Meeting",
        duration: durationStr,
      });

      cleanupCall();
    };

    const onMeetingChatMessage = (msg: {
      id: string;
      callSessionId: number;
      senderId: number;
      senderName: string;
      senderAvatar?: string | null;
      text: string;
      createdAt: string;
    }) => {
      if (activeCallRef.current?.callSessionId !== msg.callSessionId) return;
      setChatMessages((prev) => [...prev, msg]);
      setUnreadChatCount((count) => count + 1);
    };

    const onMutedByHost = (data?: { mutedByName?: string }) => {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      setIsMicMuted(true);
      showNotification({
        title: "Microphone Muted",
        text: `You have been muted by ${data?.mutedByName || "the meeting host"}.`,
        icon: "info",
      });
    };

    const onKickedFromCall = (data?: { reason?: string; kickedByName?: string }) => {
      cleanupCall();
      showNotification({
        title: "Removed from Meeting",
        text: data?.reason || `You have been removed from the meeting by ${data?.kickedByName || "the host"}.`,
        icon: "warning",
      });
      router.push("/dashboard/meetings");
    };

    const onParticipantJoined = async ({
      callSessionId,
      participantIds,
      activeScreenSharerUserIds,
    }: {
      callSessionId: number;
      participantIds: number[];
      activeScreenSharerUserIds?: number[];
    }) => {
      let call = activeCallRef.current;
      if (!call) return;

      // Real-time synchronization: Host and participants immediately see everyone in the room
      setMeetingParticipantIds(participantIds);

      if (activeScreenSharerUserIds) {
        updateActiveScreenSharers(activeScreenSharerUserIds);
      }

      const isActuallyGroup = Boolean(
        call.isGroupCall ||
        call.channelName.startsWith("group-") ||
        call.channelName.startsWith("permanent-") ||
        call.channelName.startsWith("meeting-") ||
        call.meetingId
      );

      if (!call.callSessionId) {
        call = { ...call, callSessionId, isGroupCall: isActuallyGroup };
        setCurrentActiveCall(call);
      }

      // If active call was 1-on-1 and now explicitly has >2 participants in a group, upgrade to group call view
      if (!call.isGroupCall && isActuallyGroup && participantIds.length > 2) {
        const peerUserId = call.peerUserId;
        if (peerUserId && remoteStream) {
          setRemoteParticipants((prev) => {
            if (prev.some((p) => p.userId === peerUserId)) return prev;
            return [...prev, { userId: peerUserId, stream: remoteStream }];
          });
        }
        call = {
          ...call,
          isGroupCall: true,
          targetName: call.targetName.includes("Group")
            ? call.targetName
            : `${call.targetName} & others`,
        };
        setCurrentActiveCall(call);
      }

      startTimer();
      // Re-announce own camera state to newly joined participants so they see accurate status immediately
      if (call.callSessionId && socket) {
        socket.emit("call:video-toggle", {
          callSessionId: call.callSessionId,
          isVideoOff: isCamOffRef.current,
        });
        // If actively sharing screen, notify new joiner so they see the screen immediately
        if (screenStreamRef.current?.getVideoTracks().some((t) => t.readyState === "live")) {
          socket.emit("call:screen-share-started", {
            callSessionId: call.callSessionId,
          });
        }
      }

      if (isActuallyGroup) {
        for (const participantId of participantIds) {
          const existingPc = groupPeerConnectionsRef.current.get(participantId);
          const needsConnection =
            participantId !== session?.user?.id &&
            (!existingPc || existingPc.connectionState === "closed" || existingPc.connectionState === "failed");
          if (needsConnection) {
            if (peerConnectionRef.current && participantId === call.peerUserId) {
              continue;
            }
            // Deterministic offer creation: lower user ID initiates offer to higher user ID
            if (session?.user?.id && session.user.id < participantId) {
              await createGroupPeerConnection(participantId, true, callSessionId);
            }
          }
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

      if (call && !call.isGroupCall && (call.channelName.startsWith("group-") || call.channelName.startsWith("permanent-") || Boolean(call.meetingId))) {
        const peerUserId = call.peerUserId;
        if (peerUserId && remoteStream) {
          setRemoteParticipants((prev) => {
            if (prev.some((p) => p.userId === peerUserId)) return prev;
            return [...prev, { userId: peerUserId, stream: remoteStream }];
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
      setMeetingParticipantIds((prev) => prev.filter((id) => id !== userId));
      groupPeerConnectionsRef.current.get(userId)?.close();
      groupPeerConnectionsRef.current.delete(userId);
      pendingIceCandidatesRef.current.delete(userId);
      remoteStreamMapRef.current.delete(userId);
      remoteScreenMapRef.current.delete(userId);
      setRemoteParticipants((prev) => prev.filter((participant) => participant.userId !== userId));
      updateActiveScreenSharers((prev) => prev.filter((id) => id !== userId));
      setScreenStreamsVersion((v) => v + 1);
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
      let call = activeCallRef.current;
      const isGroup = Boolean(
        call?.isGroupCall ||
        call?.channelName.startsWith("group-") ||
        call?.channelName.startsWith("permanent-") ||
        call?.channelName.startsWith("meeting-") ||
        Boolean(call?.meetingId) ||
        groupPeerConnectionsRef.current.has(fromUserId) ||
        incomingCallRef.current?.isGroupCall
      );

      if (isGroup) {
        // If incoming call dialog is ringing and user has not answered yet, buffer the offer
        if (!call && incomingCallRef.current) {
          console.log(`[WebRTC Group] Buffering incoming offer from user ${fromUserId} until answered`);
          pendingGroupOffersRef.current.set(fromUserId, { offer, callSessionId });
          return;
        }

        if (!call) {
          const channel = searchParams.get("activeChannel") || `group-${Date.now()}`;
          const isHost = searchParams.get("isHost") === "true";
          call = {
            callSessionId,
            channelName: channel,
            targetName: searchParams.get("groupName") || "Group Call",
            type: (searchParams.get("type") as "AUDIO" | "VIDEO") || "VIDEO",
            isGroupCall: true,
            isHost,
            meetingId: searchParams.get("meetingId") ? Number(searchParams.get("meetingId")) : undefined,
          };
          setCurrentActiveCall(call);
        } else if (callSessionId && !call.callSessionId) {
          call = { ...call, callSessionId, isGroupCall: isGroup };
          setCurrentActiveCall(call);
        }
        const effectiveSessionId = callSessionId || call?.callSessionId;

        // Ensure local media is initialized before setting remote description and answering
        if (!localStreamRef.current) {
          await prepareGroupCallMedia(call?.type || "VIDEO");
        }

        const pc = await createGroupPeerConnection(fromUserId, false, effectiveSessionId);

        // Handle glare or state collision if peer connection is already in have-local-offer
        if (pc.signalingState === "have-local-offer") {
          // If our user ID is greater, rollback our local offer so we can accept remote offer
          if (session?.user?.id && session.user.id > fromUserId) {
            try {
              await pc.setLocalDescription({ type: "rollback" });
            } catch (rollbackErr) {
              console.warn("[WebRTC] Rollback error:", rollbackErr);
            }
          }
        }

        try {
          if (pc.signalingState !== "closed") {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            await flushPendingIceCandidates(fromUserId, pc);

            const currentSignalingState: string = pc.signalingState;
            if (currentSignalingState === "have-remote-offer") {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit("webrtc:answer", { targetUserId: fromUserId, answer, callSessionId: effectiveSessionId });
            }

            // Real-time synchronization: Extract screen track immediately if fromUserId is an active presenter
            if (activeScreenSharersRef.current.includes(fromUserId)) {
              const transceivers = pc.getTransceivers();
              const screenTr = transceivers.length > 2 ? transceivers[2] : transceivers.find((t, idx) => idx > 1 && t.receiver?.track?.kind === "video");
              if (screenTr?.receiver?.track && screenTr.receiver.track.readyState !== "ended") {
                screenTr.receiver.track.enabled = true;
                const bindScreen = () => {
                  if (screenTr.receiver.track && screenTr.receiver.track.readyState !== "ended") {
                    screenTr.receiver.track.enabled = true;
                    remoteScreenMapRef.current.set(fromUserId, new MediaStream([screenTr.receiver.track]));
                    setScreenStreamsVersion((v) => v + 1);
                  }
                };
                screenTr.receiver.track.addEventListener("unmute", bindScreen);
                screenTr.receiver.track.addEventListener("mute", bindScreen);
                bindScreen();
              }
            }
          }
        } catch (offerProcessErr) {
          console.warn(`[WebRTC] Failed to process offer from user ${fromUserId}:`, offerProcessErr);
        }
        return;
      }
      // P2P path: if PC isn't created yet (callee hasn't accepted), buffer the offer
      if (!peerConnectionRef.current) {
        console.log("[WebRTC] Offer arrived before PC was ready — buffering for later");
        pendingP2POfferRef.current = { fromUserId, offer };
        return;
      }
      try {
        if (peerConnectionRef.current.signalingState === "stable" || peerConnectionRef.current.signalingState === "have-local-offer") {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
          // Flush any buffered ICE candidates that arrived before this offer
          for (const c of pendingP2PIceCandidatesRef.current) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingP2PIceCandidatesRef.current = [];
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socket.emit("webrtc:answer", {
            targetUserId: fromUserId,
            answer,
            callSessionId: callSessionId || activeCallRef.current?.callSessionId,
          });
        }
      } catch (err) {
        console.warn("[WebRTC P2P] Error processing offer:", err);
      }
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
        if (pc.signalingState === "have-local-offer") {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            await flushPendingIceCandidates(fromUserId, pc);

            // Extract screen track if peer was sharing screen
            if (activeScreenSharersRef.current.includes(fromUserId)) {
              const transceivers = pc.getTransceivers();
              const screenTr = transceivers.length > 2 ? transceivers[2] : transceivers.find((t, idx) => idx > 1 && t.receiver?.track?.kind === "video");
              if (screenTr?.receiver?.track && screenTr.receiver.track.readyState !== "ended") {
                screenTr.receiver.track.enabled = true;
                const freshStream = new MediaStream([screenTr.receiver.track]);
                remoteScreenMapRef.current.set(fromUserId, freshStream);
                setScreenStreamsVersion((v) => v + 1);
              }
            }
          } catch (err) {
            console.warn("[WebRTC] Error setting group answer:", err);
          }
        }
        return;
      }
      if (peerConnectionRef.current) {
        if (peerConnectionRef.current.signalingState === "have-local-offer") {
          try {
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
          } catch (err) {
            console.warn("[WebRTC P2P] Error setting remote answer:", err);
          }
        }
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
      const isGroup = Boolean(
        groupPeerConnectionsRef.current.has(fromUserId) ||
        pendingGroupPeerConnectionsRef.current.has(fromUserId) ||
        (activeCallRef.current?.isGroupCall && activeCallRef.current?.peerUserId !== fromUserId)
      );

      if (isGroup) {
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
    onWebRTCOfferRef.current = onWebRTCOffer;
    socket.on("webrtc:answer", onWebRTCAnswer);
    socket.on("webrtc:ice-candidate", onWebRTCIceCandidate);

    // Multi-Participant Screen-Share signalling: tracks active presenters dynamically
    const onScreenShareStarted = ({
      callSessionId,
      fromUserId,
      activeScreenSharerUserIds,
    }: {
      callSessionId: number;
      fromUserId: number;
      activeScreenSharerUserIds?: number[];
    }) => {
      const call = activeCallRef.current;
      if (!call || call.callSessionId !== callSessionId) return;

      updateActiveScreenSharers(activeScreenSharerUserIds || Array.from(new Set([...activeScreenSharersRef.current, fromUserId])));
      setScreenStreamsVersion((v) => v + 1);
      setIsCallMaximized(true);

      const pc = groupPeerConnectionsRef.current.get(fromUserId) || (call.peerUserId === fromUserId ? peerConnectionRef.current : null);
      if (pc) {
        const transceivers = pc.getTransceivers();
        const screenTr = transceivers.length > 2 ? transceivers[2] : transceivers.find((t, idx) => idx > 1 && t.receiver?.track?.kind === "video");
        if (screenTr?.receiver?.track && screenTr.receiver.track.readyState !== "ended") {
          screenTr.receiver.track.enabled = true;
          const bindScreen = () => {
            if (screenTr.receiver.track && screenTr.receiver.track.readyState !== "ended") {
              screenTr.receiver.track.enabled = true;
              remoteScreenMapRef.current.set(fromUserId, new MediaStream([screenTr.receiver.track]));
              setScreenStreamsVersion((v) => v + 1);
            }
          };
          screenTr.receiver.track.addEventListener("unmute", bindScreen);
          screenTr.receiver.track.addEventListener("mute", bindScreen);
          bindScreen();
        }
      }
    };

    const onScreenShareStopped = ({
      callSessionId,
      fromUserId,
      activeScreenSharerUserIds,
    }: {
      callSessionId: number;
      fromUserId: number;
      activeScreenSharerUserIds?: number[];
    }) => {
      const call = activeCallRef.current;
      if (!call || call.callSessionId !== callSessionId) return;

      updateActiveScreenSharers(activeScreenSharerUserIds || activeScreenSharersRef.current.filter((id) => id !== fromUserId));
      remoteScreenMapRef.current.delete(fromUserId);
      setFocusedScreenSharerId((cur) => (cur === fromUserId ? null : cur));
      setScreenStreamsVersion((v) => v + 1);
    };

    const onActiveScreenShares = ({
      callSessionId,
      sharerUserIds,
    }: {
      callSessionId: number;
      sharerUserIds: number[];
    }) => {
      const call = activeCallRef.current;
      if (!call || call.callSessionId !== callSessionId) return;
      updateActiveScreenSharers(sharerUserIds);
      if (sharerUserIds.length > 0) {
        setIsCallMaximized(true);
      }

      // Populate remoteScreenMapRef with screen tracks from transceivers of active sharers
      sharerUserIds.forEach((sharerId) => {
        if (sharerId === session?.user?.id) return;
        const pc = groupPeerConnectionsRef.current.get(sharerId) || (call.peerUserId === sharerId ? peerConnectionRef.current : null);
        if (pc) {
          const transceivers = pc.getTransceivers();
          const screenTr = transceivers.length > 2 ? transceivers[2] : transceivers.find((t, idx) => idx > 1 && t.receiver?.track?.kind === "video");
          if (screenTr?.receiver?.track && screenTr.receiver.track.readyState !== "ended") {
            screenTr.receiver.track.enabled = true;
            const bindScreen = () => {
              if (screenTr.receiver.track && screenTr.receiver.track.readyState !== "ended") {
                screenTr.receiver.track.enabled = true;
                remoteScreenMapRef.current.set(sharerId, new MediaStream([screenTr.receiver.track]));
                setScreenStreamsVersion((v) => v + 1);
              }
            };
            screenTr.receiver.track.addEventListener("unmute", bindScreen);
            screenTr.receiver.track.addEventListener("mute", bindScreen);
            bindScreen();
          }
        }
      });
      setScreenStreamsVersion((v) => v + 1);
    };

    // Camera / Video Toggle: real-time notification when a peer turns camera off or on
    const onVideoToggle = ({ callSessionId, fromUserId, isVideoOff }: { callSessionId: number; fromUserId: number; isVideoOff: boolean }) => {
      const call = activeCallRef.current;
      if (!call || call.callSessionId !== callSessionId) return;
      setRemoteVideoOffMap((prev) => new Map(prev).set(fromUserId, isVideoOff));
    };

    socket.on("call:screen-share-started", onScreenShareStarted);
    socket.on("call:screen-share-stopped", onScreenShareStopped);
    socket.on("call:active-screen-shares", onActiveScreenShares);
    socket.on("call:video-toggle", onVideoToggle);
    socket.on("meeting:chat-message", onMeetingChatMessage);
    socket.on("call:muted-by-host", onMutedByHost);
    socket.on("call:kicked", onKickedFromCall);

    if (activeCallRef.current?.callSessionId) {
      if (activeCallRef.current.isGroupCall) {
        socket.emit("call:join", { callSessionId: activeCallRef.current.callSessionId });
      }
      socket.emit("call:get-active-screen-shares", { callSessionId: activeCallRef.current.callSessionId });
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
      socket.off("call:active-screen-shares", onActiveScreenShares);
      socket.off("call:video-toggle", onVideoToggle);
      socket.off("meeting:chat-message", onMeetingChatMessage);
      socket.off("call:muted-by-host", onMutedByHost);
      socket.off("call:kicked", onKickedFromCall);
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
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    if (localVideoRef.current && type === "VIDEO") {
      const preview = localStreamRef.current;
      if (localVideoRef.current.srcObject !== preview) {
        localVideoRef.current.srcObject = preview;
      }
      if (localVideoRef.current.paused) {
        localVideoRef.current.play().catch(() => null);
      }
      if (localStageVideoRef.current) {
        if (localStageVideoRef.current.srcObject !== preview) {
          localStageVideoRef.current.srcObject = preview;
        }
        if (localStageVideoRef.current.paused) {
          localStageVideoRef.current.play().catch(() => null);
        }
      }
    }

    // Attach newly acquired local tracks to any existing peer connections
    // This handles the race condition where PC was created before media was ready
    groupPeerConnectionsRef.current.forEach((pc) => {
      if (!localStreamRef.current) return;
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      const videoTrack = localStreamRef.current.getVideoTracks()[0];

      const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio" || s.track === null && pc.getTransceivers().some(t => t.sender === s));
      const existingAudioSender = pc.getSenders().find((s) => s.track?.kind === "audio");
      const existingVideoSender = pc.getSenders().find((s) => s.track?.kind === "video");

      if (audioTrack) {
        const audioSenders = pc.getSenders().filter((s) => s.track?.kind === "audio");
        if (audioSenders.length > 0) {
          audioSenders.forEach((s) => {
            if (s.track?.id !== audioTrack.id) {
              s.replaceTrack(audioTrack).catch(console.warn);
            }
          });
        } else {
          // Check if audio transceiver exists (from addTransceiver fallback)
          const audioTransceiver = pc.getTransceivers().find(
            (t) => t.receiver?.track?.kind === "audio" || (t.sender.track === null && t.mid === "0")
          );
          if (audioTransceiver) {
            audioTransceiver.sender.replaceTrack(audioTrack).catch(console.warn);
          } else {
            pc.addTrack(audioTrack, localStreamRef.current);
          }
        }
      }

      if (videoTrack) {
        const videoSenders = pc.getSenders().filter((s) => s.track?.kind === "video");
        if (videoSenders.length > 0) {
          videoSenders.forEach((s) => {
            if (s.track?.id !== videoTrack.id) {
              s.replaceTrack(videoTrack).catch(console.warn);
            }
          });
        } else {
          const videoTransceiver = pc.getTransceivers().find(
            (t) => t.receiver?.track?.kind === "video" || (t.sender.track === null && t.mid === "1")
          );
          if (videoTransceiver) {
            videoTransceiver.sender.replaceTrack(videoTrack).catch(console.warn);
          } else {
            pc.addTrack(videoTrack, localStreamRef.current);
          }
        }
      }
    });
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

  async function createGroupPeerConnection(targetUserId: number, isCaller: boolean, callSessionIdOverride?: number) {
    const existingConnection = groupPeerConnectionsRef.current.get(targetUserId);
    if (existingConnection) return existingConnection;
    const pendingConnection = pendingGroupPeerConnectionsRef.current.get(targetUserId);
    if (pendingConnection) return pendingConnection;

    const setupConnection = async () => {
      const call = activeCallRef.current;
      const effectiveSessionId = callSessionIdOverride || call?.callSessionId;

      // Ensure local media is ready BEFORE configuring peer connection tracks & creating offers
      if (!localStreamRef.current) {
        await prepareGroupCallMedia(call?.type || "VIDEO");
      }

      const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIGURATION);
      groupPeerConnectionsRef.current.set(targetUserId, pc);

      // Strict Unified Plan SDP m-lines:
      // m=0: Audio
      // m=1: Camera Video
      // m=2: Screen Share Video

      // 1. Audio Transceiver (m=0)
      const localAudioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (localAudioTrack) {
        localAudioTrack.enabled = !isMicMutedRef.current;
        try {
          pc.addTrack(localAudioTrack, localStreamRef.current!);
        } catch (e) {
          console.warn("addTrack audio error:", e);
        }
      } else {
        try {
          pc.addTransceiver("audio", { direction: "sendrecv" });
        } catch (e) {
          console.warn("addTransceiver audio error:", e);
        }
      }

      // 2. Camera Video Transceiver (m=1)
      const localCameraTrack = localStreamRef.current?.getVideoTracks().find((t) => t !== screenStreamRef.current?.getVideoTracks()[0]);
      if (localCameraTrack && !isCamOffRef.current) {
        try {
          pc.addTrack(localCameraTrack, localStreamRef.current!);
        } catch (e) {
          console.warn("addTrack camera error:", e);
        }
      } else {
        try {
          pc.addTransceiver("video", { direction: "sendrecv" });
        } catch (e) {
          console.warn("addTransceiver camera error:", e);
        }
      }

      // 3. Screen Share Video Transceiver (m=2)
      const activeScreenTrack = screenStreamRef.current?.getVideoTracks().find((t) => t.readyState === "live");
      if (activeScreenTrack) {
        try {
          pc.addTrack(activeScreenTrack, screenStreamRef.current!);
        } catch (e) {
          console.warn("addTrack screen error:", e);
        }
      } else {
        try {
          pc.addTransceiver("video", { direction: "sendrecv" });
        } catch (e) {
          console.warn("addTransceiver screen error:", e);
        }
      }

      // Proactively bind unmute listener on receiver track of transceiver 2 so packets are caught immediately
      const initialTransceivers = pc.getTransceivers();
      if (initialTransceivers.length > 2) {
        const screenTr = initialTransceivers[2];
        if (screenTr?.receiver?.track) {
          const syncScreenTrack = () => {
            if (screenTr.receiver.track && screenTr.receiver.track.readyState !== "ended") {
              screenTr.receiver.track.enabled = true;
              remoteScreenMapRef.current.set(targetUserId, new MediaStream([screenTr.receiver.track]));
              setScreenStreamsVersion((v) => v + 1);
            }
          };
          screenTr.receiver.track.addEventListener("unmute", syncScreenTrack);
          screenTr.receiver.track.addEventListener("mute", syncScreenTrack);
        }
      }

      pc.ontrack = (event) => {
        const transceivers = pc.getTransceivers();
        const trIndex = transceivers.indexOf(event.transceiver);
        const isScreen = (trIndex >= 2 || (trIndex > 1 && event.track.kind === "video")) && event.track.kind === "video";

        if (isScreen) {
          event.track.enabled = true;
          const syncScreen = () => {
            if (event.track && event.track.readyState !== "ended") {
              event.track.enabled = true;
              remoteScreenMapRef.current.set(targetUserId, new MediaStream([event.track]));
              setScreenStreamsVersion((v) => v + 1);
            }
          };
          event.track.addEventListener("unmute", syncScreen);
          event.track.addEventListener("mute", syncScreen);
          event.track.onunmute = syncScreen;
          event.track.onmute = syncScreen;
          event.track.onended = () => {
            remoteScreenMapRef.current.delete(targetUserId);
            setScreenStreamsVersion((v) => v + 1);
          };
          syncScreen();
          return;
        }

        // Camera Video or Audio (Transceiver 0 = Audio, Transceiver 1 = Camera)
        let canonicalStream = remoteStreamMapRef.current.get(targetUserId);
        if (!canonicalStream) {
          canonicalStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream();
          remoteStreamMapRef.current.set(targetUserId, canonicalStream);
        }

        // Only add audio (m=0) and camera (m=1) to canonicalStream - never transceiver 2
        if (trIndex < 2) {
          if (event.track && !canonicalStream.getTracks().some((t) => t.id === event.track.id)) {
            canonicalStream.addTrack(event.track);
          }
        }

        pc.getReceivers().forEach((receiver) => {
          if (receiver.track && receiver.track.readyState !== "ended") {
            const rTrIndex = transceivers.findIndex((tr) => tr.receiver === receiver);
            if (rTrIndex !== 2) {
              if (!canonicalStream.getTracks().some((t) => t.id === receiver.track.id)) {
                canonicalStream.addTrack(receiver.track);
              }
            }
          }
        });

        canonicalStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        canonicalStream.getVideoTracks().forEach((track) => {
          track.enabled = true;
        });

        // Create a refreshed MediaStream reference with all tracks so React re-renders cleanly
        const freshStream = new MediaStream(canonicalStream.getTracks());
        remoteStreamMapRef.current.set(targetUserId, freshStream);

        setRemoteParticipants((prev) => [
          ...prev.filter((participant) => participant.userId !== targetUserId),
          { userId: targetUserId, stream: freshStream },
        ]);

        if (freshStream.getVideoTracks().some((t) => t.readyState !== "ended" && t.enabled)) {
          setFocusedParticipantId(targetUserId);
          setIsCallMaximized(true);
        }
      };

      pc.onicecandidate = (event) => {
        const curSessionId = callSessionIdOverride || activeCallRef.current?.callSessionId || effectiveSessionId;
        if (event.candidate) {
          socket?.emit("webrtc:ice-candidate", {
            targetUserId,
            callSessionId: curSessionId,
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
        // Caller: create and send the offer ONLY if the connection is still in stable state!
        try {
          if (pc.signalingState === "stable") {
            const offer = await pc.createOffer();
            if (pc.signalingState === "stable") {
              await pc.setLocalDescription(offer);
              socket?.emit("webrtc:offer", {
                targetUserId,
                offer,
                callSessionId: effectiveSessionId || activeCallRef.current?.callSessionId,
              });
            } else {
              console.log(`[WebRTC Group] Remote offer arrived while preparing local offer for peer ${targetUserId} (signalingState=${pc.signalingState}). Yielding to remote offer.`);
            }
          }
        } catch (error) {
          console.warn("[WebRTC Group] Notice during offer negotiation with peer", targetUserId, error);
        }
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

    // Strict SDP m-lines ordering: Audio first (m=0), Video second (m=1)
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = true;
      pc.addTrack(audioTrack, stream);
    } else {
      try {
        pc.addTransceiver("audio", { direction: "sendrecv" });
      } catch (e) {
        console.warn("addTransceiver audio error:", e);
      }
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      pc.addTrack(videoTrack, stream);
    } else {
      try {
        pc.addTransceiver("video", { direction: "sendrecv" });
      } catch (e) {
        console.warn("addTransceiver video error:", e);
      }
    }

    // 3. Screen Share Video Transceiver (m=2)
    try {
      pc.addTransceiver("video", { direction: "sendrecv" });
    } catch (e) {
      console.warn("addTransceiver screen video error:", e);
    }

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
      const transceivers = pc.getTransceivers();
      const trIndex = transceivers.indexOf(event.transceiver);
      const isPresenter = activeScreenSharersRef.current.includes(targetUserId);
      if (isPresenter && (trIndex === 2 || (trIndex > 1 && event.track.kind === "video"))) {
        let screenStream = remoteScreenMapRef.current.get(targetUserId);
        if (!screenStream) screenStream = new MediaStream();
        if (event.track && !screenStream.getTracks().some((t) => t.id === event.track.id)) {
          event.track.enabled = true;
          screenStream.addTrack(event.track);
        }
        remoteScreenMapRef.current.set(targetUserId, new MediaStream(screenStream.getTracks()));
        setScreenStreamsVersion((v) => v + 1);
        setIsCallMaximized(true);
        return;
      }
      if (event.track) {
        event.track.enabled = true;
      }
      syncRemoteTracks();
      event.track.onunmute = syncRemoteTracks;
      event.track.onmute = syncRemoteTracks;
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("webrtc:ice-candidate", {
          targetUserId,
          candidate: event.candidate,
          callSessionId: activeCallRef.current?.callSessionId,
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
        socket?.emit("webrtc:offer", {
          targetUserId,
          offer,
          callSessionId: activeCallRef.current?.callSessionId,
        });
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

      if (incomingCall.isGroupCall) {
        socket.emit("call:join", { callSessionId: incomingCall.callSessionId });
      } else {
        await initiateWebRTC(incomingCall.caller.id, false, incomingCall.type);
      }

      socket.emit("call:accept", { callSessionId: incomingCall.callSessionId });
      stopRingtone();
      setIncomingCall(null);
      startTimer();

      // Drain any buffered P2P offer (for 1-on-1 calls)
      if (pendingP2POfferRef.current && peerConnectionRef.current) {
        const { fromUserId, offer } = pendingP2POfferRef.current;
        pendingP2POfferRef.current = null;
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
          for (const c of pendingP2PIceCandidatesRef.current) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingP2PIceCandidatesRef.current = [];
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socket.emit("webrtc:answer", {
            targetUserId: fromUserId,
            answer,
            callSessionId: incomingCall.callSessionId,
          });
        } catch (err) {
          console.warn("[WebRTC P2P] Error setting remote description from buffered offer:", err);
        }
      }

      // Drain any buffered offers that arrived while call was ringing
      const pendingOffers = Array.from(pendingGroupOffersRef.current.entries());
      pendingGroupOffersRef.current.clear();
      for (const [peerId, pending] of pendingOffers) {
        if (onWebRTCOfferRef.current) {
          void onWebRTCOfferRef.current({ fromUserId: peerId, offer: pending.offer, callSessionId: pending.callSessionId });
        }
      }
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
  handleAcceptIncomingCallRef.current = handleAcceptIncomingCall;

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
    remoteStreamMapRef.current.clear();
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (localStageVideoRef.current) localStageVideoRef.current.srcObject = null;
    setRemoteParticipants([]);
    setMeetingParticipantIds([]);
    updateActiveScreenSharers([]);
    setRemoteVideoOffMap(new Map());
    setScreenSharingUserId(null);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setCurrentActiveCall(null);
    audioUnblockedRef.current = false;
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

  // Send real-time chat message to all attendees in current meeting
  const sendMeetingChatMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || !socket || !activeCall?.callSessionId) return;
    socket.emit("meeting:chat-send", {
      callSessionId: activeCall.callSessionId,
      text: chatInput.trim(),
    });
    setChatInput("");
  };

  // Only leave the call session without terminating it for other participants (Zoom-style Leave)
  function leaveCall() {
    const call = activeCallRef.current;
    if (socket && call?.callSessionId) {
      socket.emit("call:leave", { callSessionId: call.callSessionId });
    }
    cleanupCall();
  }

  function endWebRTCCall() {
    const call = activeCallRef.current;
    if (socket && call?.callSessionId) {
      socket.emit("call:end", { callSessionId: call.callSessionId });
    }
    const isPermanent =
      call?.channelName === "permanent-daily-standup" ||
      call?.channelName?.startsWith("permanent-") ||
      searchParams.get("activeChannel")?.includes("permanent");

    if (call?.meetingId && !isPermanent) {
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

  // Smart handler: Non-host participants only leave; Hosts get choice to Leave or End for All
  async function handleHangupClick() {
    const call = activeCallRef.current;
    const isGroupOrMeeting = Boolean(
      call?.isGroupCall ||
      call?.meetingId ||
      searchParams.get("groupCall") === "true" ||
      call?.channelName?.includes("permanent") ||
      call?.channelName?.startsWith("room-") ||
      call?.channelName?.startsWith("meeting-")
    );

    // Direct 1-on-1 call: either party hanging up ends the call
    if (!isGroupOrMeeting) {
      endWebRTCCall();
      return;
    }

    const isHost = Boolean(
      call?.isHost ||
      session?.user?.role === "SUPER_ADMIN" ||
      session?.user?.role === "ADMIN"
    );

    // Regular participant: always leave only (never terminate for others)
    if (!isHost) {
      leaveCall();
      return;
    }

    // Host / Creator: Zoom-style confirmation prompt
    const shouldEndAll = await showConfirmDialog({
      title: "Leave or End Meeting?",
      text: "You are the host. Would you like to End the meeting for everyone, or just Leave and let other participants continue?",
      confirmButtonText: "End Meeting for All",
      cancelButtonText: "Leave Meeting",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#334155",
      icon: "warning",
    });

    if (shouldEndAll) {
      endWebRTCCall();
    } else {
      leaveCall();
    }
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

  const toggleCam = async () => {
    let videoTrack = localStreamRef.current?.getVideoTracks()[0];

    // If no video track exists yet (e.g. user joined without camera or camera was not acquired), acquire camera!
    if (!videoTrack) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          if (!localStreamRef.current) {
            localStreamRef.current = new MediaStream();
          }
          localStreamRef.current.addTrack(videoTrack);
          setIsCamOff(false);

          const callSessionId = activeCallRef.current?.callSessionId;
          if (callSessionId && socket) {
            socket.emit("call:video-toggle", { callSessionId, isVideoOff: false });
          }

          const localMedia = new MediaStream([videoTrack]);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localMedia;
            void localVideoRef.current.play().catch(() => null);
          }
          if (localStageVideoRef.current) {
            localStageVideoRef.current.srcObject = localMedia;
            void localStageVideoRef.current.play().catch(() => null);
          }

          // Attach new video track to all active peer connections
          for (const [targetUserId, pc] of groupPeerConnectionsRef.current.entries()) {
            const sender = getVideoSender(pc);
            if (sender) {
              await sender.replaceTrack(videoTrack).catch(console.warn);
            } else {
              pc.addTrack(videoTrack, localStreamRef.current);
            }
            void renegotiateGroupPeer(targetUserId, pc);
          }

          if (peerConnectionRef.current) {
            const sender = getVideoSender(peerConnectionRef.current);
            if (sender) {
              await sender.replaceTrack(videoTrack).catch(console.warn);
            } else {
              peerConnectionRef.current.addTrack(videoTrack, localStreamRef.current);
            }
            if (activeCallRef.current?.peerUserId) {
              void renegotiate1to1(activeCallRef.current.peerUserId, peerConnectionRef.current);
            }
          }

          showSuccessToast("Camera turned on");
          return;
        }
      } catch (err: any) {
        console.warn("Could not access video camera:", err);
        showNotification({
          title: "Camera Access Notice",
          text: err.name === "NotFoundError"
            ? "No camera device found on this system."
            : "Camera access was denied. Please allow camera permissions in your browser.",
          icon: "warning",
        });
        return;
      }
    }

    // Video track exists — toggle enabled state
    const nextEnabled = !videoTrack.enabled;
    videoTrack.enabled = nextEnabled;
    setIsCamOff(!nextEnabled);

    // Notify all participants immediately via socket so their UI updates without waiting for packet timeouts
    const callSessionId = activeCallRef.current?.callSessionId;
    if (callSessionId && socket) {
      socket.emit("call:video-toggle", { callSessionId, isVideoOff: !nextEnabled });
    }

    if (nextEnabled) {
      const localMedia = new MediaStream([videoTrack]);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localMedia;
        void localVideoRef.current.play().catch(() => null);
      }
      if (localStageVideoRef.current) {
        localStageVideoRef.current.srcObject = localMedia;
        void localStageVideoRef.current.play().catch(() => null);
      }
    } else {
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (localStageVideoRef.current) localStageVideoRef.current.srcObject = null;
    }

    // Ensure all senders broadcast the updated track state
    for (const [targetUserId, pc] of groupPeerConnectionsRef.current.entries()) {
      const sender = getVideoSender(pc);
      if (sender) {
        await sender.replaceTrack(nextEnabled ? videoTrack : null).catch(console.warn);
      } else if (localStreamRef.current) {
        pc.addTrack(videoTrack, localStreamRef.current);
      }
      void renegotiateGroupPeer(targetUserId, pc);
    }

    if (peerConnectionRef.current) {
      const sender = getVideoSender(peerConnectionRef.current);
      if (sender) {
        await sender.replaceTrack(nextEnabled ? videoTrack : null).catch(console.warn);
      } else if (localStreamRef.current) {
        peerConnectionRef.current.addTrack(videoTrack, localStreamRef.current);
      }
      if (activeCallRef.current?.peerUserId) {
        void renegotiate1to1(activeCallRef.current.peerUserId, peerConnectionRef.current);
      }
    }

    showSuccessToast(nextEnabled ? "Camera turned on" : "Camera turned off");
  };

  const renegotiateGroupPeer = async (targetUserId: number, pc: RTCPeerConnection) => {
    try {
      if (pc.signalingState !== "stable") {
        setTimeout(() => {
          if (pc.signalingState === "stable") {
            void renegotiateGroupPeer(targetUserId, pc);
          }
        }, 300);
        return;
      }
      const offer = await pc.createOffer();
      if (pc.signalingState !== "stable") {
        setTimeout(() => {
          if (pc.signalingState === "stable") {
            void renegotiateGroupPeer(targetUserId, pc);
          }
        }, 300);
        return;
      }
      await pc.setLocalDescription(offer);
      socket?.emit("webrtc:offer", {
        targetUserId,
        callSessionId: activeCallRef.current?.callSessionId,
        offer,
      });
    } catch (e: any) {
      if (e?.name === "InvalidStateError" || String(e?.message || "").includes("wrong state")) {
        setTimeout(() => {
          if (pc.signalingState === "stable") {
            void renegotiateGroupPeer(targetUserId, pc);
          }
        }, 400);
      } else {
        console.warn("[WebRTC Group] Renegotiation error:", e);
      }
    }
  };

  const renegotiate1to1 = async (targetUserId: number, pc: RTCPeerConnection) => {
    try {
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer();
      if (pc.signalingState !== "stable") return;
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
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1920, max: 2560 },
          height: { ideal: 1080, max: 1440 },
        } as any,
        audio: false,
      });

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;
      screenTrack.enabled = true;
      try {
        (screenTrack as any).contentHint = "detail";
      } catch (e) { /* ignore */ }

      // Attach to 1-on-1 screen transceiver (Transceiver 2)
      if (peerConnectionRef.current) {
        const sender = getScreenSender(peerConnectionRef.current);
        if (sender) {
          await sender.replaceTrack(screenTrack).catch(console.warn);
          try {
            const params = sender.getParameters();
            if (params && params.encodings) {
              params.degradationPreference = "maintain-resolution";
              await sender.setParameters(params);
            }
          } catch (e) { /* ignore */ }
        }
        if (activeCallRef.current?.peerUserId) {
          void renegotiate1to1(activeCallRef.current.peerUserId, peerConnectionRef.current);
        }
      }

      // Attach to all group peer connection screen transceivers (Transceiver 2)
      for (const [targetUserId, pc] of groupPeerConnectionsRef.current.entries()) {
        const sender = getScreenSender(pc);
        if (sender) {
          await sender.replaceTrack(screenTrack).catch(console.warn);
          try {
            const params = sender.getParameters();
            if (params && params.encodings) {
              params.degradationPreference = "maintain-resolution";
              await sender.setParameters(params);
            }
          } catch (e) { /* ignore */ }
        }
        void renegotiateGroupPeer(targetUserId, pc);
      }

      screenStreamRef.current = displayStream;
      setIsScreenSharing(true);
      setIsCallMaximized(true);
      const myId = session?.user?.id;
      if (myId) {
        updateActiveScreenSharers((prev) => Array.from(new Set([...prev, myId])));
      }
      showSuccessToast("Screen sharing started");

      // Notify remote participants with callSessionId
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
    if (session?.user?.id) {
      updateActiveScreenSharers((prev) => prev.filter((id) => id !== session.user.id));
    }

    // Replace screen transceiver track with null across all connections (leaves camera intact!)
    if (peerConnectionRef.current) {
      const sender = getScreenSender(peerConnectionRef.current);
      if (sender) {
        sender.replaceTrack(null).catch(console.warn);
      }
      if (activeCallRef.current?.peerUserId) {
        void renegotiate1to1(activeCallRef.current.peerUserId, peerConnectionRef.current);
      }
    }

    groupPeerConnectionsRef.current.forEach((pc, targetUserId) => {
      const sender = getScreenSender(pc);
      if (sender) {
        sender.replaceTrack(null).catch(console.warn);
      }
      void renegotiateGroupPeer(targetUserId, pc);
    });

    const callSessionId = activeCallRef.current?.callSessionId;
    if (callSessionId && socket) {
      socket.emit("call:screen-share-stopped", { callSessionId });
    }
  };

  // Automatically unblock browser autoplay audio silently on user interaction
  const unblockAudio = async () => {
    if (audioUnblockedRef.current) return;
    audioUnblockedRef.current = true;
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

  // Auto-listen for first user interaction during active call to unblock audio
  useEffect(() => {
    if (!activeCall) return;
    const onUserInteraction = () => {
      void unblockAudio();
    };
    window.addEventListener("click", onUserInteraction, { passive: true, once: true });
    window.addEventListener("touchstart", onUserInteraction, { passive: true, once: true });
    window.addEventListener("pointerdown", onUserInteraction, { passive: true, once: true });
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
          {activeCall && (() => {
            const isMeetingCall = Boolean(
              activeCall.isGroupCall && (
                Boolean(activeCall.meetingId) ||
                activeCall.channelName === "permanent-daily-standup" ||
                activeCall.channelName?.startsWith("permanent-") ||
                activeCall.channelName?.startsWith("meeting-") ||
                activeCall.targetName?.toLowerCase().includes("daily standup")
              )
            );

            if (!isMeetingCall) {
              return (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-3 sm:p-6 overflow-hidden select-none [scrollbar-width:none]"
                  onClick={() => { void unblockAudio(); }}
                >
                  {!activeCall.isGroupCall ? (
                    /* ========================================================
                       BITRIX24 1-ON-1 MESSENGER CALL CARD (AUDIO / VIDEO)
                       ======================================================== */
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-sm sm:max-w-md bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-700/80 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col items-center justify-between text-white relative overflow-hidden transition-all duration-300 min-h-[500px]"
                      style={{ boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 35px rgba(249, 115, 22, 0.15)" }}
                    >
                      {/* Top Bar */}
                      <div className="w-full flex items-center justify-between text-xs text-slate-400 pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                            {activeCall.type === "VIDEO" && !isCamOff ? "Video Call" : "Voice Call"}
                          </span>
                          <span className="text-slate-600">•</span>
                          <span className="font-mono font-semibold text-slate-300">{formatTime(callDuration)}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isSpeakerOn ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-slate-800 text-slate-400"}`}>
                          {isSpeakerOn ? "Speaker ON" : "Earpiece"}
                        </span>
                      </div>

                      {/* Main Stage: Audio Profile Card vs Video */}
                      {activeCall.type === "AUDIO" || (activeCall.type === "VIDEO" && isCamOff && (!remoteStream || !remoteStream.getVideoTracks().some(t => t.readyState === "live" && t.enabled))) ? (
                        <div className="flex-1 w-full flex flex-col items-center justify-center py-6 text-center">
                          {/* Centered Avatar with Bitrix24 pulsing glow rings */}
                          <div className="relative mb-6 flex items-center justify-center">
                            <div className="absolute w-40 h-40 rounded-full border border-orange-500/20 animate-ping" style={{ animationDuration: "2.5s" }} />
                            <div className="absolute w-32 h-32 rounded-full border border-orange-500/30 animate-ping" style={{ animationDuration: "1.8s" }} />
                            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-rose-600 flex items-center justify-center text-3xl sm:text-4xl font-black text-white shadow-2xl border-4 border-slate-800 ring-2 ring-orange-500/40">
                              {activeCall.targetName ? activeCall.targetName.charAt(0).toUpperCase() : "U"}
                            </div>
                          </div>

                          {/* Colleague Name and Role */}
                          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-1 truncate max-w-full px-2">
                            {activeCall.targetName}
                          </h3>
                          {(() => {
                            const emp = employees.find((e) => e.id === activeCall.peerUserId);
                            return (
                              <p className="text-xs sm:text-sm font-medium text-slate-400 mb-3">
                                {emp?.designation?.name || emp?.role?.name || "Colleague"}
                              </p>
                            );
                          })()}

                          {/* Sound Wave Equalizer Bars */}
                          <div className="flex items-center justify-center gap-1.5 h-7 my-2">
                            <span className="w-1.5 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-6 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            <span className="w-1.5 h-5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "450ms" }} />
                            <span className="w-1.5 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "600ms" }} />
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium">Voice connected • Encrypted peer-to-peer</p>
                        </div>
                      ) : (
                        /* 1-on-1 Video Stage */
                        <div className="flex-1 w-full my-3 relative rounded-2xl overflow-hidden bg-black border border-slate-800 min-h-[260px] flex items-center justify-center">
                          <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                          />
                          {/* Corner Selfie PiP */}
                          <div className="absolute bottom-3 right-3 w-24 h-18 bg-slate-900 rounded-xl overflow-hidden border-2 border-slate-700 shadow-xl">
                            <video
                              ref={localVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-1 left-1 text-[8px] font-bold text-white bg-black/70 px-1 rounded">You</span>
                          </div>
                          <div className="absolute top-2 left-2.5 bg-slate-900/80 backdrop-blur-xs px-2 py-0.5 rounded-lg text-xs font-bold text-white">
                            {activeCall.targetName}
                          </div>
                        </div>
                      )}

                      {/* Listen-Only warning banner if applicable */}
                      {hasNoMic && (
                        <div className="w-full mb-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300">
                          <span className="text-[10px]">Mic inactive (Listen-Only). Tap Connect to speak.</span>
                          <button onClick={retryConnectMic} className="px-2 py-0.5 bg-orange-500 text-white rounded font-bold text-[9px]">
                            Connect
                          </button>
                        </div>
                      )}

                      {/* Floating Bitrix24 Bottom Controls */}
                      <div className="w-full flex items-center justify-center gap-4 sm:gap-6 pt-4 border-t border-slate-800/80">
                        {/* Mic */}
                        <button
                          type="button"
                          onClick={toggleMic}
                          className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex flex-col items-center justify-center gap-0.5 transition shadow-lg cursor-pointer ${isMicMuted || hasNoMic
                            ? "bg-rose-500/20 border-2 border-rose-500 text-rose-400"
                            : "bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 text-slate-200"
                            }`}
                          title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
                        >
                          {isMicMuted || hasNoMic ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                          <span className="text-[7.5px] font-bold">{isMicMuted ? "Muted" : "Mute"}</span>
                        </button>

                        {/* Speaker */}
                        <button
                          type="button"
                          onClick={toggleSpeaker}
                          className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex flex-col items-center justify-center gap-0.5 transition shadow-lg cursor-pointer ${isSpeakerOn
                            ? "bg-orange-500/20 border-2 border-orange-500 text-orange-400"
                            : "bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 text-slate-200"
                            }`}
                          title={isSpeakerOn ? "Speakerphone ON" : "Earpiece Mode"}
                        >
                          {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <Volume1 className="w-5 h-5" />}
                          <span className="text-[7.5px] font-bold">{isSpeakerOn ? "Speaker" : "Earpiece"}</span>
                        </button>

                        {/* Camera */}
                        <button
                          type="button"
                          onClick={toggleCam}
                          className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex flex-col items-center justify-center gap-0.5 transition shadow-lg cursor-pointer ${activeCall.type === "VIDEO" && !isCamOff
                            ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                            : "bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 text-slate-200"
                            }`}
                          title={activeCall.type === "VIDEO" && !isCamOff ? "Turn Camera Off" : "Turn Camera On"}
                        >
                          {activeCall.type === "VIDEO" && isCamOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                          <span className="text-[7.5px] font-bold">{activeCall.type === "VIDEO" ? (isCamOff ? "Cam Off" : "Video") : "Video"}</span>
                        </button>

                        {/* End Call Button */}
                        <button
                          type="button"
                          onClick={endWebRTCCall}
                          className="w-13 h-13 sm:w-15 sm:h-15 rounded-full bg-gradient-to-tr from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-600 text-white flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-rose-600/40 cursor-pointer active:scale-95 transition"
                          title="End Call"
                        >
                          <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" />
                          <span className="text-[8px] font-black uppercase">End</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ========================================================
                       BITRIX24 / WHATSAPP GROUP CALL INTERFACE (GROUPS)
                       ======================================================== */
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-4xl h-[85vh] sm:h-[88vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-4 sm:p-6 flex flex-col justify-between text-white relative overflow-hidden"
                      style={{ boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 35px rgba(249, 115, 22, 0.15)" }}
                    >
                      {/* Group Call Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                              <span>{activeCall.targetName}</span>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">LIVE</span>
                            </h3>
                            <p className="text-[11px] text-slate-400 flex items-center gap-2">
                              <span>{remoteParticipants.length + 1} Participants</span>
                              <span>•</span>
                              <span className="font-mono text-emerald-400">{formatTime(callDuration)}</span>
                            </p>
                          </div>
                        </div>

                        {/* Leave / End */}
                        <button
                          type="button"
                          onClick={handleHangupClick}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer transition active:scale-95"
                        >
                          <PhoneOff className="w-4 h-4" />
                          <span>{activeCall.isHost ? "End Call" : "Leave"}</span>
                        </button>
                      </div>

                      {/* Participant Grid (WhatsApp / Bitrix24 Tiles) */}
                      <div className="flex-1 min-h-0 my-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto p-1">
                        {/* Local User Tile (You) */}
                        <div className="relative rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center overflow-hidden min-h-[160px] p-4">
                          {isCamOff ? (
                            <div className="flex flex-col items-center justify-center text-center">
                              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-xl font-black text-white mb-2 shadow-lg">
                                {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "U"}
                              </div>
                              <p className="text-xs font-bold text-white">You {activeCall.isHost && "(Host)"}</p>
                              <span className="text-[10px] text-slate-500">Camera Off</span>
                            </div>
                          ) : (
                            <video
                              ref={localVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover"
                            />
                          )}
                          <div className="absolute bottom-2 left-2.5 bg-slate-900/85 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-200 flex items-center gap-1">
                            <span>You</span>
                            {isMicMuted && <MicOff className="w-3 h-3 text-rose-400" />}
                          </div>
                        </div>

                        {/* Remote Participants Tiles */}
                        {remoteParticipants.map((participant) => {
                          const emp = employees.find((e) => e.id === participant.userId);
                          const pName = emp?.name || `Participant #${participant.userId}`;
                          const isVideoOff = remoteVideoOffMap.get(participant.userId) || false;
                          const hasLiveCam = !isVideoOff && participant.stream?.getVideoTracks().some((t) => t.readyState === "live" && t.enabled);

                          return (
                            <div
                              key={participant.userId}
                              className="relative rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center overflow-hidden min-h-[160px] p-4 transition-all"
                            >
                              {hasLiveCam ? (
                                <RemoteParticipantMedia
                                  participant={participant}
                                  name={pName}
                                  type={activeCall.type}
                                  isSpeakerOn={isSpeakerOn}
                                  onAudioBlocked={() => setIsAudioBlocked(true)}
                                  employee={emp}
                                  isRemoteVideoOff={isVideoOff}
                                />
                              ) : (
                                <div className="flex flex-col items-center justify-center text-center">
                                  <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-xl font-black text-orange-400 mb-2 shadow-lg">
                                    {pName.charAt(0).toUpperCase()}
                                  </div>
                                  <p className="text-xs font-bold text-white truncate max-w-[140px]">{pName}</p>
                                  <span className="text-[10px] text-slate-400">{emp?.role?.name || "Member"}</span>
                                </div>
                              )}
                              <div className="absolute bottom-2 left-2.5 bg-slate-900/85 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-200 flex items-center gap-1">
                                <span className="truncate max-w-[100px]">{pName}</span>
                              </div>
                            </div>
                          );
                        })}

                        {/* Empty state waiting for others */}
                        {remoteParticipants.length === 0 && (
                          <div className="col-span-1 sm:col-span-1 md:col-span-2 rounded-2xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                            <Users className="w-10 h-10 text-slate-600 mb-2 animate-pulse" />
                            <p className="text-xs font-semibold text-slate-300">Waiting for other group members to join...</p>
                            <p className="text-[11px] text-slate-500 mt-1">Group members receive an instant ringing invitation.</p>
                            <button
                              type="button"
                              onClick={() => setShowAddMemberModal(true)}
                              className="mt-3 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Invite Members
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Floating Bottom Controls for Group Call */}
                      <div className="flex items-center justify-center gap-3 sm:gap-5 pt-3 border-t border-slate-800 shrink-0">
                        {/* Mic */}
                        <button
                          type="button"
                          onClick={toggleMic}
                          className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex flex-col items-center justify-center gap-0.5 transition shadow-lg cursor-pointer ${isMicMuted || hasNoMic
                            ? "bg-rose-500/20 border-2 border-rose-500 text-rose-400"
                            : "bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 text-slate-200"
                            }`}
                          title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
                        >
                          {isMicMuted || hasNoMic ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                          <span className="text-[7.5px] sm:text-[8px] font-bold">{isMicMuted ? "Muted" : "Mute"}</span>
                        </button>

                        {/* Speaker */}
                        <button
                          type="button"
                          onClick={toggleSpeaker}
                          className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex flex-col items-center justify-center gap-0.5 transition shadow-lg cursor-pointer ${isSpeakerOn
                            ? "bg-orange-500/20 border-2 border-orange-500 text-orange-400"
                            : "bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 text-slate-200"
                            }`}
                          title={isSpeakerOn ? "Speaker ON" : "Speaker Normal"}
                        >
                          {isSpeakerOn ? <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume1 className="w-4 h-4 sm:w-5 sm:h-5" />}
                          <span className="text-[7.5px] sm:text-[8px] font-bold">{isSpeakerOn ? "Speaker" : "Normal"}</span>
                        </button>

                        {/* Camera */}
                        <button
                          type="button"
                          onClick={toggleCam}
                          className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex flex-col items-center justify-center gap-0.5 transition shadow-lg cursor-pointer ${isCamOff
                            ? "bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 text-slate-400"
                            : "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                            }`}
                          title={isCamOff ? "Turn Camera On" : "Turn Camera Off"}
                        >
                          {isCamOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
                          <span className="text-[7.5px] sm:text-[8px] font-bold">{isCamOff ? "Cam Off" : "Cam On"}</span>
                        </button>

                        {/* Invite Members */}
                        <button
                          type="button"
                          onClick={() => setShowAddMemberModal(true)}
                          className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 text-slate-200 flex flex-col items-center justify-center gap-0.5 transition shadow-lg cursor-pointer"
                          title="Invite Members to Call"
                        >
                          <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                          <span className="text-[7.5px] sm:text-[8px] font-bold">Invite</span>
                        </button>

                        {/* End / Leave */}
                        <button
                          type="button"
                          onClick={handleHangupClick}
                          className="w-12 h-11 sm:w-16 sm:h-13 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-rose-600/40 cursor-pointer active:scale-95 transition"
                          title={activeCall.isHost ? "End Call for All" : "Leave Call"}
                        >
                          <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
                          <span className="text-[7.5px] sm:text-[8px] font-extrabold uppercase">
                            {activeCall.isHost ? "END" : "LEAVE"}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-2 sm:p-4 overflow-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                onClick={() => { void unblockAudio(); }}
              >

                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`bg-slate-900 text-white shadow-2xl border border-slate-700/60 flex flex-col overflow-hidden transition-all duration-200 ${isCallMaximized
                    ? "fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none p-2 sm:p-4 z-50 bg-slate-950 flex flex-col"
                    : "h-[88vh] sm:h-[92vh] max-w-6xl w-full rounded-2xl sm:rounded-3xl p-3 sm:p-5 flex flex-col"
                    }`}
                  style={{ boxShadow: "0 0 60px rgba(239,68,68,0.15), 0 25px 50px rgba(0,0,0,0.8)" }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5 sm:pb-3 mb-2 sm:mb-3 shrink-0">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm sm:text-lg font-bold text-white flex items-center gap-1.5 sm:gap-2 truncate">
                        {activeCall.type === "VIDEO" ? (
                          <Video className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 shrink-0" />
                        ) : (
                          <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 shrink-0" />
                        )}
                        <span className="truncate">{activeCall.isGroupCall ? `Group Call — ${activeCall.targetName}` : `Call with ${activeCall.targetName}`}</span>
                      </h2>
                      <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
                        </span>
                        {activeCall.isHost ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                            <Crown className="w-3 h-3 text-orange-400" /> Host (You)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" /> Participant
                          </span>
                        )}
                        <p className="text-[11px] sm:text-xs text-emerald-400 font-mono font-bold">
                          {formatTime(callDuration)}
                        </p>
                        <span className="text-[10px] text-slate-400">•</span>
                        <span className="text-[10px] sm:text-[11px] font-semibold text-orange-400 flex items-center gap-1">
                          {isSpeakerOn ? <Volume2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Volume1 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                          {isSpeakerOn ? "Speaker: ON (Hands-free)" : "Speaker: Normal"}
                        </span>
                        {isScreenSharing && (
                          <>
                            <span className="text-[10px] text-slate-400">•</span>
                            <span className="text-[10px] sm:text-[11px] font-bold text-slate-200 bg-slate-800 px-1.5 sm:px-2 py-0.5 rounded-md border border-slate-600 flex items-center gap-1">
                              <ScreenShare className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-300" />
                              Sharing Screen
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Top-right action buttons */}
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {/* Full View / Maximize Toggle */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCallMaximized(!isCallMaximized);
                        }}
                        className="touch-manipulation select-none active:scale-90 p-2 sm:px-3 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-transform duration-75 border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-md"
                        title={isCallMaximized ? "Exit Full View" : "Full View Screen"}
                      >
                        {isCallMaximized ? <Minimize2 className="w-4 h-4 text-orange-400 pointer-events-none" /> : <Maximize2 className="w-4 h-4 text-orange-400 pointer-events-none" />}
                        <span className="hidden sm:inline pointer-events-none">{isCallMaximized ? "Exit Full View" : "Full View"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHangupClick();
                        }}
                        className="touch-manipulation select-none active:scale-90 px-3 sm:px-5 py-2 sm:py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl transition-transform duration-75 shadow-lg flex items-center gap-1.5 sm:gap-2 cursor-pointer"
                        style={{ boxShadow: "0 0 20px rgba(239,68,68,0.5)" }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 sm:w-4 sm:h-4 pointer-events-none" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                        </svg>
                        <span className="hidden xs:inline pointer-events-none">
                          {activeCall?.isGroupCall && !activeCall?.isHost && session?.user?.role !== "SUPER_ADMIN" ? "Leave Call" : "End Call"}
                        </span>
                        <span className="xs:hidden pointer-events-none">
                          {activeCall?.isGroupCall && !activeCall?.isHost && session?.user?.role !== "SUPER_ADMIN" ? "Leave" : "End"}
                        </span>
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

                  {/* Video Stage & Side Panels Container */}
                  <div className="flex-1 min-h-0 w-full flex flex-col sm:flex-row gap-3 relative overflow-hidden">
                    {/* Video / Audio Streams Display */}
                    <div className="flex-1 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800/80 relative flex flex-col min-h-0 w-full">
                      {activeCall.isGroupCall ? (
                        (() => {
                          // Multi-Participant Screen Sharing: Collect all active shared screens
                          const activeScreensList: Array<{
                            id: number | "local";
                            name: string;
                            stream: MediaStream | null;
                            isLocal: boolean;
                          }> = [];

                          if (isScreenSharing && screenStreamRef.current) {
                            activeScreensList.push({
                              id: "local",
                              name: session?.user?.name || "You",
                              stream: screenStreamRef.current,
                              isLocal: true,
                            });
                          }

                          activeScreenSharerIds.forEach((sharerId) => {
                            if (sharerId === session?.user?.id) return;
                            const emp = employees.find((e) => e.id === sharerId);
                            let stream = remoteScreenMapRef.current.get(sharerId) || null;

                            // Fallback: If map stream has no live tracks, resolve directly from peer connection transceiver
                            if (!stream || !stream.getVideoTracks().some((t) => t.readyState === "live")) {
                              const pc = groupPeerConnectionsRef.current.get(sharerId) || (activeCall?.peerUserId === sharerId ? peerConnectionRef.current : null);
                              if (pc) {
                                const transceivers = pc.getTransceivers();
                                const screenTr = transceivers.length > 2 ? transceivers[2] : transceivers.find((t, idx) => idx > 1 && t.receiver?.track?.kind === "video");
                                if (screenTr?.receiver?.track && screenTr.receiver.track.readyState !== "ended") {
                                  screenTr.receiver.track.enabled = true;
                                  const bindScreen = () => {
                                    if (screenTr.receiver.track && screenTr.receiver.track.readyState !== "ended") {
                                      screenTr.receiver.track.enabled = true;
                                      remoteScreenMapRef.current.set(sharerId, new MediaStream([screenTr.receiver.track]));
                                      setScreenStreamsVersion((v) => v + 1);
                                    }
                                  };
                                  screenTr.receiver.track.addEventListener("unmute", bindScreen);
                                  screenTr.receiver.track.addEventListener("mute", bindScreen);
                                  const fresh = new MediaStream([screenTr.receiver.track]);
                                  remoteScreenMapRef.current.set(sharerId, fresh);
                                  stream = fresh;
                                }
                              }
                            }

                            activeScreensList.push({
                              id: sharerId,
                              name: emp?.name || `Participant #${sharerId}`,
                              stream,
                              isLocal: false,
                            });
                          });

                          // If any participants are currently sharing screens, show the Zoom-style multi-screen presentation stage!
                          if (activeScreensList.length > 0) {
                            return (
                              <div className="flex-1 flex flex-col h-full w-full min-h-0 relative">
                                {/* Presentation Canvas */}
                                <div className="flex-1 relative w-full h-full min-h-0 bg-slate-950 flex flex-col overflow-hidden p-2 sm:p-3">
                                  <div className="flex items-center justify-between pb-2 shrink-0">
                                    <div className="flex items-center gap-2">
                                      <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm">
                                        <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>Screen Sharing ({activeScreensList.length})</span>
                                      </span>
                                      {focusedScreenSharerId !== null && (
                                        <button
                                          type="button"
                                          onClick={() => setFocusedScreenSharerId(null)}
                                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                                        >
                                          <Grid className="w-3.5 h-3.5 text-orange-400" />
                                          <span>Show All Screens</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex-1 min-h-0 w-full relative">
                                    {focusedScreenSharerId !== null ? (
                                      (() => {
                                        const focusedScreen = activeScreensList.find((s) => s.id === focusedScreenSharerId) || activeScreensList[0];
                                        return (
                                          <ScreenShareView
                                            key={String(focusedScreen.id)}
                                            stream={focusedScreen.stream}
                                            name={focusedScreen.name}
                                            isLocal={focusedScreen.isLocal}
                                            isFocused={true}
                                            onToggleFocus={() => setFocusedScreenSharerId(null)}
                                          />
                                        );
                                      })()
                                    ) : activeScreensList.length === 1 ? (
                                      <ScreenShareView
                                        key={String(activeScreensList[0].id)}
                                        stream={activeScreensList[0].stream}
                                        name={activeScreensList[0].name}
                                        isLocal={activeScreensList[0].isLocal}
                                        isFocused={true}
                                        onToggleFocus={() => setFocusedScreenSharerId(activeScreensList[0].id)}
                                      />
                                    ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full w-full min-h-0">
                                        {activeScreensList.map((screen) => (
                                          <ScreenShareView
                                            key={String(screen.id)}
                                            stream={screen.stream}
                                            name={screen.name}
                                            isLocal={screen.isLocal}
                                            isFocused={false}
                                            onToggleFocus={() => setFocusedScreenSharerId(screen.id)}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Bottom Participant Filmstrip Dock: camera & audio feeds independent of screen shares */}
                                <div className="h-24 sm:h-28 bg-slate-900/95 border-t border-slate-800 flex items-center gap-2.5 px-3 overflow-x-auto shrink-0 [scrollbar-width:thin]">
                                  {/* Local camera thumbnail */}
                                  <div className="h-20 w-32 sm:h-24 sm:w-36 bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shrink-0 relative">
                                    {isCamOff ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 select-none">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-orange-400 border border-orange-500/30 text-xs font-bold">
                                          {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "U"}
                                        </div>
                                        <span className="text-[10px] text-slate-400 mt-1">You</span>
                                      </div>
                                    ) : (
                                      <video
                                        ref={localVideoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-full h-full object-contain bg-black"
                                      />
                                    )}
                                    <span className="absolute bottom-1 left-1.5 bg-slate-900/80 text-[9px] font-bold text-white px-1 py-0.5 rounded">
                                      You {isMicMuted && "🔇"}
                                    </span>
                                  </div>

                                  {/* Remote participant camera thumbnails */}
                                  {(() => {
                                    const remoteUserIds = Array.from(
                                      new Set([
                                        ...meetingParticipantIds.filter((id) => id !== session?.user?.id),
                                        ...remoteParticipants.map((p) => p.userId),
                                      ])
                                    );
                                    return remoteUserIds.map((userId) => {
                                      const emp = employees.find((e) => e.id === userId);
                                      const participant = remoteParticipants.find((p) => p.userId === userId) || { userId, stream: new MediaStream() };
                                      return (
                                        <div
                                          key={userId}
                                          className="h-20 w-32 sm:h-24 sm:w-36 bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shrink-0 relative"
                                        >
                                          <RemoteParticipantMedia
                                            participant={participant}
                                            name={emp?.name || `Employee #${userId}`}
                                            type={activeCall.type}
                                            isSpeakerOn={isSpeakerOn}
                                            onAudioBlocked={() => setIsAudioBlocked(true)}
                                            isThumbnail={true}
                                            employee={emp}
                                            isRemoteVideoOff={remoteVideoOffMap.get(userId) || false}
                                            onViewProfile={() => {
                                              if (emp) setSelectedProfileUser(emp);
                                            }}
                                          />
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>
                            );
                          }

                          const liveVideoParticipant = remoteParticipants.find(p =>
                            !remoteVideoOffMap.get(p.userId) &&
                            p.stream?.getVideoTracks().some(t => t.readyState !== "ended" && t.enabled)
                          );
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
                                    isCamOff && !isScreenSharing ? (
                                      <div className="flex flex-col items-center justify-center p-6 select-none">
                                        <div className="relative mb-4 flex items-center justify-center">
                                          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 text-orange-400 border border-orange-500/30 text-2xl font-bold">
                                            {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "U"}
                                          </div>
                                        </div>
                                        <p className="text-base font-bold text-white truncate max-w-full px-2">
                                          {session?.user?.name || "You"} (Camera Off)
                                        </p>
                                      </div>
                                    ) : (
                                      <video
                                        ref={localStageVideoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-full h-full object-contain bg-black"
                                      />
                                    )
                                  ) : focusedParticipant ? (
                                    <RemoteParticipantMedia
                                      participant={focusedParticipant}
                                      name={focusedEmployee?.name || `Participant #${focusedParticipant.userId}`}
                                      type={activeCall.type}
                                      isSpeakerOn={isSpeakerOn}
                                      onAudioBlocked={() => setIsAudioBlocked(true)}
                                      isFocused={true}
                                      isStage={true}
                                      employee={focusedEmployee || undefined}
                                      isRemoteVideoOff={remoteVideoOffMap.get(focusedParticipant.userId) || false}
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
                                          ? (isScreenSharing ? "Your Screen (Sharing)" : "Your Camera")
                                          : (screenSharingUserId === focusedParticipant?.userId
                                            ? `${focusedEmployee?.name || "Participant"}'s Screen`
                                            : `${focusedEmployee?.name || "Participant"}'s Camera`)}
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
                                    {isCamOff && !isScreenSharing ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 select-none">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-orange-400 border border-orange-500/30 text-sm font-bold">
                                          {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "U"}
                                        </div>
                                      </div>
                                    ) : (
                                      <video
                                        ref={localVideoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-full h-full object-contain bg-black"
                                      />
                                    )}
                                    <span className="absolute bottom-1 left-1.5 bg-slate-900/80 text-[10px] font-bold text-white px-1.5 py-0.5 rounded">
                                      {isScreenSharing ? "Your Screen" : "You"}
                                    </span>
                                  </div>

                                  {/* Remote Participants in Dock */}
                                  {(() => {
                                    const remoteUserIds = Array.from(
                                      new Set([
                                        ...meetingParticipantIds.filter((id) => id !== session?.user?.id),
                                        ...remoteParticipants.map((p) => p.userId),
                                      ])
                                    );
                                    return remoteUserIds.map((userId) => {
                                      const emp = employees.find((e) => e.id === userId);
                                      const participant = remoteParticipants.find((p) => p.userId === userId) || { userId, stream: new MediaStream() };
                                      return (
                                        <div
                                          key={userId}
                                          onClick={() => setFocusedParticipantId(effectiveFocusId === userId ? null : userId)}
                                          className={`h-24 w-36 sm:h-28 sm:w-44 bg-slate-950 border-2 rounded-xl overflow-hidden shrink-0 relative cursor-pointer transition-all ${effectiveFocusId === userId ? "border-orange-500 ring-2 ring-orange-500/40" : "border-slate-700 hover:border-slate-500"
                                            }`}
                                          title="Click to view on Main Stage in Full View"
                                        >
                                          <RemoteParticipantMedia
                                            participant={participant}
                                            name={emp?.name || `Employee #${userId}`}
                                            type={activeCall.type}
                                            isSpeakerOn={isSpeakerOn}
                                            onAudioBlocked={() => setIsAudioBlocked(true)}
                                            onFocus={() => setFocusedParticipantId(userId)}
                                            isFocused={effectiveFocusId === userId}
                                            isThumbnail={true}
                                            employee={emp}
                                            isRemoteVideoOff={remoteVideoOffMap.get(userId) || false}
                                            onViewProfile={() => {
                                              if (emp) setSelectedProfileUser(emp);
                                            }}
                                          />
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>
                            );
                          }

                          const allRemoteUserIds = Array.from(
                            new Set([
                              ...meetingParticipantIds.filter((id) => id !== session?.user?.id),
                              ...remoteParticipants.map((p) => p.userId),
                            ])
                          );

                          return (
                            <div className="grid h-full w-full min-h-0 flex-1 grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 p-2 sm:p-3 overflow-y-auto">
                              {allRemoteUserIds.map((userId) => {
                                const emp = employees.find((employee) => employee.id === userId);
                                const participant = remoteParticipants.find((p) => p.userId === userId) || { userId, stream: new MediaStream() };
                                return (
                                  <RemoteParticipantMedia
                                    key={userId}
                                    participant={participant}
                                    name={emp?.name || `Employee #${userId}`}
                                    type={activeCall.type}
                                    isSpeakerOn={isSpeakerOn}
                                    onAudioBlocked={() => setIsAudioBlocked(true)}
                                    onFocus={() => setFocusedParticipantId(userId)}
                                    employee={emp}
                                    isRemoteVideoOff={remoteVideoOffMap.get(userId) || false}
                                    onViewProfile={() => {
                                      if (emp) setSelectedProfileUser(emp);
                                    }}
                                  />
                                );
                              })}
                              {allRemoteUserIds.length === 0 && (
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
                          {(() => {
                            const active1to1Screens: Array<{
                              id: number | "local";
                              name: string;
                              stream: MediaStream | null;
                              isLocal: boolean;
                            }> = [];
                            if (isScreenSharing && screenStreamRef.current) {
                              active1to1Screens.push({
                                id: "local",
                                name: session?.user?.name || "You",
                                stream: screenStreamRef.current,
                                isLocal: true,
                              });
                            }
                            if (activeCall.peerUserId && activeScreenSharerIds.includes(activeCall.peerUserId)) {
                              let stream = remoteScreenMapRef.current.get(activeCall.peerUserId) || null;
                              if (!stream || !stream.getVideoTracks().some((t) => t.readyState === "live")) {
                                const pc = peerConnectionRef.current || groupPeerConnectionsRef.current.get(activeCall.peerUserId);
                                if (pc) {
                                  const transceivers = pc.getTransceivers();
                                  const screenTr = transceivers.length > 2 ? transceivers[2] : transceivers.find((t, idx) => idx > 1 && t.receiver?.track?.kind === "video");
                                  if (screenTr?.receiver?.track && screenTr.receiver.track.readyState !== "ended") {
                                    screenTr.receiver.track.enabled = true;
                                    const fresh = new MediaStream([screenTr.receiver.track]);
                                    remoteScreenMapRef.current.set(activeCall.peerUserId, fresh);
                                    stream = fresh;
                                  }
                                }
                              }
                              active1to1Screens.push({
                                id: activeCall.peerUserId,
                                name: activeCall.targetName || "Remote Screen",
                                stream,
                                isLocal: false,
                              });
                            }

                            if (active1to1Screens.length > 0) {
                              return (
                                <div className="w-full h-full p-2 flex flex-col">
                                  <div className="flex-1 min-h-0 w-full">
                                    {active1to1Screens.length === 1 ? (
                                      <ScreenShareView
                                        stream={active1to1Screens[0].stream}
                                        name={active1to1Screens[0].name}
                                        isLocal={active1to1Screens[0].isLocal}
                                        isFocused={true}
                                      />
                                    ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 h-full w-full">
                                        {active1to1Screens.map((s) => (
                                          <ScreenShareView
                                            key={s.id}
                                            stream={s.stream}
                                            name={s.name}
                                            isLocal={s.isLocal}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            const hasLiveVideo = activeCall.type === "VIDEO" && Boolean(remoteStream?.getVideoTracks().some((t) => t.readyState === "live")) && (!activeCall.peerUserId || !remoteVideoOffMap.get(activeCall.peerUserId));

                            if (hasLiveVideo) {
                              return !swap1to1View ? (
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
                              );
                            }

                            return (
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
                                  <div className="w-24 h-24 bg-gradient-to-br from-orange-500/20 to-rose-500/20 text-orange-400 rounded-full flex items-center justify-center border border-orange-500/40 text-3xl font-extrabold shadow-xl">
                                    {activeCall.targetName ? activeCall.targetName.charAt(0).toUpperCase() : "U"}
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
                            );
                          })()}

                          {/* 1-on-1 PiP Window in corner */}
                          {(activeCall.type === "VIDEO" || isScreenSharing) && (
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

                    {/* Zoom-Style In-Call Drawers (Participants & Chat) */}
                    {showParticipantsDrawer && (
                      <div className="fixed inset-x-2 bottom-20 top-16 sm:static sm:inset-auto sm:w-80 sm:h-full bg-slate-900 border border-slate-700/80 rounded-2xl flex flex-col z-40 shadow-2xl overflow-hidden animate-in fade-in duration-150">
                        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-orange-400" />
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                              Participants ({remoteParticipants.length + 1})
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowParticipantsDrawer(false)}
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Participant list */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 select-none">
                          {/* Current User (You) */}
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                              </div>
                              <div className="truncate">
                                <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                  <span>{session?.user?.name || "You"}</span>
                                  <span className="text-[10px] text-orange-400 font-semibold">(You)</span>
                                  {activeCall.isHost && (
                                    <span className="px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 text-[9px] font-bold border border-orange-500/30">
                                      Host
                                    </span>
                                  )}
                                </p>
                                <span className="text-[10px] text-slate-400 truncate block">
                                  {session?.user?.email}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {isMicMuted || hasNoMic ? (
                                <MicOff className="w-3.5 h-3.5 text-rose-400" />
                              ) : (
                                <Mic className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                              {isCamOff ? (
                                <VideoOff className="w-3.5 h-3.5 text-rose-400" />
                              ) : (
                                <Video className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                            </div>
                          </div>

                          {/* Remote Participants */}
                          {(() => {
                            const remoteUserIds = Array.from(
                              new Set([
                                ...meetingParticipantIds.filter((id) => id !== session?.user?.id),
                                ...remoteParticipants.map((p) => p.userId),
                              ])
                            );

                            return remoteUserIds.map((userId) => {
                              const emp = employees.find((e) => e.id === userId);
                              const pName = emp?.name || `Participant #${userId}`;
                              const p = remoteParticipants.find((item) => item.userId === userId);
                              const hasVideo = p?.stream?.getVideoTracks().some((t) => t.readyState !== "ended" && t.enabled);
                              const isRemoteHost = activeCall.meetingOrganizerId === userId;
                              const isRemoteVideoOff = remoteVideoOffMap.get(userId) || false;

                              return (
                                <div
                                  key={userId}
                                  onClick={() => setFocusedParticipantId(userId)}
                                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${focusedParticipantId === userId
                                    ? "bg-slate-800 border-orange-500/60 ring-1 ring-orange-500/30"
                                    : "bg-slate-800/40 hover:bg-slate-800/70 border-slate-800"
                                    }`}
                                  title="Click to pin to stage"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-orange-400 border border-slate-600 shrink-0">
                                      {pName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="truncate">
                                      <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                        <span>{pName}</span>
                                        {isRemoteHost && (
                                          <span className="px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 text-[9px] font-bold border border-orange-500/30">
                                            Host
                                          </span>
                                        )}
                                      </p>
                                      <span className="text-[10px] text-slate-400 truncate block">
                                        {emp?.role?.name || "Attendee"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                    {/* Host Moderation Controls */}
                                    {activeCall.isHost && (
                                      <div className="flex items-center gap-1 mr-1 border-r border-slate-700/80 pr-1.5" onClick={(e) => e.stopPropagation()}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!activeCall.callSessionId || !socket) return;
                                            socket.emit("call:mute-participant", {
                                              callSessionId: activeCall.callSessionId,
                                              targetUserId: userId,
                                            });
                                            showSuccessToast(`Muted ${pName}`);
                                          }}
                                          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 flex items-center justify-center transition border border-slate-700"
                                          title={`Mute ${pName} (Host)`}
                                        >
                                          <MicOff className="w-3 h-3" />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (!activeCall.callSessionId || !socket) return;
                                            const isConfirmed = await showConfirmDialog({
                                              title: `Remove ${pName}?`,
                                              text: `Are you sure you want to remove ${pName} from this meeting?`,
                                              confirmButtonText: "Yes, remove",
                                              confirmButtonColor: "#dc2626",
                                              icon: "warning",
                                            });
                                            if (!isConfirmed) return;
                                            socket.emit("call:kick-participant", {
                                              callSessionId: activeCall.callSessionId,
                                              targetUserId: userId,
                                            });
                                            showSuccessToast(`Removed ${pName} from meeting`);
                                          }}
                                          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-400 flex items-center justify-center transition border border-slate-700"
                                          title={`Remove ${pName} from meeting (Host)`}
                                        >
                                          <UserX className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}

                                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                                    {isRemoteVideoOff ? (
                                      <VideoOff className="w-3.5 h-3.5 text-slate-500" />
                                    ) : hasVideo ? (
                                      <Video className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <span className="text-[9px] font-mono text-emerald-400 font-bold px-1 rounded bg-slate-800">audio</span>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>

                        {/* Drawer Footer: Invite Button */}
                        <div className="p-3 border-t border-slate-800 bg-slate-900/90 shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowAddMemberModal(true)}
                            className="w-full py-2 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Invite Colleagues</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Zoom-Style Chat Drawer */}
                    {showChatDrawer && (
                      <div className="fixed inset-x-2 bottom-20 top-16 sm:static sm:inset-auto sm:w-80 sm:h-full bg-slate-900 border border-slate-700/80 rounded-2xl flex flex-col z-40 shadow-2xl overflow-hidden animate-in fade-in duration-150">
                        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-orange-400" />
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                              Meeting Chat
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowChatDrawer(false)}
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Chat Messages Body */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                          {chatMessages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 text-xs select-none">
                              <MessageSquare className="w-8 h-8 text-slate-600 mb-2" />
                              <p className="font-semibold text-slate-300">No chat messages yet</p>
                              <p className="text-[11px] text-slate-400 mt-1">
                                Messages sent here are visible to everyone currently in this meeting.
                              </p>
                            </div>
                          ) : (
                            chatMessages.map((msg) => {
                              const isMe = msg.senderId === session?.user?.id;
                              const timeStr = msg.createdAt
                                ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                : "";

                              return (
                                <div
                                  key={msg.id}
                                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                                >
                                  <div className="flex items-center gap-1.5 mb-1 px-1">
                                    <span className="text-[10px] font-bold text-slate-400">
                                      {isMe ? "You" : msg.senderName}
                                    </span>
                                    {timeStr && (
                                      <span className="text-[9px] text-slate-400">{timeStr}</span>
                                    )}
                                  </div>
                                  <div
                                    className={`rounded-2xl px-3 py-2 text-xs max-w-[85%] break-words ${isMe
                                      ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md rounded-br-xs"
                                      : "bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-xs"
                                      }`}
                                  >
                                    {msg.text}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Chat Input Footer */}
                        <form
                          onSubmit={sendMeetingChatMessage}
                          className="p-2.5 border-t border-slate-800 bg-slate-900/90 flex items-center gap-2 shrink-0"
                        >
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 h-9 px-3 text-xs bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                          />
                          <button
                            type="submit"
                            disabled={!chatInput.trim()}
                            className="w-9 h-9 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition cursor-pointer shrink-0 shadow-sm"
                            title="Send Message"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* Call Control Toolbar */}
                  <div className="mt-2 sm:mt-4 pt-2 sm:pt-4 border-t border-slate-800 flex items-center justify-center gap-2 sm:gap-4 shrink-0 pb-1 sm:pb-0 overflow-x-auto overscroll-contain touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden px-1 select-none">
                    {/* Mute Mic / No Mic */}
                    {hasNoMic ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          retryConnectMic();
                        }}
                        className="touch-manipulation select-none active:scale-95 w-11 h-11 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-transform duration-75 shadow-lg bg-amber-500/20 border-2 border-amber-500 text-amber-400 hover:bg-amber-500/30 cursor-pointer shrink-0"
                        aria-label="No microphone active. Tap to enable phone built-in microphone."
                      >
                        <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 pointer-events-none" />
                        <span className="text-[7.5px] sm:text-[8px] font-bold pointer-events-none">No Mic</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMic();
                        }}
                        className={`touch-manipulation select-none active:scale-95 w-11 h-11 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-transform duration-75 shadow-lg shrink-0 cursor-pointer ${isMicMuted
                          ? "bg-rose-600/20 border-2 border-rose-500 text-rose-400"
                          : "bg-slate-800 border-2 border-slate-700 text-slate-200 hover:bg-slate-700"
                          }`}
                        aria-label={isMicMuted ? "Unmute Mic" : "Mute Mic"}
                      >
                        {isMicMuted ? (
                          <MicOff className="w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
                        ) : (
                          <Mic className="w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
                        )}
                        <span className="text-[7.5px] sm:text-[8px] font-bold pointer-events-none">{isMicMuted ? "Muted" : "Mic"}</span>
                      </button>
                    )}

                    {/* Camera Toggle — only for video */}
                    {activeCall.type === "VIDEO" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCam();
                        }}
                        className={`touch-manipulation select-none active:scale-95 w-11 h-11 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-transform duration-75 shadow-lg shrink-0 cursor-pointer ${isCamOff
                          ? "bg-rose-600/20 border-2 border-rose-500 text-rose-400"
                          : "bg-slate-800 border-2 border-slate-700 text-slate-200 hover:bg-slate-700"
                          }`}
                        aria-label={isCamOff ? "Turn Camera On" : "Turn Camera Off"}
                      >
                        {isCamOff ? (
                          <VideoOff className="w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
                        ) : (
                          <Video className="w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
                        )}
                        <span className="text-[7.5px] sm:text-[8px] font-bold pointer-events-none">{isCamOff ? "Cam Off" : "Camera"}</span>
                      </button>
                    )}

                    {/* Screen Share Toggle — available in all video calls, meetings, and standup rooms */}
                    {Boolean(
                      activeCall.type === "VIDEO" ||
                      activeCall.isGroupCall ||
                      activeCall.meetingId ||
                      activeCall.channelName?.includes("standup") ||
                      activeCall.channelName?.includes("permanent") ||
                      activeCall.channelName?.startsWith("meeting-") ||
                      activeCall.channelName?.startsWith("room-") ||
                      activeCall.targetName?.toLowerCase().includes("meeting") ||
                      activeCall.targetName?.toLowerCase().includes("standup")
                    ) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleScreenShare();
                          }}
                          className={`touch-manipulation select-none active:scale-95 w-11 h-11 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-transform duration-75 shadow-lg cursor-pointer shrink-0 ${isScreenSharing
                            ? "bg-slate-700 border-2 border-slate-400 text-slate-100 hover:bg-slate-600"
                            : "bg-slate-800 border-2 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-500"
                            }`}
                          aria-label={isScreenSharing ? "Stop Sharing Screen" : "Share Your Screen"}
                        >
                          {isScreenSharing ? (
                            <ScreenShareOff className="w-4 h-4 sm:w-5 sm:h-5 text-slate-100 pointer-events-none" />
                          ) : (
                            <ScreenShare className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300 pointer-events-none" />
                          )}
                          <span className="text-[7.5px] sm:text-[8px] font-bold pointer-events-none">
                            {isScreenSharing ? "Stop Share" : "Share"}
                          </span>
                        </button>
                      )}

                    {/* Speaker / Loudspeaker Mode Toggle */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSpeaker();
                      }}
                      className={`touch-manipulation select-none active:scale-95 w-11 h-11 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-transform duration-75 shadow-lg cursor-pointer shrink-0 ${isSpeakerOn
                        ? "bg-orange-500/20 border-2 border-orange-500 text-orange-400 hover:bg-orange-500/30"
                        : "bg-slate-800 border-2 border-slate-700 text-slate-300 hover:bg-slate-700"
                        }`}
                      aria-label={isSpeakerOn ? "Speaker ON (Loudspeaker / Hands-Free mode)" : "Speaker Normal"}
                    >
                      {isSpeakerOn ? (
                        <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 pointer-events-none" />
                      ) : (
                        <Volume1 className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300 pointer-events-none" />
                      )}
                      <span className="text-[7.5px] sm:text-[8px] font-bold pointer-events-none">{isSpeakerOn ? "Speaker" : "Normal"}</span>
                    </button>

                    {/* People / Participants Drawer Toggle */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowParticipantsDrawer((prev) => !prev);
                        setShowChatDrawer(false);
                      }}
                      className={`relative touch-manipulation select-none active:scale-95 w-11 h-11 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-transform duration-75 shadow-lg cursor-pointer shrink-0 ${showParticipantsDrawer
                        ? "bg-orange-500/20 border-2 border-orange-500 text-orange-400"
                        : "bg-slate-800 border-2 border-slate-700 text-slate-300 hover:bg-slate-700"
                        }`}
                      aria-label="View Participants"
                    >
                      <Users className="w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
                      <span className="text-[7.5px] sm:text-[8px] font-bold pointer-events-none">People</span>
                      <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-slate-900 border border-slate-600 text-slate-200 pointer-events-none">
                        {Math.max(meetingParticipantIds.length || 0, remoteParticipants.length + 1, 1)}
                      </span>
                    </button>

                    {/* In-Meeting Chat Toggle */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowChatDrawer((prev) => !prev);
                        setShowParticipantsDrawer(false);
                        setUnreadChatCount(0);
                      }}
                      className={`relative touch-manipulation select-none active:scale-95 w-11 h-11 sm:w-14 sm:h-14 rounded-full font-bold flex flex-col items-center justify-center gap-0.5 transition-transform duration-75 shadow-lg cursor-pointer shrink-0 ${showChatDrawer
                        ? "bg-orange-500/20 border-2 border-orange-500 text-orange-400"
                        : "bg-slate-800 border-2 border-slate-700 text-slate-300 hover:bg-slate-700"
                        }`}
                      aria-label="Meeting Chat"
                    >
                      <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
                      <span className="text-[7.5px] sm:text-[8px] font-bold pointer-events-none">Chat</span>
                      {unreadChatCount > 0 && !showChatDrawer && (
                        <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-orange-500 text-white animate-pulse pointer-events-none">
                          {unreadChatCount}
                        </span>
                      )}
                    </button>

                    {/* ============ ENHANCED END / LEAVE CALL BUTTON ============ */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHangupClick();
                      }}
                      className="relative touch-manipulation select-none active:scale-95 w-12 h-11 sm:w-20 sm:h-14 rounded-full sm:rounded-2xl text-white font-black text-sm flex flex-col items-center justify-center gap-0.5 transition-transform duration-75 cursor-pointer shrink-0"
                      style={{
                        background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                        boxShadow: "0 0 25px rgba(220,38,38,0.5), 0 4px 15px rgba(0,0,0,0.4)",
                      }}
                      aria-label={activeCall?.isGroupCall && !activeCall?.isHost && session?.user?.role !== "SUPER_ADMIN" ? "Leave Call" : "End Call"}
                    >
                      {/* Pulse ring animation */}
                      <span
                        className="absolute inset-0 rounded-full sm:rounded-2xl animate-ping pointer-events-none"
                        style={{ background: "rgba(220,38,38,0.3)", animationDuration: "1.5s" }}
                      />
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 relative z-10 pointer-events-none" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                      </svg>
                      <span className="text-[7.5px] sm:text-[9px] font-extrabold relative z-10 tracking-wide pointer-events-none">
                        {activeCall?.isGroupCall && !activeCall?.isHost && session?.user?.role !== "SUPER_ADMIN" ? "LEAVE" : "END"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

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

          {/* Zoom-Style Meeting Ended Screen */}
          {meetingEndedInfo && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
              <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-md w-full p-6 sm:p-8 text-center text-white shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
                <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500/40 text-rose-400 mx-auto flex items-center justify-center shadow-lg">
                  <PhoneOff className="w-8 h-8" />
                </div>

                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                    Meeting Ended
                  </div>
                  <h3 className="text-lg font-black text-white">
                    {meetingEndedInfo.meetingTitle || "Meeting Concluded"}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1.5">
                    This meeting has ended for all participants by <strong className="text-orange-400">{meetingEndedInfo.endedByName}</strong>.
                  </p>
                </div>

                <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/60 text-xs space-y-2 text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Total Duration:</span>
                    <span className="font-mono font-bold text-white">{meetingEndedInfo.duration || "00:00"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-200 border border-slate-600">
                      Ended
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMeetingEndedInfo(null);
                      router.push("/dashboard/meetings");
                    }}
                    className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg transition cursor-pointer active:scale-95"
                  >
                    Back to Meetings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMeetingEndedInfo(null);
                      router.push("/dashboard");
                    }}
                    className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer active:scale-95"
                  >
                    Go to Dashboard
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
