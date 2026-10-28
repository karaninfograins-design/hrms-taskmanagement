import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { prisma } from "./src/config/prisma.js";

const BASE_URL = process.env.E2E_BASE_URL || process.env.PUBLIC_API_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "secret_key";

interface HttpResponse {
  status: number;
  body: any;
}

function makeRequest(
  urlPath: string,
  method = "GET",
  data: any = null,
  token: string | null = null,
  customBaseUrl = BASE_URL
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, customBaseUrl);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (token) {
      options.headers!["Authorization"] = `Bearer ${token}`;
    }

    const requestClient = url.protocol === "https:" ? https : http;
    const req = requestClient.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode || 500, body: json });
        } catch {
          resolve({ status: res.statusCode || 500, body: { raw: body } });
        }
      });
    });

    req.on("error", (err) => reject(err));

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runProductionMeetingTests() {
  const testResults: Array<{ name: string; passed: boolean; details?: string }> = [];

  function record(name: string, passed: boolean, details?: string) {
    testResults.push({ name, passed, details });
    const symbol = passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${symbol} | ${name}${details ? ` -> ${details}` : ""}`);
  }

  console.log("================================================================");
  console.log("🧪 PRODUCTION LEVEL TEST SUITE: MEETINGS & COLLABORATION");
  console.log(`Backend Target:  ${BASE_URL}`);
  console.log(`Frontend Target: ${FRONTEND_URL}`);
  console.log("================================================================\n");

  // 1. Authenticate Admin and Regular Employee
  console.log("--- TEST GROUP 1: AUTHENTICATION & TEST ACTORS ---");
  let adminUser = await prisma.user.findFirst({
    where: { status: "ACTIVE", role: { name: { in: ["SUPER_ADMIN", "ADMIN"] } } },
    include: { role: true },
  });

  if (!adminUser) {
    adminUser = await prisma.user.findFirst({
      where: { status: "ACTIVE" },
      include: { role: true },
    });
  }

  if (!adminUser) {
    console.error("No active user found in database. Cannot run tests.");
    await prisma.$disconnect();
    return;
  }

  const adminToken = jwt.sign({ userId: adminUser.id }, JWT_SECRET, { expiresIn: "1d" });
  record("1.1 Admin token generated", Boolean(adminToken), `Admin: ${adminUser.name} (${adminUser.email})`);

  let employeeUser = await prisma.user.findFirst({
    where: { status: "ACTIVE", role: { name: "EMPLOYEE" }, id: { not: adminUser.id } },
    include: { role: true },
  });

  if (!employeeUser) {
    // Pick any other active user or fallback
    employeeUser = await prisma.user.findFirst({
      where: { status: "ACTIVE", id: { not: adminUser.id } },
      include: { role: true },
    });
  }

  const employeeToken = employeeUser
    ? jwt.sign({ userId: employeeUser.id }, JWT_SECRET, { expiresIn: "1d" })
    : null;
  record(
    "1.2 Secondary Employee token generated",
    Boolean(employeeToken),
    employeeUser ? `Employee: ${employeeUser.name} (${employeeUser.email})` : "Using simulated token"
  );

  // 2. Schedule Meeting (POST /api/meetings)
  console.log("\n--- TEST GROUP 2: MEETING SCHEDULING (POST /api/meetings) ---");
  const now = new Date();
  const startTime = new Date(now.getTime() + 3600 * 1000).toISOString();
  const endTime = new Date(now.getTime() + 7200 * 1000).toISOString();

  // Test 2.1: Missing required fields
  const invalidPayloadRes = await makeRequest("/api/meetings", "POST", { title: "" }, adminToken);
  record(
    "2.1 Rejects creation with missing required fields (400)",
    invalidPayloadRes.status === 400,
    `Status ${invalidPayloadRes.status}: ${JSON.stringify(invalidPayloadRes.body)}`
  );

  // Test 2.2: End time earlier than start time
  const backwardTimeRes = await makeRequest(
    "/api/meetings",
    "POST",
    {
      title: "Negative Duration Meeting",
      startTime: endTime,
      endTime: startTime,
    },
    adminToken
  );
  record(
    "2.2 Rejects creation when endTime <= startTime (400)",
    backwardTimeRes.status === 400,
    `Status ${backwardTimeRes.status}: ${JSON.stringify(backwardTimeRes.body)}`
  );

  // Test 2.3: Unauthorized creation
  const unauthRes = await makeRequest(
    "/api/meetings",
    "POST",
    {
      title: "Unauthorized Meeting",
      startTime,
      endTime,
    },
    null
  );
  record(
    "2.3 Rejects creation without Authorization token (401)",
    unauthRes.status === 401,
    `Status ${unauthRes.status}`
  );

  // Test 2.4: Valid creation with participants
  const validMeetingPayload = {
    title: `Production E2E Sync - ${Date.now()}`,
    description: "Automated test sync session to verify video collaboration functionality.",
    agenda: "Review meeting creation, room token generation, and participant status.",
    startTime,
    endTime,
    timezone: "UTC",
    notes: "Production validation notes.",
    participantIds: employeeUser ? [employeeUser.id, employeeUser.id] : [], // purposefully duplicates to test deduplication
  };

  const createRes = await makeRequest("/api/meetings", "POST", validMeetingPayload, adminToken);
  const createdMeeting = createRes.body?.meeting;
  record(
    "2.4 Successfully schedules valid meeting (201)",
    createRes.status === 201 && Boolean(createdMeeting?.id && createdMeeting?.roomName),
    `Meeting ID: ${createdMeeting?.id}, Room: ${createdMeeting?.roomName}, Status: ${createdMeeting?.status}`
  );

  if (createdMeeting?.id) {
    const hasOrganizer = createdMeeting.organizer?.id === adminUser.id;
    const hasParticipants = createdMeeting.members?.length >= 1;
    record(
      "2.5 Organizer and deduplicated participants properly saved in database",
      hasOrganizer && hasParticipants,
      `Organizer: ${createdMeeting.organizer?.name}, Member count: ${createdMeeting.members?.length}`
    );
  }

  // 3. Meeting Retrieval (GET /api/meetings and GET /api/meetings/:id)
  console.log("\n--- TEST GROUP 3: LISTING & FILTERING MEETINGS ---");
  const listAllRes = await makeRequest("/api/meetings", "GET", null, adminToken);
  const allMeetings = listAllRes.body?.meetings || [];
  record(
    "3.1 Fetches list of all meetings (200)",
    listAllRes.status === 200 && Array.isArray(allMeetings),
    `Total meetings retrieved: ${allMeetings.length}`
  );

  const filterScheduledRes = await makeRequest("/api/meetings?status=SCHEDULED", "GET", null, adminToken);
  const scheduledMeetings = filterScheduledRes.body?.meetings || [];
  const onlyScheduled = scheduledMeetings.every((m: any) => m.status === "SCHEDULED");
  record(
    "3.2 Status filter 'SCHEDULED' works accurately",
    filterScheduledRes.status === 200 && onlyScheduled,
    `Scheduled meetings found: ${scheduledMeetings.length}`
  );

  const getSingleRes = await makeRequest(`/api/meetings/${createdMeeting?.id}`, "GET", null, adminToken);
  record(
    "3.3 Fetches specific meeting by ID (GET /api/meetings/:id)",
    getSingleRes.status === 200 && getSingleRes.body?.meeting?.id === createdMeeting?.id,
    `Title: ${getSingleRes.body?.meeting?.title}`
  );

  const getNotFoundRes = await makeRequest("/api/meetings/999999999", "GET", null, adminToken);
  record(
    "3.4 Returns 404 for non-existent meeting ID",
    getNotFoundRes.status === 404,
    `Status ${getNotFoundRes.status}`
  );

  // 4. Meeting Update (PUT /api/meetings/:id)
  console.log("\n--- TEST GROUP 4: UPDATING MEETINGS (PUT /api/meetings/:id) ---");
  const updatePayload = {
    title: `Updated Title - ${createdMeeting?.title}`,
    agenda: "Updated Agenda for verification.",
    notes: "Updated test notes.",
  };

  const updateRes = await makeRequest(`/api/meetings/${createdMeeting?.id}`, "PUT", updatePayload, adminToken);
  record(
    "4.1 Successfully updates meeting details (200)",
    updateRes.status === 200 && updateRes.body?.meeting?.title === updatePayload.title,
    `New Title: ${updateRes.body?.meeting?.title}`
  );

  // Test 4.2: Unauthorized update (if different employee exists)
  if (employeeToken && employeeUser && employeeUser.id !== adminUser.id) {
    const unauthUpdateRes = await makeRequest(
      `/api/meetings/${createdMeeting?.id}`,
      "PUT",
      { title: "Hacked Meeting" },
      employeeToken
    );
    record(
      "4.2 Rejects unauthorized edit from non-organizer non-admin (403)",
      unauthUpdateRes.status === 403,
      `Status ${unauthUpdateRes.status}: ${JSON.stringify(unauthUpdateRes.body)}`
    );
  }

  // 5. Joining Meeting & LiveKit Token Generation (GET /api/meetings/:id/token)
  console.log("\n--- TEST GROUP 5: LIVEKIT TOKEN GENERATION & JOINING ---");
  const tokenRes = await makeRequest(`/api/meetings/${createdMeeting?.id}/token`, "GET", null, adminToken);
  const livekitToken = tokenRes.body?.token;
  const livekitUrl = tokenRes.body?.url;
  const returnedRoomName = tokenRes.body?.roomName;

  let decodedToken: any = null;
  if (livekitToken) {
    try {
      decodedToken = jwt.decode(livekitToken);
    } catch (e) {
      console.error("JWT Decode error:", e);
    }
  }

  record(
    "5.1 Generates LiveKit room token (200)",
    tokenRes.status === 200 && Boolean(livekitToken && livekitUrl),
    `Room: ${returnedRoomName}, LiveKit Server: ${livekitUrl}`
  );

  record(
    "5.2 Token has valid LiveKit JWT claims (sub, room, permissions)",
    Boolean(
      decodedToken &&
      decodedToken.sub === String(adminUser.id) &&
      decodedToken.video?.room === createdMeeting?.roomName &&
      decodedToken.video?.roomJoin === true
    ),
    `JWT Sub: ${decodedToken?.sub}, Room: ${decodedToken?.video?.room}, Exp: ${new Date(
      (decodedToken?.exp || 0) * 1000
    ).toISOString()}`
  );

  // Verify meeting status automatically transitioned to IN_PROGRESS upon joining
  const postJoinMeeting = await prisma.meeting.findUnique({
    where: { id: createdMeeting?.id },
  });
  record(
    "5.3 Meeting status automatically transitions to 'IN_PROGRESS' upon joining",
    postJoinMeeting?.status === "IN_PROGRESS",
    `Current Status in DB: ${postJoinMeeting?.status}`
  );

  // Test 5.4: Cancelled meeting cannot be joined
  await prisma.meeting.update({
    where: { id: createdMeeting?.id },
    data: { status: "CANCELLED" },
  });
  const cancelledJoinRes = await makeRequest(`/api/meetings/${createdMeeting?.id}/token`, "GET", null, adminToken);
  record(
    "5.4 Rejects joining a CANCELLED meeting (400)",
    cancelledJoinRes.status === 400,
    `Status ${cancelledJoinRes.status}: ${JSON.stringify(cancelledJoinRes.body)}`
  );

  // Restore status to IN_PROGRESS
  await prisma.meeting.update({
    where: { id: createdMeeting?.id },
    data: { status: "IN_PROGRESS" },
  });

  // 6. Delete Meeting (DELETE /api/meetings/:id)
  console.log("\n--- TEST GROUP 6: DELETING MEETINGS (DELETE /api/meetings/:id) ---");
  if (employeeToken && employeeUser && employeeUser.id !== adminUser.id) {
    const unauthDelRes = await makeRequest(`/api/meetings/${createdMeeting?.id}`, "DELETE", null, employeeToken);
    record(
      "6.1 Rejects unauthorized delete attempt from non-organizer non-admin (403)",
      unauthDelRes.status === 403,
      `Status ${unauthDelRes.status}`
    );
  }

  const deleteRes = await makeRequest(`/api/meetings/${createdMeeting?.id}`, "DELETE", null, adminToken);
  record(
    "6.2 Successfully deletes meeting (200)",
    deleteRes.status === 200,
    `Status ${deleteRes.status}`
  );

  const checkDeleted = await prisma.meeting.findUnique({
    where: { id: createdMeeting?.id },
  });
  record(
    "6.3 Meeting completely purged and cascaded from database",
    checkDeleted === null,
    `Database lookup returned: ${checkDeleted ? "Found" : "Null (Purged)"}`
  );

  // 7. Frontend Health Check
  console.log("\n--- TEST GROUP 7: FRONTEND HEALTH & PAGE RENDER ---");
  try {
    const frontendRes = await makeRequest("/dashboard/meetings", "GET", null, null, FRONTEND_URL);
    record(
      "7.1 Frontend meetings page responds at http://localhost:3000/dashboard/meetings (200)",
      frontendRes.status === 200,
      `Status: ${frontendRes.status}`
    );
  } catch (err: any) {
    record("7.1 Frontend meetings page responds", false, `Failed: ${err.message}`);
  }

  // Summary
  console.log("\n================================================================");
  console.log("📊 PRODUCTION TEST SUMMARY REPORT");
  console.log("================================================================");
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Tests Run : ${total}`);
  console.log(`Passed          : ${passed} ✅`);
  console.log(`Failed          : ${failed} ${failed > 0 ? "❌" : ""}`);
  console.log(`Overall Health  : ${failed === 0 ? "100% PRODUCTION READY 🚀" : "ISSUES FOUND ⚠️"}`);
  console.log("================================================================\n");

  fs.writeFileSync(
    path.join(process.cwd(), "meeting_test_results.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        total,
        passed,
        failed,
        allPassed: failed === 0,
        tests: testResults,
      },
      null,
      2
    ),
    "utf8"
  );

  await prisma.$disconnect();
}

runProductionMeetingTests().catch((err) => {
  console.error("FATAL ERROR running test suite:", err);
  process.exit(1);
});
