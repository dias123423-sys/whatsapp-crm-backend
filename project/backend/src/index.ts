import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './database/prisma.client';
import { socketService } from './services/socket.service';
import { initWhatsAppManager } from './whatsapp/manager';

import authRoutes       from './routes/auth.routes';
import appointmentRoutes from './routes/appointment.routes';
import whatsappRoutes   from './routes/whatsapp.routes';
import webhookRoutes    from './routes/webhook.routes';
import { errorMiddleware } from './middleware/error.middleware';

// ─── App setup ────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// ── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = (process.env.FRONTEND_URL ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length
      ? (origin, cb) => {
          // Allow requests without origin (curl, server-to-server)
          if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
          // Also allow any *.vercel.app for preview deployments
          if (/\.vercel\.app$/.test(origin)) return cb(null, true);
          cb(new Error(`CORS: blocked origin ${origin}`));
        }
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  }),
);

// ── Body parsing ──────────────────────────────────────────────────────────────
// Webhook endpoint needs raw JSON — must be parsed before rate-limiter
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests' },
  }),
);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/whatsapp',     whatsappRoutes);
app.use('/webhook',          webhookRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorMiddleware);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3001);

async function start(): Promise<void> {
  try {
    // 1. Database
    await connectDatabase();

    // 2. Socket.IO (must attach to http.Server before listen)
    socketService.initialize(server);

    // 3. HTTP server
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${PORT} (${process.env.NODE_ENV ?? 'development'})`);
    });

    // 4. WhatsApp manager — after server is up so webhook URL is reachable
    await initWhatsAppManager();

  } catch (err) {
    logger.error('💥 Failed to start server:', err);
    process.exit(1);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal} — shutting down gracefully…`);
  server.close(async () => {
    await disconnectDatabase();
    logger.info('Server closed');
    process.exit(0);
  });

  // Force exit after 10 s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));

void start();
