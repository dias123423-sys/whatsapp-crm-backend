import { Controller, Post, Body, Headers, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookService } from './webhook.service';
import { ConfigService } from '@nestjs/config';

/**
 * Receives Evolution API webhook events.
 * This endpoint is PUBLIC — Evolution API doesn't send JWT tokens.
 * Security: validate X-Webhook-Secret header.
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('evolution')
  @HttpCode(HttpStatus.OK)
  async handleEvolution(
    @Body() body: EvolutionWebhookPayload,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    // ── Respond immediately to avoid Evolution API timeout ────────────────
    // Processing happens async
    this.logger.debug(`[Webhook] ${body.event} from ${body.instance}`);

    // Optional secret validation
    const expectedSecret = this.config.get<string>('webhook.secret');
    if (expectedSecret && secret !== expectedSecret) {
      this.logger.warn(`[Webhook] Invalid secret from ${body.instance}`);
      return { ok: false };
    }

    // Fire and forget — response already sent
    void this.webhookService.processEvent(body);

    return { ok: true };
  }
}

// ─── Evolution API webhook payload shape ─────────────────────────────────────
export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: Record<string, unknown>;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}
