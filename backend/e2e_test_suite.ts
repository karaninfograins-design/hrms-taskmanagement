import http from "http";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "./src/config/prisma.js";

const BASE_URL = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_random_secret_key";

function makeRequest(path: string, method = "GET", data: any = null, token: string | null = null): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (token) {
      options.headers!["Authorization"] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode || 500, body: json });
        } catch (e) {
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

async function runE2ETests() {
  const logMessages: string[] = [];
  function log(msg: string) {
    console.log(msg);
    logMessages.push(msg);
  }

  log("=================================================");
  log("🚀 STARTING E2E WORKFLOW TEST SUITE FOR HRMS");
  log("=================================================\n");

  const ts = Date.now();

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
    log("🛑 No active user found in database for authentication. Exiting test.");
    await prisma.$disconnect();
    return;
  }

  const authToken = jwt.sign({ userId: adminUser.id }, JWT_SECRET, { expiresIn: "1d" });
  log(`✅ Authenticated Admin Token generated for User: ${adminUser.name} (${adminUser.email}), Role: ${adminUser.role.name}`);

  let createdEmployeeId: any = null;
  let createdProjectId: any = null;
  let createdEpicId: any = null;
  let createdSprintId: any = null;
  let createdTaskId: any = null;
  let createdSubtaskId: any = null;

  // STEP 1: Create Employee
  log("\n🔹 STEP 1: Creating New Employee...");
  const empPayload = {
    name: `E2E Tester ${ts}`,
    email: `e2e.emp.${ts}@infograins.com`,
    password: "Password123!",
    roleId: 3, // EMPLOYEE
    designationId: 1,
    department: "Engineering",
    joiningDate: "2026-01-01",
  };

  const empRes = await makeRequest("/api/employees", "POST", empPayload, authToken);
  if (empRes.status === 201 || empRes.status === 200) {
    createdEmployeeId = empRes.body.employee?.id || empRes.body.user?.id || empRes.body.id || empRes.body.item?.id;
    log(`✅ Employee Created Successfully! ID: ${createdEmployeeId}, Name: ${empPayload.name}`);
  } else {
    log(`❌ Employee Creation Response (${empRes.status}): ${JSON.stringify(empRes.body)}`);
  }

  // STEP 2: Create Project
  log("\n🔹 STEP 2: Creating New Project...");
  const projectPayload = {
    name: `E2E Project ${ts}`,
    key: `E2E${String(ts).slice(-3)}`,
    description: "Automated test project for verifying full work item hierarchy.",
    status: "ACTIVE",
    startDate: "2026-10-01",
    endDate: "2026-12-31",
  };

  const projRes = await makeRequest("/api/workspace/projects", "POST", projectPayload, authToken);
  if (projRes.status === 201 || projRes.status === 200) {
    createdProjectId = projRes.body.item?.id || projRes.body.project?.id || projRes.body.id;
    log(`✅ Project Created Successfully! ID: ${createdProjectId}, Key: ${projRes.body.item?.key || projectPayload.key}, Name: ${projectPayload.name}`);
  } else {
    log(`❌ Project Creation Response (${projRes.status}): ${JSON.stringify(projRes.body)}`);
  }

  if (!createdProjectId) {
    log("🛑 Cannot proceed without a valid Project ID. Exiting test.");
    await prisma.$disconnect();
    return;
  }

  // Add Created Employee to Project Team Members
  if (createdEmployeeId) {
    log(`\n🔹 STEP 2b: Assigning Employee (ID: ${createdEmployeeId}) to Project Team...`);
    const memberRes = await makeRequest(`/api/workspace/projects/${createdProjectId}/members`, "PUT", { userIds: [Number(createdEmployeeId)] }, authToken);
    if (memberRes.status === 200) {
      log(`✅ Employee added to Project ${createdProjectId} team members!`);
    } else {
      log(`⚠️ Team Assignment Response (${memberRes.status}): ${JSON.stringify(memberRes.body)}`);
    }
  }

  // STEP 3: Create Epic
  log("\n🔹 STEP 3: Creating Project Epic...");
  const epicPayload = {
    title: `E2E Core Architecture Epic ${ts}`,
    type: "EPIC",
    projectId: Number(createdProjectId),
    description: "Epic covering core infrastructure and API features.",
    status: "TODO",
    priority: "HIGH",
    assigneeId: createdEmployeeId ? Number(createdEmployeeId) : undefined,
  };

  const epicRes = await makeRequest("/api/workspace/work-items", "POST", epicPayload, authToken);
  if (epicRes.status === 201 || epicRes.status === 200) {
    createdEpicId = epicRes.body.item?.id || epicRes.body.workItem?.id || epicRes.body.id;
    log(`✅ Epic Created Successfully! ID: ${createdEpicId}, Title: ${epicPayload.title}`);
  } else {
    log(`❌ Epic Creation Response (${epicRes.status}): ${JSON.stringify(epicRes.body)}`);
  }

  // STEP 4: Create Sprint
  log("\n🔹 STEP 4: Creating Project Sprint...");
  const sprintPayload = {
    name: `E2E Sprint 1 (${ts})`,
    projectId: Number(createdProjectId),
    type: "WEEKLY",
    startDate: "2026-10-08",
    endDate: "2026-10-15",
  };

  const sprintRes = await makeRequest("/api/workspace/sprints", "POST", sprintPayload, authToken);
  if (sprintRes.status === 201 || sprintRes.status === 200) {
    createdSprintId = sprintRes.body.item?.id || sprintRes.body.sprint?.id || sprintRes.body.id;
    log(`✅ Sprint Created Successfully! ID: ${createdSprintId}, Name: ${sprintPayload.name}`);
  } else {
    log(`❌ Sprint Creation Response (${sprintRes.status}): ${JSON.stringify(sprintRes.body)}`);
  }

  // STEP 5: Create Task under Sprint & Epic
  log("\n🔹 STEP 5: Creating Task under Sprint & Epic...");
  const taskPayload = {
    title: `E2E Implement Feature Module ${ts}`,
    type: "TASK",
    projectId: Number(createdProjectId),
    sprintId: createdSprintId ? Number(createdSprintId) : undefined,
    parentId: createdEpicId ? Number(createdEpicId) : undefined,
    description: "Task item created under sprint iteration and epic.",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    assigneeId: createdEmployeeId ? Number(createdEmployeeId) : undefined,
  };

  const taskRes = await makeRequest("/api/workspace/work-items", "POST", taskPayload, authToken);
  if (taskRes.status === 201 || taskRes.status === 200) {
    createdTaskId = taskRes.body.item?.id || taskRes.body.workItem?.id || taskRes.body.id;
    log(`✅ Task Created Successfully! ID: ${createdTaskId}, Title: ${taskPayload.title}`);
  } else {
    log(`❌ Task Creation Response (${taskRes.status}): ${JSON.stringify(taskRes.body)}`);
  }

  // STEP 6: Create Subtask under Parent Task
  log("\n🔹 STEP 6: Creating Subtask under Parent Task...");
  const subtaskPayload = {
    title: `E2E Unit Test Verification ${ts}`,
    type: "SUBTASK",
    projectId: Number(createdProjectId),
    sprintId: createdSprintId ? Number(createdSprintId) : undefined,
    parentId: createdTaskId ? Number(createdTaskId) : undefined,
    description: "Subtask to verify task implementation unit tests.",
    status: "TODO",
    priority: "LOW",
  };

  const subtaskRes = await makeRequest("/api/workspace/work-items", "POST", subtaskPayload, authToken);
  if (subtaskRes.status === 201 || subtaskRes.status === 200) {
    createdSubtaskId = subtaskRes.body.item?.id || subtaskRes.body.workItem?.id || subtaskRes.body.id;
    log(`✅ Subtask Created Successfully! ID: ${createdSubtaskId}, Title: ${subtaskPayload.title}`);
  } else {
    log(`❌ Subtask Creation Response (${subtaskRes.status}): ${JSON.stringify(subtaskRes.body)}`);
  }

  log("\n=================================================");
  log("📊 END-TO-END FLOW TEST SUMMARY");
  log("=================================================");
  log(`1. Employee Created     : ${createdEmployeeId ? "✅ YES (ID: " + createdEmployeeId + ")" : "❌ FAILED"}`);
  log(`2. Project Created      : ${createdProjectId ? "✅ YES (ID: " + createdProjectId + ")" : "❌ FAILED"}`);
  log(`3. Epic Created         : ${createdEpicId ? "✅ YES (ID: " + createdEpicId + ")" : "❌ FAILED"}`);
  log(`4. Sprint Created       : ${createdSprintId ? "✅ YES (ID: " + createdSprintId + ")" : "❌ FAILED"}`);
  log(`5. Task Created         : ${createdTaskId ? "✅ YES (ID: " + createdTaskId + ")" : "❌ FAILED"}`);
  log(`6. Subtask Created      : ${createdSubtaskId ? "✅ YES (ID: " + createdSubtaskId + ")" : "❌ FAILED"}`);
  log("=================================================\n");

  const resultsJSON = {
    timestamp: ts,
    employeeId: createdEmployeeId,
    projectId: createdProjectId,
    epicId: createdEpicId,
    sprintId: createdSprintId,
    taskId: createdTaskId,
    subtaskId: createdSubtaskId,
    allPassed: Boolean(createdEmployeeId && createdProjectId && createdEpicId && createdSprintId && createdTaskId && createdSubtaskId),
    logs: logMessages,
  };

  fs.writeFileSync("d:/HRMS/backend/e2e_results.json", JSON.stringify(resultsJSON, null, 2), "utf8");

  await prisma.$disconnect();
}

runE2ETests().catch(console.error);
