import "dotenv/config";
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

const app = express();

const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`HRMS Backend running on http://localhost:${PORT}`);
});

