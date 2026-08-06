# WhatsApp Call-Center System

Production-ready WhatsApp appointment management system with Evolution API integration.

## 🏗️ Architecture

```
VPS (188.241.217.76)
│
├── Evolution API (port 8080)  ← WhatsApp Web API (Baileys)
│   └── 4 instances: WA1, WA2, WA3, WA4
│
├── Backend (port 3001)        ← Express + Socket.IO
│   ├── REST API
│   ├── WebSocket (real-time)
│   └── Webhook receiver
│
└── Neon PostgreSQL (external) ← Serverless Postgres
    ├── public schema          → Backend data
    └── evolution_api schema   → Evolution API data
```

Dashboard runs locally on your machine (dev) or Vercel (production).

---

## 🚀 Quick Deploy to VPS

**Prerequisites:** VPS Ubuntu 22.04, root access

```bash
# 1. Copy project to VPS
scp -r project/ root@188.241.217.76:/opt/callcenter/

# 2. SSH to VPS and run deploy script
ssh root@188.241.217.76
cd /opt/callcenter
bash deploy/deploy.sh

# 3. On your local machine — run dashboard
cd apps/dashboard
npm install
npm run dev
# Open http://localhost:3000
# Login: admin / Cocoage_1234$
```

**Full step-by-step guide:** [DEPLOY_INSTRUCTIONS.md](./DEPLOY_INSTRUCTIONS.md)

---

## 📦 Tech Stack

### Backend
- **Runtime:** Node.js 20 + TypeScript
- **Framework:** Express 4
- **Real-time:** Socket.IO 4
- **Database:** Prisma ORM + PostgreSQL (Neon)
- **WhatsApp:** Evolution API (Baileys-based)
- **Excel:** ExcelJS
- **Logs:** Winston

### Dashboard (Next.js)
- **Framework:** Next.js 16 + React 19
- **Styling:** Tailwind CSS
- **State:** TanStack Query (React Query)
- **Real-time:** Socket.IO Client
- **UI:** Lucide icons, QRCode.react

### Infrastructure
- **Containerization:** Docker + Docker Compose
- **Reverse Proxy:** nginx
- **Database:** Neon PostgreSQL (serverless, pooling)

---

## 🗂️ Project Structure

```
project/
├── backend/                     ← Express backend
│   ├── src/
│   │   ├── index.ts             ← Entry point
│   │   ├── database/
│   │   │   └── prisma/
│   │   │       └── schema.prisma
│   │   ├── whatsapp/
│   │   │   ├── evolution.client.ts  ← Evolution API HTTP client
│   │   │   └── manager.ts           ← Manages WA1-4 instances
│   │   ├── services/
│   │   │   ├── appointment.service.ts
│   │   │   ├── excel.service.ts
│   │   │   └── socket.service.ts
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── appointment.routes.ts
│   │   │   ├── whatsapp.routes.ts
│   │   │   └── webhook.routes.ts
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── appointment.detector.ts  ← RU/KZ date/time parser
│   ├── Dockerfile
│   └── .env                     ← ALREADY CONFIGURED
│
├── apps/dashboard/              ← Next.js dashboard
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── .env.local               ← ALREADY CONFIGURED
│
├── docker-compose.yml           ← Evolution API + Backend
├── deploy/
│   ├── nginx.conf               ← Reverse proxy config
│   ├── deploy.sh                ← VPS setup script
│   └── update.sh                ← Update script
│
└── DEPLOY_INSTRUCTIONS.md       ← STEP-BY-STEP GUIDE
```

---

## 🔑 Features

### ✅ WhatsApp Management
- 4 simultaneous WhatsApp accounts (WA1, WA2, WA3, WA4)
- QR code scanning via dashboard
- Auto-reconnect on disconnect
- Session persistence (Docker volumes)
- Real-time connection status

### ✅ Appointment Detection
- Automatic message parsing (Russian/Kazakh)
- Date formats: "12.07", "12 июля", "завтра", "сегодня"
- Time formats: "14:00", "14ч", "в 14"
- BOT vs OPERATOR detection
- Phone number extraction

### ✅ Dashboard
- Real-time updates via Socket.IO
- Statistics cards (today/week/month)
- Appointment filtering (date, account, creator)
- Excel export (AINUR/AIBEK/BOT/ALL)
- WhatsApp QR panel

### ✅ Excel Reports
- Multiple export types:
  - **AINUR:** WA1 only
  - **AIBEK:** WA2 + WA3 + WA4
  - **BOT:** All BOT-created appointments
  - **ALL:** Everything
- Formatted headers, alternating rows
- Color-coded BOT/OPERATOR

---

## 🔧 Configuration

All environment files are **ALREADY CONFIGURED**:

