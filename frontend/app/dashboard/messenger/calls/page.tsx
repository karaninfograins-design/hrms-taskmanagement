"use client";

import { Suspense } from "react";
import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";
import { getApiUrl } from "@/lib/api-config";

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
    if (videoRef.current) videoRef.current.srcObject = participant.stream;
    if (audioRef.current) audioRef.current.srcObject = participant.stream;
  }, [participant.stream]);

  if (type === "AUDIO") {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <audio ref={audioRef} autoPlay />
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-2xl text-orange-400">
          🎙️
        </div>
        <p className="text-sm font-bold text-white">{name}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-40 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      <video ref={videoRef} autoPlay playsInline className="h-full min-h-40 w-full object-cover" />
      <span className="absolute bottom-2 left-2 rounded bg-slate-950/70 px-2 py-1 text-xs font-semibold text-white">
        {name}
      </span>
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={<main className="route-loading">Loading Calls...</main>}>
      <CallsContent />
    </Suspense>
  );
}

function CallsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isLoading, logout } = useAuth();
  const { socket } = useSocket();

  const [calls, setCalls] = useState<CallSession[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [targetEmpId, setTargetEmpId] = useState<string>("");
  const [callType, setCallType] = useState<"AUDIO" | "VIDEO">("VIDEO");

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

  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isCamOff, setIsCamOff] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const groupPeerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const pendingGroupPeerConnectionsRef = useRef<Map<number, Promise<RTCPeerConnection>>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localMediaPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const startedChannelRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
      if (!res.ok) return;
      const data = await res.json();
      setCalls(data.calls || []);
    } catch (err) {
      console.error("Error fetching calls:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCall = async (callId: number) => {
    if (!confirm("Are you sure you want to delete this call log?")) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/calls/${callId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        alert("Failed to delete call log");
        return;
      }
      setCalls((prev) => prev.filter((c) => c.id !== callId));
    } catch (err) {
      console.error("Error deleting call log:", err);
      alert("Error deleting call log");
    }
  };

  const handleClearAllCalls = async () => {
    if (!confirm("Are you sure you want to clear all call logs?")) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/calls`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        alert("Failed to clear call logs");
        return;
      }
      setCalls([]);
    } catch (err) {
      console.error("Error clearing call logs:", err);
      alert("Error clearing call logs");
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

  // Fetch employees
  useEffect(() => {
    if (!session?.token) return;
    fetch(`${getApiUrl()}/api/employees`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then((res) => res.json())
      .then((data) => setEmployees(data.employees || []))
      .catch((err) => console.error("Error fetching employees:", err));
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

    if (isIncomingCall || !channel || !session?.user || startedChannelRef.current === channel) return;
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
      void prepareGroupCallMedia(type).catch((error) => {
        console.error("Unable to access group call media:", error);
        alert("Allow microphone and camera access to start this call.");
        endWebRTCCall();
      });
    } else if (targetId) {
      const targetEmp = employees.find((e) => e.id === Number(targetId));
      setCurrentActiveCall({
        callSessionId,
        channelName: channel,
        targetName: targetEmp?.name || `Employee #${targetId}`,
        type,
        peerUserId: Number(targetId),
      });
      initiateWebRTC(Number(targetId), true, type);
    }
  }, [searchParams, employees, session?.user]);

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
      alert("Call was rejected by recipient");
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
        !call?.isGroupCall ||
        call.callSessionId !== callSessionId ||
        typeof session?.user.id !== "number"
      ) return;

      startTimer();
      for (const participantId of participantIds) {
        if (
          participantId !== session.user.id &&
          session.user.id < participantId &&
          !groupPeerConnectionsRef.current.has(participantId)
        ) {
          await createGroupPeerConnection(participantId, true);
        }
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
      if (activeCallRef.current?.isGroupCall) {
        const call = activeCallRef.current;
        if (!call.callSessionId || call.callSessionId !== callSessionId) return;
        const pc = await createGroupPeerConnection(fromUserId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushPendingIceCandidates(fromUserId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { targetUserId: fromUserId, answer, callSessionId });
        return;
      }
      if (!peerConnectionRef.current) return;
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
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
      if (activeCallRef.current?.isGroupCall) {
        if (activeCallRef.current.callSessionId !== callSessionId) return;
        const pc = groupPeerConnectionsRef.current.get(fromUserId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingIceCandidates(fromUserId, pc);
        return;
      }
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
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
      if (activeCallRef.current?.isGroupCall) {
        if (activeCallRef.current.callSessionId !== callSessionId) return;
        const pc = groupPeerConnectionsRef.current.get(fromUserId);
        if (!pc || !pc.remoteDescription) {
          const pending = pendingIceCandidatesRef.current.get(fromUserId) || [];
          pending.push(candidate);
          pendingIceCandidatesRef.current.set(fromUserId, pending);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        return;
      }
      if (peerConnectionRef.current && candidate) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    socket.on("incoming:call", onIncomingCall);
    socket.on("call:accepted", onCallAccepted);
    socket.on("call:rejected", onCallRejected);
    socket.on("call:ended", onCallEnded);
    socket.on("call:participant-joined", onParticipantJoined);
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
        localMediaPromiseRef.current = navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === "VIDEO",
        });
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
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
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
        const stream = event.streams[0];
        if (!stream) return;
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
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peerConnectionRef.current = pc;

      // Access User Media Stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "VIDEO",
      });

      localStreamRef.current = stream;
      if (localVideoRef.current && type === "VIDEO") {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("webrtc:ice-candidate", {
            targetUserId,
            candidate: event.candidate,
          });
        }
      };

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit("webrtc:offer", { targetUserId, offer });
      }
    } catch (err) {
      console.error("Error setting up WebRTC media:", err);
    }
  };

  // Accept Incoming Call
  const handleAcceptIncomingCall = async () => {
    if (!incomingCall || !socket) return;

    if (incomingCall.isGroupCall) {
      try {
        await prepareGroupCallMedia(incomingCall.type);
      } catch (error) {
        console.error("Unable to access group call media:", error);
        socket.emit("call:reject", { callSessionId: incomingCall.callSessionId });
        setIncomingCall(null);
        alert("Allow microphone and camera access to join this call.");
        return;
      }
    }

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
    socket.emit("call:accept", { callSessionId: incomingCall.callSessionId });

    if (!incomingCall.isGroupCall) {
      initiateWebRTC(incomingCall.caller.id, false, incomingCall.type);
    }
    setIncomingCall(null);
    startTimer();
  };

  // Reject Incoming Call
  const handleRejectIncomingCall = () => {
    if (!incomingCall || !socket) return;
    socket.emit("call:reject", { callSessionId: incomingCall.callSessionId });
    setIncomingCall(null);
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
    setRemoteParticipants([]);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setCurrentActiveCall(null);
    setCallDuration(0);
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
  const handleStartCallSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEmpId || !socket) return;

    const targetEmp = employees.find((e) => e.id === Number(targetEmpId));
    if (!targetEmp) return;

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
          alert(result?.error || "Unable to start the call");
          cleanupCall();
          return;
        }
        setCurrentActiveCall({ ...newCall, callSessionId: result.callSessionId });
      }
    );

    initiateWebRTC(targetEmp.id, true, callType);
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
                  className="px-3 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-500 text-slate-700 font-bold rounded-xl transition-all border border-slate-200 text-xs cursor-pointer"
                >
                  Clear All Logs
                </button>
              )}
              <button
                onClick={() => setShowStartModal(true)}
                className="px-3 py-2  bg-[#171717] hover:bg-[#EA580C] text-white font-bold rounded-xl transition-all shadow-xs text-xs flex items-center gap-2 cursor-pointer"
              >
                <span>📞</span> + New Call
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
                    {calls.map((call) => (
                      <tr key={call.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-bold flex items-center gap-2">
                          <span>{call.type === "VIDEO" ? "🎥" : "📞"}</span>
                          <span>{call.type} Call</span>
                        </td>
                        <td className="p-4 text-slate-900 font-semibold">{call.host.name}</td>
                        <td className="p-4 text-slate-500">
                          {call.participants.map((p) => p.user.name).join(", ")}
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                              call.status === "ACTIVE"
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
            </div>
          )}

          {/* Incoming Call Ringing Dialog Modal */}
          {incomingCall && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
              <div className="bg-slate-900 text-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-800 text-center space-y-6 animate-bounce">
                <div className="w-20 h-20 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center text-4xl mx-auto border-2 border-orange-500/40 animate-pulse">
                  {incomingCall.type === "VIDEO" ? "🎥" : "📞"}
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
                    className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xl flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                    title="Decline"
                  >
                    📵
                  </button>
                  <button
                    onClick={handleAcceptIncomingCall}
                    className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xl flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                    title="Accept"
                  >
                    📞
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active WebRTC Call Screen Overlay */}
          {activeCall && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
              <div className="bg-slate-900 text-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-800 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span>{activeCall.type === "VIDEO" ? "🎥" : "🎙️"}</span>
                      <span>{activeCall.isGroupCall ? `Group call: ${activeCall.targetName}` : `Call with ${activeCall.targetName}`}</span>
                    </h2>
                    <p className="text-xs text-emerald-400 font-mono font-bold mt-0.5">
                      ⏱️ Duration: {formatTime(callDuration)}
                    </p>
                  </div>
                  <button
                    onClick={endWebRTCCall}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all"
                  >
                    End Call
                  </button>
                </div>

                {/* Video Streams Display */}
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
                        <div className="col-span-full flex items-center justify-center text-sm text-slate-400">
                          Waiting for group members to join...
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
                        <div className="text-center space-y-3">
                          <div className="w-24 h-24 bg-slate-800 text-orange-400 rounded-full flex items-center justify-center text-4xl mx-auto border border-slate-700">
                            🎙️
                          </div>
                          <p className="text-sm font-bold text-white">{activeCall.targetName}</p>
                          <p className="text-xs text-slate-400">Audio Stream Active</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Local Video Stream Preview */}
                  {activeCall.type === "VIDEO" && (
                    <div className="absolute bottom-4 right-4 w-40 h-28 bg-slate-900 border-2 border-slate-700 rounded-xl overflow-hidden shadow-xl">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>

                {/* Call Control Toolbar */}
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-center gap-4">
                  <button
                    onClick={toggleMic}
                    className={`w-12 h-12 rounded-full font-bold text-lg flex items-center justify-center transition-all ${
                      isMicMuted ? "bg-rose-600 text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                    title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
                  >
                    {isMicMuted ? "🎙️❌" : "🎙️"}
                  </button>

                  {activeCall.type === "VIDEO" && (
                    <button
                      onClick={toggleCam}
                      className={`w-12 h-12 rounded-full font-bold text-lg flex items-center justify-center transition-all ${
                        isCamOff ? "bg-rose-600 text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      }`}
                      title={isCamOff ? "Turn Camera On" : "Turn Camera Off"}
                    >
                      {isCamOff ? "🎥❌" : "🎥"}
                    </button>
                  )}

                  <button
                    onClick={endWebRTCCall}
                    className="w-14 h-12 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-1 shadow-lg"
                  >
                    <span>🛑</span> End
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
                        className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                          callType === "VIDEO"
                            ? "bg-orange-50 border-orange-500 text-orange-700"
                            : "bg-slate-50 border-slate-200 text-slate-600"
                        }`}
                      >
                        🎥 Video Call
                      </button>
                      <button
                        type="button"
                        onClick={() => setCallType("AUDIO")}
                        className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                          callType === "AUDIO"
                            ? "bg-orange-50 border-orange-500 text-orange-700"
                            : "bg-slate-50 border-slate-200 text-slate-600"
                        }`}
                      >
                        📞 Audio Call
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
