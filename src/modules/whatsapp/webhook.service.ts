import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeadParserService } from './services/lead-parser.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private prisma: PrismaService,
    private leadParser: LeadParserService,
  ) {}

  /**
   * Process incoming webhook from Evolution API
   */
  async processWebhook(payload: any) {
    try {
      const eventType = payload.event;

      this.logger.log(`📨 Received webhook event: ${eventType}`);

      switch (eventType) {
        case 'messages.upsert':
        case 'MESSAGES_UPSERT':
          return await this.handleIncomingMessage(payload);

        case 'connection.update':
        case 'CONNECTION_UPDATE':
          return await this.handleConnectionUpdate(payload.data);

        case 'qrcode.updated':
        case 'QRCODE_UPDATED':
          return await this.handleQRCodeUpdate(payload.data);

        default:
          this.logger.log(`Unhandled event type: ${eventType}`);
          return { success: true, message: 'Event type not processed' };
      }
    } catch (error) {
      this.logger.error('❌ Error processing webhook', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle incoming WhatsApp message - delegate to Lead Parser
   */
  private async handleIncomingMessage(payload: any) {
    try {
      const result = await this.leadParser.processIncomingMessage(payload);

      if (!result) {
        return { success: true, message: 'Message skipped (duplicate or from self)' };
      }

      return {
        success: true,
        message: 'Lead created successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error('Error handling incoming message', error);
      throw error;
    }
  }

  /**
   * Handle connection status update
   */
  private async handleConnectionUpdate(data: any) {
    try {
      const instance = data.instance;
      const state = data.state || data.status;

      this.logger.log(`🔌 Connection update for ${instance}: ${state}`);

      await this.prisma.whatsAppAccount.upsert({
        where: { instanceName: instance },
        update: { status: state },
        create: {
          instanceName: instance,
          status: state,
          active: true,
        },
      });

      return { success: true, message: 'Connection status updated' };
    } catch (error) {
      this.logger.error('Error handling connection update', error);
      throw error;
    }
  }

  /**
   * Handle QR code update
   */
  private async handleQRCodeUpdate(data: any) {
    try {
      const instance = data.instance;
      const qrCode = data.qrcode || data.qr;

      this.logger.log(`📱 QR code updated for ${instance}`);

      await this.prisma.whatsAppAccount.upsert({
        where: { instanceName: instance },
        update: { qrCode },
        create: {
          instanceName: instance,
          qrCode,
          status: 'DISCONNECTED',
          active: true,
        },
      });

      return { success: true, message: 'QR code updated' };
    } catch (error) {
      this.logger.error('Error handling QR code update', error);
      throw error;
    }
  }
}
