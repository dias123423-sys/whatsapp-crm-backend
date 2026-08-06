import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LeadsService } from '../leads/leads.service';
import { ProcedureDetectorService } from './procedure-detector.service';
import { EvolutionWebhookPayload } from './webhook.controller';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
    private readonly procedureDetector: ProcedureDetectorService,
  ) {}

  async processEvent(payload: EvolutionWebhookPayload): Promise<void> {
    const { event, instance: waAccountId, data } = payload;

    switch (event) {
      case 'MESSAGES_UPSERT':
        await this.handleMessage(waAccountId, data);
        break;

      case 'CONNECTION_UPDATE':
        this.logger.log(`[${waAccountId}] Connection: ${data['state']}`);
        break;

      case 'QRCODE_UPDATED':
        this.logger.log(`[${waAccountId}] QR updated`);
        break;

      default:
        this.logger.debug(`[Webhook] Unhandled event: ${event}`);
    }
  }

  private async handleMessage(
    waAccountId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const messages = Array.isArray(data['messages'])
        ? (data['messages'] as Record<string, unknown>[])
        : [data];

      for (const msg of messages) {
        await this.processMessage(waAccountId, msg);
      }
    } catch (err) {
      this.logger.error(`[Webhook] handleMessage error: ${String(err)}`);
    }
  }

  private async processMessage(
    waAccountId: string,
    msg: Record<string, unknown>,
  ): Promise<void> {
    // Only process INCOMING messages (not fromMe)
    const key     = msg['key'] as Record<string, unknown> | undefined;
    const fromMe  = Boolean(key?.['fromMe']);
    if (fromMe) return;

    // Extract sender phone from JID
    const remoteJid = String(key?.['remoteJid'] ?? '');
    if (!remoteJid || remoteJid.includes('@g.us')) return; // skip groups

    const phone   = ProcedureDetectorService.normalisePhone(remoteJid);
    const waName  = (msg['pushName'] as string | undefined) ?? undefined;
    const msgBody = msg['message'] as Record<string, unknown> | undefined;
    const text    = this.extractText(msgBody);

    if (!phone || !text) return;

    // ── Find company by WA account ────────────────────────────────────────
    const campaign = await this.prisma.campaign.findFirst({
      where: { waAccountId, isActive: true },
      select: { id: true, companyId: true },
    });

    if (!campaign) {
      this.logger.warn(`[Webhook] No active campaign for WA account ${waAccountId}`);
      return;
    }

    this.logger.log(`[Webhook] New message: ${phone} → ${text.slice(0, 60)}`);

    // ── Save message ──────────────────────────────────────────────────────
    const client = await this.prisma.client.upsert({
      where: { companyId_phone: { companyId: campaign.companyId, phone } },
      create: { companyId: campaign.companyId, phone, waName },
      update: { waName: waName ?? undefined },
    });

    const waMessageId = String((key?.['id'] as string | undefined) ?? '');

    await this.prisma.message.upsert({
      where: { waMessageId: waMessageId || `${phone}-${Date.now()}` },
      create: {
        clientId: client.id,
        waAccountId,
        waMessageId: waMessageId || undefined,
        fromMe: false,
        body: text,
        timestamp: new Date(),
      },
      update: {},
    });

    // ── Create lead ───────────────────────────────────────────────────────
    await this.leadsService.createFromWebhook({
      companyId: campaign.companyId,
      phone,
      waName,
      firstMessage: text,
      waAccountId,
      campaignId: campaign.id,
    });
  }

  private extractText(msg: Record<string, unknown> | undefined): string {
    if (!msg) return '';
    if (typeof msg['conversation'] === 'string') return msg['conversation'];
    const ext = msg['extendedTextMessage'] as Record<string, unknown> | undefined;
    if (typeof ext?.['text'] === 'string') return ext['text'];
    return '';
  }
}
