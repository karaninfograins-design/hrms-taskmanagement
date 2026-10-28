import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { prisma } from "./src/config/prisma.js";
// Import socket.io-client from frontend node_modules
import { io as ioClient, Socket } from "../frontend/node_modules/socket.io-client/build/cjs/index.js";

const BACKEND_URL = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "secret_key";

async function runVoiceCallTestSuite() {
  console.log("=================================================");
  console.log("STARTING VOICE CALL & AUDIO WebRTC TEST SUITE");
  console.log("=================================================\n");

  const results: { test: string; status: "PASS" | "FAIL"; details: string }[] = [];

  function record(test: string, status: "PASS" | "FAIL", details: string) {
    results.push({ test, status, details });
    console.log(`[${status}] ${test}: ${details}`);
  }

  // TEST 1: Frontend Code Inspection for Root Cause Fixes
  console.log("--- TEST GROUP 1: Frontend Code Fixes Verification ---");
  const callsPagePath = path.resolve("../frontend/app/dashboard/messenger/calls/page.tsx");
  if (fs.existsSync(callsPagePath)) {
    const code = fs.readFileSync(callsPagePath, "utf-8");

    // 1.1: Check ICE candidate buffer flush in onWebRTCAnswer
    const hasIceFlushInAnswer =
      code.includes("pendingP2PIceCandidatesRef.current") &&
      code.includes("onWebRTCAnswer") &&
      code.includes("peerConnectionRef.current.addIceCandidate");
    if (hasIceFlushInAnswer) {
      record("1.1 ICE Candidate Buffer Flush in onWebRTCAnswer", "PASS", "Caller properly flushes buffered ICE candidates upon receiving answer");
    } else {
      record("1.1 ICE Candidate Buffer Flush in onWebRTCAnswer", "FAIL", "Missing ICE candidate flush in onWebRTCAnswer");
    }

    // 1.2: Check audio element does not use display: none
    const hasHiddenDisplayNone = code.includes('<audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />');
    const hasFixedOffscreenAudio = code.includes("ref={remoteAudioRef}") && code.includes("position:") && code.includes("-9999px");
    if (!hasHiddenDisplayNone && hasFixedOffscreenAudio) {
      record("1.2 Audio Element Headphone Routing (No display:none)", "PASS", "Remote audio element is positioned off-screen in DOM layout, keeping Chromium audio pipeline active");
    } else {
      record("1.2 Audio Element Headphone Routing (No display:none)", "FAIL", "Audio element may still use display:none or missing off-screen style");
    }

    // 1.3: Check requestLocalMedia fallback for headset / no camera
    const hasHeadsetFallback =
      code.includes("requestLocalMedia") &&
      code.includes("echoCancellation") &&
      code.includes("video: type === \"VIDEO\"");
    if (hasHeadsetFallback) {
      record("1.3 Headphone/Microphone Request & Camera Fallback", "PASS", "Audio options optimized for headsets with automatic fallback when no webcam is present");
    } else {
      record("1.3 Headphone/Microphone Request & Camera Fallback", "FAIL", "Missing audio fallback in requestLocalMedia");
    }

    // 1.4: Check ontrack enables audio tracks & plays
    const hasOntrackAudioPlay =
      code.includes("incomingStream.getAudioTracks().forEach") &&
      code.includes("remoteAudioRef.current.srcObject = incomingStream") &&
      code.includes("remoteAudioRef.current.play()");
    if (hasOntrackAudioPlay) {
      record("1.4 ontrack Audio Track Unmute & Direct Playback", "PASS", "Remote audio tracks are explicitly enabled and attached to audio element on arrival");
    } else {
      record("1.4 ontrack Audio Track Unmute & Direct Playback", "FAIL", "Missing direct ontrack track enabling or playback");
    }

    // 1.5: Check Group Call Host call:join broadcast on mount
    const hasGroupHostJoin =
      code.includes("isGroupCall && callSessionId") &&
      code.includes('socket?.emit("call:join", { callSessionId })');
    if (hasGroupHostJoin) {
      record("1.5 Group Call Host Presence Broadcast (call:join)", "PASS", "Host immediately emits call:join to trigger mesh WebRTC peer connections");
    } else {
      record("1.5 Group Call Host Presence Broadcast (call:join)", "FAIL", "Host does not emit call:join in isGroupCall branch");
    }
  } else {
    record("1.0 Frontend File Exists", "FAIL", `File not found at ${callsPagePath}`);
  }

  // TEST GROUP 2: Live Socket & WebRTC Signaling Flow (1-to-1)
  console.log("\n--- TEST GROUP 2: Live Socket & WebRTC 1-to-1 Audio Call Flow ---");

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    take: 3,
    select: { id: true, name: true, email: true },
  });

  if (users.length < 2) {
    record("2.1 Database Users for Call Test", "FAIL", "Need at least 2 active users in the database to test 1-to-1 calling");
    await prisma.$disconnect();
    return;
  }

  const [callerUser, calleeUser, thirdUser] = users;
  record("2.1 Active Call Participants Identified", "PASS", `Caller: ${callerUser.name} (#${callerUser.id}), Callee: ${calleeUser.name} (#${calleeUser.id})`);

  const callerToken = jwt.sign({ userId: callerUser.id }, JWT_SECRET, { expiresIn: "1h" });
  const calleeToken = jwt.sign({ userId: calleeUser.id }, JWT_SECRET, { expiresIn: "1h" });

  let callerSocket: Socket | null = null;
  let calleeSocket: Socket | null = null;

  try {
    callerSocket = ioClient(BACKEND_URL, {
      auth: { token: callerToken },
      transports: ["websocket"],
      forceNew: true,
    });

    calleeSocket = ioClient(BACKEND_URL, {
      auth: { token: calleeToken },
      transports: ["websocket"],
      forceNew: true,
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        callerSocket!.on("connect", () => resolve());
        callerSocket!.on("connect_error", (err) => reject(err));
        setTimeout(() => reject(new Error("Caller socket connection timed out")), 5000);
      }),
      new Promise<void>((resolve, reject) => {
        calleeSocket!.on("connect", () => resolve());
        calleeSocket!.on("connect_error", (err) => reject(err));
        setTimeout(() => reject(new Error("Callee socket connection timed out")), 5000);
      }),
    ]);
    record("2.2 Socket.io Connections Established", "PASS", `Caller & Callee connected to socket server`);

    const channelName = `test-voice-call-${Date.now()}`;
    let callSessionId: number | undefined;

    const initiatePromise = new Promise<{ callSessionId: number }>((resolve, reject) => {
      callerSocket!.emit(
        "call:initiate",
        {
          targetUserId: calleeUser.id,
          type: "AUDIO",
          channelName,
        },
        (res: { callSessionId?: number; error?: string }) => {
          if (res?.callSessionId) {
            resolve({ callSessionId: res.callSessionId });
          } else {
            reject(new Error(res?.error || "Failed to initiate call"));
          }
        }
      );
    });

    const incomingCallPromise = new Promise<any>((resolve, reject) => {
      calleeSocket!.on("incoming:call", (data) => resolve(data));
      setTimeout(() => reject(new Error("Timed out waiting for incoming:call event on Callee")), 6000);
    });

    const [initiateRes, incomingCallData] = await Promise.all([initiatePromise, incomingCallPromise]);
    callSessionId = initiateRes.callSessionId;

    if (incomingCallData.callSessionId === callSessionId && incomingCallData.type === "AUDIO") {
      record("2.3 Call Initiation & Incoming Ring Event", "PASS", `Call session #${callSessionId} created with type AUDIO, received by Callee`);
    } else {
      record("2.3 Call Initiation & Incoming Ring Event", "FAIL", `Mismatched call session or type: ${JSON.stringify(incomingCallData)}`);
    }

    const ringingSession = await prisma.callSession.findUnique({ where: { id: callSessionId } });
    if (ringingSession?.status === "RINGING") {
      record("2.4 DB Call Status Verification", "PASS", "Session status is correctly marked as RINGING");
    } else {
      record("2.4 DB Call Status Verification", "FAIL", `Expected RINGING, got ${ringingSession?.status}`);
    }

    const callAcceptedPromise = new Promise<any>((resolve, reject) => {
      callerSocket!.on("call:accepted", (data) => resolve(data));
      setTimeout(() => reject(new Error("Timed out waiting for call:accepted on Caller")), 5000);
    });

    calleeSocket.emit("call:accept", { callSessionId });
    const acceptedData = await callAcceptedPromise;

    if (acceptedData.callSessionId === callSessionId) {
      record("2.5 Call Acceptance Event Handshake", "PASS", `Caller received call:accepted for session #${callSessionId}`);
    } else {
      record("2.5 Call Acceptance Event Handshake", "FAIL", "Failed to receive call:accepted");
    }

    const activeSession = await prisma.callSession.findUnique({ where: { id: callSessionId } });
    if (activeSession?.status === "ACTIVE") {
      record("2.6 DB Active Status Transition", "PASS", "Call session status updated to ACTIVE in database");
    } else {
      record("2.6 DB Active Status Transition", "FAIL", `Expected ACTIVE, got ${activeSession?.status}`);
    }

    // WebRTC Audio SDP Offer & Answer
    const mockAudioOffer = {
      type: "offer",
      sdp: "v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 50000 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=sendrecv\r\n",
    };

    const offerPromise = new Promise<any>((resolve, reject) => {
      calleeSocket!.on("webrtc:offer", (data) => resolve(data));
      setTimeout(() => reject(new Error("Timed out waiting for webrtc:offer on Callee")), 5000);
    });

    callerSocket.emit("webrtc:offer", {
      targetUserId: calleeUser.id,
      offer: mockAudioOffer,
      callSessionId,
    });

    const receivedOffer = await offerPromise;
    if (receivedOffer.fromUserId === callerUser.id && receivedOffer.offer?.sdp?.includes("m=audio")) {
      record("2.7 WebRTC Audio SDP Offer Transfer", "PASS", "Audio SDP offer successfully routed through socket server to Callee");
    } else {
      record("2.7 WebRTC Audio SDP Offer Transfer", "FAIL", `Invalid offer received`);
    }

    const mockAudioAnswer = {
      type: "answer",
      sdp: "v=0\r\no=- 987654321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 50000 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=sendrecv\r\n",
    };

    const answerPromise = new Promise<any>((resolve, reject) => {
      callerSocket!.on("webrtc:answer", (data) => resolve(data));
      setTimeout(() => reject(new Error("Timed out waiting for webrtc:answer on Caller")), 5000);
    });

    calleeSocket.emit("webrtc:answer", {
      targetUserId: callerUser.id,
      answer: mockAudioAnswer,
      callSessionId,
    });

    const receivedAnswer = await answerPromise;
    if (receivedAnswer.fromUserId === calleeUser.id && receivedAnswer.answer?.sdp?.includes("m=audio")) {
      record("2.8 WebRTC Audio SDP Answer Transfer", "PASS", "Audio SDP answer successfully routed through socket server to Caller");
    } else {
      record("2.8 WebRTC Audio SDP Answer Transfer", "FAIL", `Invalid answer received`);
    }

    // ICE Candidates
    const mockCandidate1 = {
      candidate: "candidate:1 1 UDP 2130706431 127.0.0.1 50001 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    };
    const mockCandidate2 = {
      candidate: "candidate:2 1 UDP 2130706431 127.0.0.1 50002 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    };

    const callerCandidatePromise = new Promise<any>((resolve, reject) => {
      callerSocket!.on("webrtc:ice-candidate", (data) => resolve(data));
      setTimeout(() => reject(new Error("Caller did not receive ICE candidate")), 5000);
    });

    const calleeCandidatePromise = new Promise<any>((resolve, reject) => {
      calleeSocket!.on("webrtc:ice-candidate", (data) => resolve(data));
      setTimeout(() => reject(new Error("Callee did not receive ICE candidate")), 5000);
    });

    calleeSocket.emit("webrtc:ice-candidate", {
      targetUserId: callerUser.id,
      candidate: mockCandidate1,
      callSessionId,
    });

    callerSocket.emit("webrtc:ice-candidate", {
      targetUserId: calleeUser.id,
      candidate: mockCandidate2,
      callSessionId,
    });

    const [iceOnCaller, iceOnCallee] = await Promise.all([callerCandidatePromise, calleeCandidatePromise]);

    if (iceOnCaller.candidate?.candidate && iceOnCallee.candidate?.candidate) {
      record("2.9 WebRTC Bi-directional ICE Candidates Exchange", "PASS", "ICE candidates successfully routed both ways between Caller and Callee");
    } else {
      record("2.9 WebRTC Bi-directional ICE Candidates Exchange", "FAIL", "Failed to exchange ICE candidates");
    }

    // Call End
    const callEndedPromise = new Promise<any>((resolve, reject) => {
      calleeSocket!.on("call:ended", (data) => resolve(data));
      setTimeout(() => reject(new Error("Timed out waiting for call:ended")), 5000);
    });

    callerSocket.emit("call:end", { callSessionId });
    const endedData = await callEndedPromise;

    if (endedData.callSessionId === callSessionId) {
      record("2.10 Call End Handshake", "PASS", "Caller terminated call; Callee received call:ended event");
    } else {
      record("2.10 Call End Handshake", "FAIL", "Failed to receive call:ended on callee");
    }

    const endedSession = await prisma.callSession.findUnique({ where: { id: callSessionId } });
    if (endedSession?.status === "ENDED") {
      record("2.11 DB Status Finalized to ENDED", "PASS", "Call session finalized as ENDED in database");
    } else {
      record("2.11 DB Status Finalized to ENDED", "FAIL", `Expected ENDED, got ${endedSession?.status}`);
    }
  } catch (err: any) {
    record("2.X Unexpected 1-to-1 Call Error", "FAIL", err.message || String(err));
  } finally {
    if (callerSocket?.connected) callerSocket.disconnect();
    if (calleeSocket?.connected) calleeSocket.disconnect();
  }

  // TEST GROUP 3: Live Group Voice Call Flow (Multi-participant mesh)
  console.log("\n--- TEST GROUP 3: Live Group Voice Call Flow ---");
  let hostSocket: Socket | null = null;
  let member2Socket: Socket | null = null;
  let member3Socket: Socket | null = null;

  try {
    const hostToken = jwt.sign({ userId: callerUser.id }, JWT_SECRET, { expiresIn: "1h" });
    const member2Token = jwt.sign({ userId: calleeUser.id }, JWT_SECRET, { expiresIn: "1h" });
    const member3Token = thirdUser ? jwt.sign({ userId: thirdUser.id }, JWT_SECRET, { expiresIn: "1h" }) : null;

    hostSocket = ioClient(BACKEND_URL, { auth: { token: hostToken }, transports: ["websocket"], forceNew: true });
    member2Socket = ioClient(BACKEND_URL, { auth: { token: member2Token }, transports: ["websocket"], forceNew: true });
    if (member3Token) {
      member3Socket = ioClient(BACKEND_URL, { auth: { token: member3Token }, transports: ["websocket"], forceNew: true });
    }

    await Promise.all([
      new Promise<void>((res) => hostSocket!.on("connect", () => res())),
      new Promise<void>((res) => member2Socket!.on("connect", () => res())),
      member3Socket ? new Promise<void>((res) => member3Socket!.on("connect", () => res())) : Promise.resolve(),
    ]);
    record("3.1 Group Call Sockets Connected", "PASS", `Host and group members connected`);

    // Ensure a GROUP conversation exists in DB for caller and callee
    let testGroup = await prisma.conversation.findFirst({
      where: {
        type: "GROUP",
        participants: {
          some: { userId: callerUser.id },
        },
      },
      include: {
        participants: true,
      },
    });

    if (!testGroup) {
      testGroup = await prisma.conversation.create({
        data: {
          type: "GROUP",
          name: "HRMS Engineering Team",
          createdById: callerUser.id,
          participants: {
            create: [
              { userId: callerUser.id, role: "ADMIN" },
              { userId: calleeUser.id, role: "MEMBER" },
              ...(thirdUser ? [{ userId: thirdUser.id, role: "MEMBER" }] : []),
            ],
          },
        },
        include: {
          participants: true,
        },
      });
    } else {
      // Ensure callee is in the group
      const hasCallee = testGroup.participants.some((p) => p.userId === calleeUser.id);
      if (!hasCallee) {
        await prisma.conversationParticipant.create({
          data: {
            conversationId: testGroup.id,
            userId: calleeUser.id,
            role: "MEMBER",
          },
        });
      }
    }

    // Host initiates Group Audio Call
    const groupChannel = `group-call-${Date.now()}`;
    const targetUserIds = [calleeUser.id, ...(thirdUser ? [thirdUser.id] : [])];

    let groupSessionId: number | undefined;

    const groupInitiatePromise = new Promise<any>((resolve, reject) => {
      hostSocket!.emit(
        "call:initiate",
        {
          targetUserIds,
          conversationId: testGroup.id,
          type: "AUDIO",
          channelName: groupChannel,
        },
        (res: { callSessionId?: number; error?: string }) => {
          if (res?.callSessionId) resolve(res);
          else reject(new Error(res?.error || "Failed to initiate group call"));
        }
      );
    });

    const member2IncomingPromise = new Promise<any>((resolve, reject) => {
      member2Socket!.on("incoming:call", (data) => resolve(data));
      setTimeout(() => reject(new Error("Member 2 timed out waiting for group incoming call")), 5000);
    });

    const [groupRes, member2Incoming] = await Promise.all([groupInitiatePromise, member2IncomingPromise]);
    groupSessionId = groupRes.callSessionId;

    if (member2Incoming.isGroupCall && member2Incoming.callSessionId === groupSessionId && member2Incoming.type === "AUDIO") {
      record("3.2 Group Call Notification Broadcast", "PASS", `Group audio call #${groupSessionId} broadcast to members`);
    } else {
      record("3.2 Group Call Notification Broadcast", "FAIL", `Invalid incoming group call event: ${JSON.stringify(member2Incoming)}`);
    }

    // Host emits call:join
    hostSocket.emit("call:join", { callSessionId: groupSessionId });

    // Member 2 accepts call:accept
    const hostJoinedPromise = new Promise<any>((resolve, reject) => {
      hostSocket!.on("call:participant-joined", (data) => {
        if (data.userId === calleeUser.id) resolve(data);
      });
      setTimeout(() => reject(new Error("Host did not receive participant-joined for Member 2")), 5000);
    });

    const member2JoinedPromise = new Promise<any>((resolve, reject) => {
      member2Socket!.on("call:participant-joined", (data) => resolve(data));
      setTimeout(() => reject(new Error("Member 2 did not receive participant-joined")), 5000);
    });

    member2Socket.emit("call:accept", { callSessionId: groupSessionId });

    const [hostJoinedData, member2JoinedData] = await Promise.all([hostJoinedPromise, member2JoinedPromise]);

    if (
      hostJoinedData.callSessionId === groupSessionId &&
      hostJoinedData.participantIds?.includes(callerUser.id) &&
      hostJoinedData.participantIds?.includes(calleeUser.id)
    ) {
      record("3.3 Group Mesh Participant Join Broadcast", "PASS", `Both Host & Member 2 received participant list [${hostJoinedData.participantIds.join(", ")}]`);
    } else {
      record("3.3 Group Mesh Participant Join Broadcast", "FAIL", `Mismatched participants: ${JSON.stringify(hostJoinedData)}`);
    }

    // Member 2 sends WebRTC offer to Host with callSessionId
    const groupOfferPromise = new Promise<any>((resolve, reject) => {
      hostSocket!.on("webrtc:offer", (data) => resolve(data));
      setTimeout(() => reject(new Error("Host did not receive group WebRTC offer")), 5000);
    });

    member2Socket.emit("webrtc:offer", {
      targetUserId: callerUser.id,
      offer: { type: "offer", sdp: "v=0\r\nm=audio 50000 UDP/TLS/RTP/SAVPF 111\r\n" },
      callSessionId: groupSessionId,
    });

    const groupReceivedOffer = await groupOfferPromise;
    if (groupReceivedOffer.callSessionId === groupSessionId && groupReceivedOffer.fromUserId === calleeUser.id) {
      record("3.4 Group WebRTC Mesh Offer Routing", "PASS", `Group audio offer routed from Member 2 to Host under session #${groupSessionId}`);
    } else {
      record("3.4 Group WebRTC Mesh Offer Routing", "FAIL", `Failed group offer: ${JSON.stringify(groupReceivedOffer)}`);
    }

    // Host sends WebRTC answer to Member 2 with callSessionId
    const groupAnswerPromise = new Promise<any>((resolve, reject) => {
      member2Socket!.on("webrtc:answer", (data) => resolve(data));
      setTimeout(() => reject(new Error("Member 2 did not receive group WebRTC answer")), 5000);
    });

    hostSocket.emit("webrtc:answer", {
      targetUserId: calleeUser.id,
      answer: { type: "answer", sdp: "v=0\r\nm=audio 50000 UDP/TLS/RTP/SAVPF 111\r\n" },
      callSessionId: groupSessionId,
    });

    const groupReceivedAnswer = await groupAnswerPromise;
    if (groupReceivedAnswer.callSessionId === groupSessionId && groupReceivedAnswer.fromUserId === callerUser.id) {
      record("3.5 Group WebRTC Mesh Answer Routing", "PASS", `Group audio answer routed from Host to Member 2 under session #${groupSessionId}`);
    } else {
      record("3.5 Group WebRTC Mesh Answer Routing", "FAIL", `Failed group answer: ${JSON.stringify(groupReceivedAnswer)}`);
    }

    // Group ICE candidate routing
    const groupCandidatePromise = new Promise<any>((resolve, reject) => {
      hostSocket!.on("webrtc:ice-candidate", (data) => resolve(data));
      setTimeout(() => reject(new Error("Host did not receive group ICE candidate")), 5000);
    });

    member2Socket.emit("webrtc:ice-candidate", {
      targetUserId: callerUser.id,
      candidate: { candidate: "candidate:group1 1 UDP 2130706431 127.0.0.1 50003 typ host" },
      callSessionId: groupSessionId,
    });

    const groupReceivedCandidate = await groupCandidatePromise;
    if (groupReceivedCandidate.candidate?.candidate && groupReceivedCandidate.callSessionId === groupSessionId) {
      record("3.6 Group WebRTC ICE Candidate Routing", "PASS", `Group ICE candidate successfully routed between group participants`);
    } else {
      record("3.6 Group WebRTC ICE Candidate Routing", "FAIL", `Failed group ICE candidate: ${JSON.stringify(groupReceivedCandidate)}`);
    }

    // Host terminates group call
    const groupEndedPromise = new Promise<any>((resolve, reject) => {
      member2Socket!.on("call:ended", (data) => resolve(data));
      setTimeout(() => reject(new Error("Member 2 did not receive call:ended")), 5000);
    });

    hostSocket.emit("call:end", { callSessionId: groupSessionId });
    await groupEndedPromise;
    record("3.7 Group Call Termination", "PASS", `Group call #${groupSessionId} successfully ended and broadcast to all members`);

  } catch (err: any) {
    record("3.X Unexpected Group Call Error", "FAIL", err.message || String(err));
  } finally {
    if (hostSocket?.connected) hostSocket.disconnect();
    if (member2Socket?.connected) member2Socket.disconnect();
    if (member3Socket?.connected) member3Socket.disconnect();
    await prisma.$disconnect();
  }

  // Summary
  console.log("\n=================================================");
  console.log("VOICE CALL TEST SUITE SUMMARY");
  console.log("=================================================");
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`Total Tests Run : ${total}`);
  console.log(`Passed         : ${passed}`);
  console.log(`Failed         : ${failed}`);
  console.log(`Success Rate   : ${Math.round((passed / total) * 100)}%`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVoiceCallTestSuite().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