### Backend (backend/.env)
```bash
DATABASE_URL=postgresql://...@neon.tech/neondb
JWT_SECRET=ij6CETIv4NqBNQzKjKbiVzlz2WD6c9keUjewSR872OpBnTAS
ADMIN_PASSWORD=Cocoage_1234$
FRONTEND_URL=http://188.241.217.76:3000
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11
WEBHOOK_URL=http://172.16.0.2:3001/webhook/evolution
```

### Dashboard (apps/dashboard/.env.local)
```bash
NEXT_PUBLIC_API_URL=http://188.241.217.76:3001
NEXT_PUBLIC_SOCKET_URL=http://188.241.217.76:3001
```

---

## 📡 API Endpoints

### Authentication
```http
POST   /api/auth/login       → { token: "..." }
GET    /api/auth/me          → { username: "admin" }
```

### Appointments
```http
GET    /api/appointments?page=1&limit=50
GET    /api/appointments/stats
GET    /api/appointments/export?type=AINUR|AIBEK|BOT|ALL
GET    /api/appointments/:id
DELETE /api/appointments/:id
```

### WhatsApp
```http
GET    /api/whatsapp/status       → All accounts status
GET    /api/whatsapp/:id/qr       → QR code (WA1/WA2/WA3/WA4)
POST   /api/whatsapp/:id/reset    → Logout & new QR
```

### Health
```http
GET    /health                    → { status: "ok", uptime: ... }
```

---

## 🔌 Socket.IO Events

**Server → Client:**
```javascript
appointment:new       // New appointment created
appointment:updated   // Appointment modified
appointment:deleted   // Appointment removed
stats:update          // Stats changed
whatsapp:status       // Account connected/disconnected
whatsapp:qr           // New QR code available
```

---

## 📝 How It Works

### Message Flow

```
1. WhatsApp message arrives
        ↓
2. Evolution API receives via Baileys
        ↓
3. Evolution API POSTs webhook → Backend /webhook/evolution
        ↓
4. Backend: appointment.detector.ts parses message
   - extractDate("завтра") → Date
   - extractTime("14:00") → "14:00"
   - extractPhone("+77011234567") → "+77011234567"
   - extractClientName("Айбек") → "Айбек"
   - detectCreatedBy(text, fromMe) → "BOT" | "OPERATOR"
        ↓
5. Backend: appointment.service.create()
   - Save to Neon PostgreSQL
   - Emit Socket.IO event → Dashboard updates in real-time
        ↓
6. Excel auto-generated on export request
```

---

## 🧪 Local Development

### Backend
```bash
cd backend
npm install
cp .env.example .env  # Already done — use .env
npx prisma generate --schema=src/database/prisma/schema.prisma
npx prisma migrate deploy --schema=src/database/prisma/schema.prisma
npm run dev
```

### Dashboard
```bash
cd apps/dashboard
npm install
npm run dev
# Open http://localhost:3000
```

---

## 🐳 Docker Commands

```bash
# Start all services
docker compose up -d --build

# View logs
docker compose logs -f backend
docker compose logs -f evolution-api

# Restart backend only
docker compose restart backend

# Stop all
docker compose down

# Stop + remove volumes (⚠️ loses QR sessions)
docker compose down -v

# Check status
docker compose ps
```

---

## 🔐 Security

- ✅ JWT authentication (7-day expiry)
- ✅ CORS configured for dashboard origins
- ✅ Helmet security headers
- ✅ Rate limiting (500 req/15min)
- ✅ UFW firewall on VPS
- ⚠️ Currently HTTP — use certbot for HTTPS in production

---

## 🛠️ Maintenance

### Update Code (Zero-Downtime)
```bash
cd /opt/callcenter
git pull
bash deploy/update.sh
```

### Database Migrations
```bash
# On VPS
cd /opt/callcenter
docker compose exec backend npx prisma migrate deploy --schema=prisma/schema.prisma
```

### Logs
```bash
# Application logs (inside container)
docker compose exec backend tail -f logs/combined.log

# Container logs
docker compose logs -f backend

# Evolution API logs
docker compose logs -f evolution-api
```

---

## 📞 Troubleshooting

See [DEPLOY_INSTRUCTIONS.md](./DEPLOY_INSTRUCTIONS.md) → Troubleshooting section.

Common issues:
- Backend won't start → Check `DATABASE_URL`, run migrations
- QR code not showing → Restart Evolution API: `docker compose restart evolution-api`
- Socket.IO not connecting → Check CORS in `backend/src/index.ts`
- Dashboard 401 errors → Check JWT_SECRET matches between backend and login

---

## 📄 License

MIT

---

## 🤝 Support

For deployment issues, check logs:
```bash
docker compose logs backend
docker compose logs evolution-api
```

Database issues:
- Neon dashboard: https://console.neon.tech
- Check connection pooler status

Evolution API issues:
- Official docs: https://docs.evolutionfoundation.com.br
- GitHub: https://github.com/evolution-foundation/evolution-api

---

**Built with ❤️ for call-center automation**
