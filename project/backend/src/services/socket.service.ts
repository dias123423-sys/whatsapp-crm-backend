import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from '../utils/logger';

interface AppointmentPayload {
  id: string;
  [key: string]: unknown;
}

interface WhatsAppStatusPayload {
  accountId: string;
  isConnected: boolean;
  phoneNumber?: string;
  hasQR?: boolean;
}

interface WhatsAppQRPayload {
  accountId: string;
  qr: string;
}

class SocketService {
  private io: SocketIOServer | null = null;

  initialize(httpServer: HttpServer): void {
    const allowedOrigins = (process.env.FRONTEND_URL ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    this.io = new SocketIOServer(httpServer, {
      path: '/socket.io',
      cors: {
        origin: allowedOrigins.length ? allowedOrigins : '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      // Allow both polling and websocket — polling required for Vercel proxy
      transports: ['polling', 'websocket'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.io.on('connection', (socket: Socket) => {
      logger.debug(`Socket connected: ${socket.id}`);

      socket.on('disconnect', (reason) => {
        logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
      });
    });

    logger.info('🔌 Socket.IO server initialized');
  }

  // ─── Dashboard → client events ───────────────────────────────────────────

  emitNewAppointment(appointment: AppointmentPayload): void {
    this.io?.emit('appointment:new', appointment);
  }

  emitUpdatedAppointment(appointment: AppointmentPayload): void {
    this.io?.emit('appointment:updated', appointment);
  }

  emitDeletedAppointment(id: string): void {
    this.io?.emit('appointment:deleted', { id });
  }

  emitStatsUpdate(): void {
    this.io?.emit('stats:update', {});
  }

  emitExcelReady(url: string): void {
    this.io?.emit('excel:ready', { url });
  }

  // ─── WhatsApp status events ───────────────────────────────────────────────

  emitWhatsAppStatus(payload: WhatsAppStatusPayload): void {
    logger.debug(`[Socket] whatsapp:status → ${payload.accountId} connected=${payload.isConnected}`);
    this.io?.emit('whatsapp:status', payload);
  }

  emitWhatsAppQR(payload: WhatsAppQRPayload): void {
    logger.debug(`[Socket] whatsapp:qr → ${payload.accountId}`);
    this.io?.emit('whatsapp:qr', payload);
  }

  getIO(): SocketIOServer | null {
    return this.io;
  }
}

export const socketService = new SocketService();
