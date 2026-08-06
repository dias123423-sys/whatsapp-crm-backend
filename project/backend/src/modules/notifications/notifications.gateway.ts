import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_operator')
  handleJoinOperator(@ConnectedSocket() client: Socket, operatorId: string) {
    client.join(`operator_${operatorId}`);
    this.logger.log(`Operator ${operatorId} joined room`);
  }

  @SubscribeMessage('join_admin')
  handleJoinAdmin(@ConnectedSocket() client: Socket) {
    client.join('admin');
    this.logger.log(`Admin joined room`);
  }

  notifyNewLead(lead: any) {
    // Notify admin
    this.server.to('admin').emit('new_lead', lead);

    // Notify assigned operator
    if (lead.operatorId) {
      this.server.to(`operator_${lead.operatorId}`).emit('new_lead', lead);
    }
  }

  notifyLeadUpdate(lead: any) {
    this.server.to('admin').emit('lead_updated', lead);
    if (lead.operatorId) {
      this.server.to(`operator_${lead.operatorId}`).emit('lead_updated', lead);
    }
  }
}
