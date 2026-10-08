import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import employeeRoutes from "./routes/employee.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import userRoutes from "./routes/user.routes.js";

import departmentRoutes from "./modules/department/department.routes.js";
import hrSettingsRoutes from "./modules/hr-settings/hr-settings.routes.js";
import attendanceRoutes from "./modules/attendance/attendance.routes.js";
import leaveRoutes from "./modules/leave/leave.routes.js";
import meetingRoutes from "./modules/meeting/meeting.routes.js";
import messengerRoutes from "./modules/messenger/messenger.routes.js";
import callsRoutes from "./modules/messenger/calls.routes.js";
import holidayRoutes from "./modules/holiday/holiday.routes.js";
import { setupSocketServer } from "./socket.js";

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);

const PORT = Number(process.env.PORT) || 5000;

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(uploadsDir));

app.get("/", (_req, res) => {
  res.json({
    message: "HRMS Backend is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/users", userRoutes);

app.use("/api/departments", departmentRoutes);
app.use("/api/hr-settings", hrSettingsRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/messenger", messengerRoutes);
app.use("/api/calls", callsRoutes);
app.use("/api/holidays", holidayRoutes);

// Attach Socket.IO
setupSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`HRMS Backend running on http://localhost:${PORT}`);
});


