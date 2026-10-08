# 🛠️ HRMS DevOps Deployment & Configuration Guide

This document provides step-by-step instructions for the DevOps & Infrastructure team to deploy, configure environment variables, run database migrations, seed initial user accounts, and configure **WebSockets & WebRTC Calling**.

---

## 📁 Repository Structure Overview

```
HRMS/
├── backend/                  # Node.js Express & Socket.IO API Server (Port 5000)
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

## 📞 1. WebSockets & Audio/Video Calling Technology Stack

| Feature | Technology / Protocol Used | Architecture |
|---|---|---|
| **Real-time Messaging & Presence** | **Socket.IO** (v4.8+) | Server-managed persistent WebSocket connection |
| **Audio & Video Calling** | **WebRTC** (`RTCPeerConnection`) | Direct Peer-to-Peer (P2P) audio/video stream |
| **Signaling & Handshake** | **Socket.IO** | Exchange of SDP Offers/Answers and ICE Candidates |
| **NAT Traversal / STUN** | **STUN Server** | Google STUN (`stun:stun.l.google.com:19302`) |

---

## 🌐 2. Critical DevOps Requirements for Calling & WebSockets

### **2.1. Nginx Reverse Proxy Configuration (WebSocket Upgrades)**

Ensure Nginx includes `Upgrade` headers so Socket.IO WebSocket connections are not dropped:

```nginx
server {
    listen 80;
    server_name hrms.yourdomain.com;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Backend API & Socket.IO WebSockets
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Socket.IO WebSocket endpoint
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

---

### **2.2. Mandatory SSL / HTTPS for Camera & Microphone Permissions**

> ⚠️ **CRITICAL**: Modern browsers (Chrome, Edge, Safari, Firefox) **STRICTLY BLOCK** WebRTC camera and microphone access (`navigator.mediaDevices.getUserMedia`) over unencrypted HTTP (except on `localhost`).
> **Production deployment MUST use SSL / HTTPS (Let's Encrypt / Certbot).**

```bash
# Obtain free Let's Encrypt SSL certificate
sudo certbot --nginx -d hrms.yourdomain.com
```

---

### **2.3. Firewall Ports**

Ensure the server firewall permits:
- **Port 80 / 443** (HTTP / HTTPS for Web UI and WebSockets)
- **Port 5000** (Backend Node.js API & Socket.IO server)
- **UDP Ports 1024 - 65535** (WebRTC P2P direct media stream between clients)

---

## 🔐 3. Environment Configurations (`.env`)

### **Backend Environment (`backend/.env`)**

```ini
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=hrms_prod_user
DB_PASSWORD=YourStrongDatabasePassword123!
DB_NAME=hrms_db
DATABASE_URL="mysql://hrms_prod_user:YourStrongDatabasePassword123!@127.0.0.1:3306/hrms_db"
JWT_SECRET="production_super_secret_jwt_key_please_change_this_in_prod"
NODE_ENV=production
```

### **Frontend Environment (`frontend/.env.local`)**

```ini
NEXT_PUBLIC_API_URL=https://hrms.yourdomain.com:5000
NEXTAUTH_SECRET="production_nextauth_secret_please_change"
NEXTAUTH_URL=https://hrms.yourdomain.com
NODE_ENV=production
```

---

## 🗄️ 4. Database Migration & Data Seeding

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run seed
```

### **Default Accounts Created:**
- 👑 **Super Admin**: `superadmin@hrms.com` / `Password@123`
- 👔 **HR Manager**: `hr@hrms.com` / `Password@123`
- 🛡️ **System Admin**: `admin@hrms.com` / `Password@123`

---

## 🚀 5. Process Management (PM2)

```bash
npm install -g pm2
cd backend && pm2 start dist/server.js --name "hrms-backend"
cd frontend && pm2 start npm --name "hrms-frontend" -- start
pm2 save && pm2 startup
```
