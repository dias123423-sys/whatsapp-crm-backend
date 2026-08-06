import { Controller, Post, Body, Headers, Logger, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private leadsService: LeadsService,
    private prisma: PrismaService,
  ) {}

  @Post('evolution')
  @HttpCode(200)
  @ApiOperation({ summary: 'Evolution API webhook receiver' })
  async handleEvolution(@Body() payload: any, @Headers() headers: any) {
    this.logger.debug(`Evolution webhook: ${JSON.stringify(payload).substring(0, 200)}`);

    const event = payload?.event || payload?.type;

    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      await this.handleIncomingMessage(payload);
    }

    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      await this.handleConnectionUpdate(payload);
    }

    return { received: true };
  }

  private async handleIncomingMessage(payload: any) {
    try {
      const data = payload?.data || payload;
      const messages = Array.isArray(data?.messages) ? data.messages : [data?.message || data];

      for (const msg of messages) {
        if (!msg) continue;

        const fromMe = msg?.key?.fromMe || msg?.fromMe;
        if (fromMe) continue;

        const phone = (msg?.key?.remoteJid || msg?.remoteJid || '')
          .replace('@s.whatsapp.net', '')
          .replace('@g.us', '');

        if (!phone || phone.endsWith('@g.us')) continue;

        const text =
          msg?.message?.conversation ||
          msg?.message?.extendedTextMessage?.text ||
          msg?.body ||
          '';

        const pushName = msg?.pushName || msg?.notifyName || null;
        const instanceName = payload?.instance || payload?.instanceName || 'default';

        // Save message
        const client = await this.prisma.client.upsert({
          where: { phone },
          update: { name: pushName || undefined },
          create: { phone, name: pushName },
        });

        const whatsappAccount = await this.prisma.whatsAppAccount.findUnique({
          where: { instanceName },
        });

        await this.prisma.message.create({
          data: {
            clientId: client.id,
            whatsappAccountId: whatsappAccount?.id,
            direction: 'IN',
            body: text,
            rawPayload: msg,
          },
        });

        // Create lead only if first message or no active lead
        const existingActiveLead = await this.prisma.lead.findFirst({
          where: {
            clientId: client.id,
            status: { notIn: ['CLOSED', 'BOOKED'] },
          },
        });

        if (!existingActiveLead && text) {
          await this.leadsService.createFromWebhook({
            phone,
            name: pushName,
            message: text,
            source: 'WHATSAPP',
            whatsappInstanceId: whatsappAccount?.id,
          });
          this.logger.log(`New lead created for ${phone}`);
        }
      }
    } catch (err) {
      this.logger.error('Error handling incoming message', err);
    }
  }

  private async handleConnectionUpdate(payload: any) {
    try {
      const instanceName = payload?.instance || payload?.instanceName;
      const state = payload?.data?.state || payload?.state;

      if (!instanceName) return;

      const status = state === 'open' ? 'ONLINE' : state === 'connecting' ? 'CONNECTING' : 'OFFLINE';

      await this.prisma.whatsAppAccount.updateMany({
        where: { instanceName },
        data: { status },
      });

      this.logger.log(`WhatsApp ${instanceName} → ${status}`);
    } catch (err) {
      this.logger.error('Error handling connection update', err);
    }
  }
}
