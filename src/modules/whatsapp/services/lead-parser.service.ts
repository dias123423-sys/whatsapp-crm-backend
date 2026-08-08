/**
 * LeadParserService — DEPRECATED.
 * All logic moved to WhatsAppParserService (whatsapp-parser.service.ts).
 * This file is kept only so existing module imports don't break.
 */
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LeadParserService {
  private readonly logger = new Logger(LeadParserService.name);

  /** @deprecated Use WhatsAppParserService.createLeadFromWebhook() instead */
  async processIncomingMessage(_payload: any): Promise<null> {
    this.logger.warn('LeadParserService is deprecated — use WhatsAppParserService');
    return null;
  }

  async getParsingStats() {
    return {};
  }
}
