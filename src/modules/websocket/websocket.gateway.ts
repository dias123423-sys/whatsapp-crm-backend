import {
  WebSocketGateway as WsGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@WsGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class WebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);

  constructor(private configService: ConfigService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Emit when new lead is created
   */
  emitLeadCreated(lead: any) {
    this.server.emit('lead:new', lead);
    this.logger.log(`Lead created event emitted: ${lead.id}`);
  }

  /**
   * Emit when lead is updated
   */
  emitLeadUpdated(lead: any) {
    this.server.emit('lead:updated', lead);
    this.logger.log(`Lead updated event emitted: ${lead.id}`);
  }

  /**
   * Emit when lead is assigned to operator
   */
  emitLeadAssigned(lead: any) {
    this.server.emit('lead:assigned', lead);
    
    // Send to specific operator room if they're connected
    if (lead.operatorId) {
      this.server.to(`operator:${lead.operatorId}`).emit('lead:assigned', lead);
    }
    
    this.logger.log(`Lead assigned event emitted: ${lead.id}`);
  }

  /**
   * Emit stats update
   */
  emitStatsUpdate(stats: any) {
    this.server.emit('stats:updated', stats);
    this.logger.log('Stats updated event emitted');
  }

  /**
   * Send notification to specific user
   */
  sendNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
    this.logger.log(`Notification sent to user: ${userId}`);
  }

  /**
   * Emit when WhatsApp account connects
   */
  emitWhatsAppConnected(account: any) {
    this.server.emit('whatsapp:connected', account);
    this.logger.log(`WhatsApp connected event: ${account.instanceName}`);
  }

  /**
   * Emit when WhatsApp account disconnects
   */
  emitWhatsAppDisconnected(account: any) {
    this.server.emit('whatsapp:disconnected', account);
    this.logger.log(`WhatsApp disconnected event: ${account.instanceName}`);
  }

  /**
   * Emit updated QR code
   */
  emitQRUpdated(instanceName: string, qrCode: string) {
    this.server.emit('whatsapp:qr_updated', { instanceName, qrCode });
    this.logger.log(`QR updated event: ${instanceName}`);
  }

  /**
   * Broadcast system message
   */
  broadcastMessage(message: string, type: 'info' | 'warning' | 'error' = 'info') {
    this.server.emit('system:message', { message, type, timestamp: new Date() });
    this.logger.log(`System message broadcasted: ${message}`);
  }
}
