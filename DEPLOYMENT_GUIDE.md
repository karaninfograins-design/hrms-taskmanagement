# 🛠️ HRMS DevOps Deployment & Configuration Guide

This document provides step-by-step instructions for the DevOps & Infrastructure team to deploy, configure environment variables, run database migrations, and seed initial **Super Admin**, **HR Manager**, and **Admin** user accounts.

---

## 📁 Repository Structure Overview

```
HRMS/
├── backend/                  # Node.js Express API Server (Port 5000)
│   ├── .env.example          # Environment variables template
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema definition
│   │   └── seed.ts           # Roles, permissions & initial users seed script
│   ├── src/                  # Controllers, routes, and services
│   └── package.json
├── frontend/                 # Next.js Web Dashboard (Port 3000)
│   ├── .env.example          # Frontend environment configuration
│   ├── app/                  # Next.js App Router pages
│   ├── components/           # UI components & workspace modules
│   └── package.json
└── DEPLOYMENT_GUIDE.md       # Deployment instructions (this file)
```

---

## 🔐 1. Environment Configurations (`.env`)

### **Backend Environment (`backend/.env`)**

Copy `backend/.env.example` to `backend/.env` and configure your production database credentials:

```ini
# Server Port
PORT=5000

# Database Credentials
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=hrms_prod_user
DB_PASSWORD=YourStrongDatabasePassword123!
DB_NAME=hrms_db

# Full Database URL (Prisma MySQL/MariaDB Connection String)
DATABASE_URL="mysql://hrms_prod_user:YourStrongDatabasePassword123!@127.0.0.1:3306/hrms_db"

# JWT Secret Key
JWT_SECRET="production_super_secret_jwt_key_please_change_this_in_prod"

# Node Environment
NODE_ENV=production
```

---

### **Frontend Environment (`frontend/.env.local`)**

Copy `frontend/.env.example` to `frontend/.env.local`:

```ini
# Public API URL (Point to Backend Server IP or Domain)
NEXT_PUBLIC_API_URL=http://<YOUR_SERVER_IP_OR_DOMAIN>:5000

# NextAuth Configuration
NEXTAUTH_SECRET="production_nextauth_secret_please_change"
NEXTAUTH_URL=http://<YOUR_SERVER_IP_OR_DOMAIN>:3000

# Node Environment
NODE_ENV=production
```

---

## 🗄️ 2. Database Setup, Migration & Initial Data Seeding

### **Step 2.1: Generate Prisma Client & Run Database Migrations**

In the `backend` directory:

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
```

### **Step 2.2: Seed Initial Roles, Permissions & Core Accounts**

Run the seed script to automatically populate roles, permissions, designations, and core accounts:

```bash
npm run seed
# OR
npx prisma db seed
```

---

## 🔑 Initial Default Accounts Created by Seed Script

After running `npm run seed`, the database is pre-loaded with the following accounts:

| Role | Email | Default Password | Permissions |
|---|---|---|---|
| **Super Admin** | `superadmin@hrms.com` | `Password@123` | **Full System Access** (Users, Roles, HR Settings, Projects) |
| **HR Manager** | `hr@hrms.com` | `Password@123` | **HR Access** (Employee Management, Leaves, Attendance, Reports) |
| **System Admin** | `admin@hrms.com` | `Password@123` | **Admin Access** (Projects, Epics, Sprints, Work Items, Users) |

> ⚠️ **IMPORTANT**: Log in as Super Admin immediately after initial deployment to change default passwords under user settings or via admin panel.

---

## 🚀 3. Building & Running Services (Production Mode)

### **Backend Service**

```bash
cd backend
npm run build
npm start
```

### **Frontend Service**

```bash
cd frontend
npm run build
npm start
```

---

## 🔄 4. Process Management via PM2 (Recommended)

To run both services continuously in background mode with auto-restart:

```bash
# Install PM2 globally
npm install -g pm2

# Start Backend Process
cd /path/to/HRMS/backend
pm2 start dist/server.js --name "hrms-backend"

# Start Frontend Process
cd /path/to/HRMS/frontend
pm2 start npm --name "hrms-frontend" -- start

# Save PM2 state & enable startup on reboot
pm2 save
pm2 startup
```

---

## 🔍 5. Verification Checklist

1. **Backend Health**: `curl http://localhost:5000/api/workspace/projects` (should return 401 Unauthorized or JSON response).
2. **Frontend UI**: Open `http://<SERVER_IP>:3000` in browser.
3. **Login Test**:
   - Log in as `superadmin@hrms.com` / `Password@123`.
   - Log in as `hr@hrms.com` / `Password@123`.
