import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: { origin: '*', credentials: false },
  namespace: '/',
  path: '/socket.io',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  // Map userId → Set of socket IDs
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Connection ────────────────────────────────────────────────────────────
  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = this.extractToken(socket);
      if (!token) { socket.disconnect(); return; }

      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('jwt.secret'),
      }) as { sub: string; companyId: string; role: string; operatorId?: string };

      socket.data['userId']     = payload.sub;
      socket.data['companyId']  = payload.companyId;
      socket.data['role']       = payload.role;
      socket.data['operatorId'] = payload.operatorId;

      // Join company room
      await socket.join(`company:${payload.companyId}`);

      // Join operator room if applicable
      if (payload.operatorId) {
        await socket.join(`operator:${payload.operatorId}`);
      }

      const sockets = this.userSockets.get(payload.sub) ?? new Set();
      sockets.add(socket.id);
      this.userSockets.set(payload.sub, sockets);

      this.logger.debug(`Client connected: ${socket.id} (user: ${payload.sub})`);
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket): void {
    const userId = socket.data['userId'] as string | undefined;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      sockets?.delete(socket.id);
      if (!sockets?.size) this.userSockets.delete(userId);
    }
    this.logger.debug(`Client disconnected: ${socket.id}`);
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  @OnEvent('lead.created')
  handleLeadCreated(lead: { companyId: string; operatorId?: string | null; [k: string]: unknown }) {
    // Notify entire company
    this.server.to(`company:${lead.companyId}`).emit('lead:new', lead);

    // Notify assigned operator specifically
    if (lead.operatorId) {
      this.server.to(`operator:${lead.operatorId}`).emit('lead:assigned', lead);
    }
  }

  @OnEvent('lead.status_changed')
  handleStatusChanged(lead: { companyId: string; [k: string]: unknown }) {
    this.server.to(`company:${lead.companyId}`).emit('lead:status_changed', lead);
  }

  @OnEvent('lead.duplicate')
  handleDuplicate(lead: { companyId: string; [k: string]: unknown }) {
    this.server.to(`company:${lead.companyId}`).emit('lead:duplicate', lead);
  }

  // ── Client → server ───────────────────────────────────────────────────────
  @SubscribeMessage('operator:online')
  handleOnline(@ConnectedSocket() socket: Socket) {
    const operatorId = socket.data['operatorId'] as string | undefined;
    if (operatorId) {
      this.server
        .to(`company:${socket.data['companyId'] as string}`)
        .emit('operator:status', { operatorId, isOnline: true });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private extractToken(socket: Socket): string | null {
    const auth  = socket.handshake.auth?.['token'] as string | undefined;
    const query = socket.handshake.query?.['token'] as string | undefined;
    const bearer = socket.handshake.headers?.['authorization'] as string | undefined;
    return auth ?? query ?? (bearer?.replace('Bearer ', '') ?? null);
  }

  /** Emit to all sockets of a specific user */
  emitToUser(userId: string, event: string, data: unknown): void {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      for (const id of sockets) {
        this.server.to(id).emit(event, data);
      }
    }
  }
}
