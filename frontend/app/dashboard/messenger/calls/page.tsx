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
  } | null>(null);

  const [activeCall, setActiveCall] = useState<{
    callSessionId?: number;
    channelName: string;
    targetName: string;
    type: "AUDIO" | "VIDEO";
    peerUserId: number;
  } | null>(null);

  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isCamOff, setIsCamOff] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    if (session?.token) {
      fetchCalls();
    }
  }, [session?.token]);

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

    if (channel && targetId && session?.user) {
      const targetEmp = employees.find((e) => e.id === Number(targetId));
      setActiveCall({
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

    const onIncomingCall = (data: any) => {
      setIncomingCall(data);
    };

    const onCallAccepted = (data: { callSessionId: number; userId: number }) => {
      startTimer();
    };

    const onCallRejected = () => {
      alert("Call was rejected by recipient");
      endWebRTCCall();
    };

    const onCallEnded = () => {
      endWebRTCCall();
    };

    const onWebRTCOffer = async ({ fromUserId, offer }: any) => {
      if (!peerConnectionRef.current) return;
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit("webrtc:answer", { targetUserId: fromUserId, answer });
    };

    const onWebRTCAnswer = async ({ offer, answer }: any) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const onWebRTCIceCandidate = async ({ candidate }: any) => {
      if (peerConnectionRef.current && candidate) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    socket.on("incoming:call", onIncomingCall);
    socket.on("call:accepted", onCallAccepted);
    socket.on("call:rejected", onCallRejected);
    socket.on("call:ended", onCallEnded);
    socket.on("webrtc:offer", onWebRTCOffer);
    socket.on("webrtc:answer", onWebRTCAnswer);
    socket.on("webrtc:ice-candidate", onWebRTCIceCandidate);

    return () => {
      socket.off("incoming:call", onIncomingCall);
      socket.off("call:accepted", onCallAccepted);
      socket.off("call:rejected", onCallRejected);
      socket.off("call:ended", onCallEnded);
      socket.off("webrtc:offer", onWebRTCOffer);
      socket.off("webrtc:answer", onWebRTCAnswer);
      socket.off("webrtc:ice-candidate", onWebRTCIceCandidate);
    };
  }, [socket]);

  const startTimer = () => {
    setCallDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  };

  // WebRTC Media & PeerConnection Initialization
  const initiateWebRTC = async (targetUserId: number, isCaller: boolean, type: "AUDIO" | "VIDEO") => {
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
      };

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

    socket.emit("call:accept", { callSessionId: incomingCall.callSessionId });
    setActiveCall({
      callSessionId: incomingCall.callSessionId,
      channelName: incomingCall.channelName,
      targetName: incomingCall.caller.name,
      type: incomingCall.type,
      peerUserId: incomingCall.caller.id,
    });

    initiateWebRTC(incomingCall.caller.id, false, incomingCall.type);
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
  const endWebRTCCall = () => {
    if (socket && activeCall?.callSessionId) {
      socket.emit("call:end", { callSessionId: activeCall.callSessionId });
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setActiveCall(null);
    setCallDuration(0);
    fetchCalls();
  };

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
    socket.emit("call:initiate", {
      targetUserId: targetEmp.id,
      type: callType,
      channelName,
    });

    setShowStartModal(false);
    setActiveCall({
      channelName,
      targetName: targetEmp.name,
      type: callType,
      peerUserId: targetEmp.id,
    });

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
              <p className="eyebrow">MESSENGER</p>
              <h1 className="text-2xl font-black text-slate-900">Audio & Video Calls</h1>
              <p className="text-xs text-slate-500 font-medium">
                Real-time WebRTC audio/video calling with instant signaling and session history.
              </p>
            </div>
            <button
              onClick={() => setShowStartModal(true)}
              className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs flex items-center gap-2"
            >
              <span>📞</span> Start New Call
            </button>
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
                  <h3 className="text-lg font-black text-white">{incomingCall.caller.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Incoming {incomingCall.type} Call...
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
                      <span>Call with {activeCall.targetName}</span>
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
                <div className="flex-1 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 relative flex items-center justify-center min-h-[360px]">
                  {/* Remote Video Stream */}
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
                      className="px-4 py-2.5 text-xs bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl shadow-xs"
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
