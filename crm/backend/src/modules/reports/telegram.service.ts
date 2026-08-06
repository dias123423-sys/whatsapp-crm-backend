import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly chatId: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('telegram.botToken') ?? '';
    this.chatId   = this.config.get<string>('telegram.chatId') ?? '';
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn('Telegram not configured — skipping notification');
      return;
    }
    try {
      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        { chat_id: this.chatId, text, parse_mode: 'HTML' },
        { timeout: 10_000 },
      );
    } catch (err) {
      this.logger.error(`Telegram send failed: ${String(err)}`);
    }
  }

  async sendDocument(chatId: string, buffer: Buffer, filename: string, caption?: string): Promise<void> {
    if (!this.botToken) return;
    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('chat_id', chatId || this.chatId);
      form.append('document', buffer, { filename });
      if (caption) form.append('caption', caption);

      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendDocument`,
        form,
        { headers: form.getHeaders(), timeout: 30_000 },
      );
    } catch (err) {
      this.logger.error(`Telegram sendDocument failed: ${String(err)}`);
    }
  }
}
