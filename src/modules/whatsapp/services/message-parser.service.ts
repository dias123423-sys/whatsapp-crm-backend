import { Injectable, Logger } from '@nestjs/common';

export interface ParsedMessage {
  messageId: string;
  phone: string;
  whatsappName: string;
  messageText: string;
  messageType: string;
  timestamp: Date;
  instanceName: string;
  isFromMe: boolean;
}

@Injectable()
export class MessageParserService {
  private readonly logger = new Logger(MessageParserService.name);

  /**
   * Parse incoming webhook payload from Evolution API
   */
  parseWebhook(payload: any): ParsedMessage | null {
    try {
      const data = payload.data || payload;
      const message = data.message || data;
      const key = message.key;

      // Skip messages from us
      if (key.fromMe) {
        this.logger.log('Skipping message from self');
        return null;
      }

      // Extract phone number (remove @s.whatsapp.net)
      const phone = this.normalizePhone(key.remoteJid.split('@')[0]);

      // Extract message text based on message type
      const { text, type } = this.extractMessageContent(message.message);

      // Extract WhatsApp name
      const whatsappName = message.pushName || phone;

      // Extract timestamp
      const timestamp = message.messageTimestamp 
        ? new Date(parseInt(message.messageTimestamp) * 1000)
        : new Date();

      // Extract instance name
      const instanceName = data.instance || key.instance || 'unknown';

      // Generate unique message ID
      const messageId = key.id || `${phone}-${timestamp.getTime()}`;

      const parsed: ParsedMessage = {
        messageId,
        phone,
        whatsappName,
        messageText: text,
        messageType: type,
        timestamp,
        instanceName,
        isFromMe: false,
      };

      this.logger.log(`Parsed message from ${phone}: "${text.substring(0, 50)}..."`);

      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse webhook payload', error);
      return null;
    }
  }

  /**
   * Extract message content based on message type
   */
  private extractMessageContent(messageContent: any): { text: string; type: string } {
    if (!messageContent) {
      return { text: '', type: 'unknown' };
    }

    // Text message
    if (messageContent.conversation) {
      return { text: messageContent.conversation, type: 'text' };
    }

    // Extended text (reply, link preview, etc.)
    if (messageContent.extendedTextMessage?.text) {
      return { text: messageContent.extendedTextMessage.text, type: 'extendedText' };
    }

    // Image with caption
    if (messageContent.imageMessage?.caption) {
      return { text: messageContent.imageMessage.caption, type: 'image' };
    }

    // Video with caption
    if (messageContent.videoMessage?.caption) {
      return { text: messageContent.videoMessage.caption, type: 'video' };
    }

    // Document with caption
    if (messageContent.documentMessage?.caption) {
      return { text: messageContent.documentMessage.caption, type: 'document' };
    }

    // Audio message
    if (messageContent.audioMessage) {
      return { text: '[Голосовое сообщение]', type: 'audio' };
    }

    // Sticker
    if (messageContent.stickerMessage) {
      return { text: '[Стикер]', type: 'sticker' };
    }

    // Contact
    if (messageContent.contactMessage) {
      return { text: '[Контакт]', type: 'contact' };
    }

    // Location
    if (messageContent.locationMessage) {
      return { text: '[Геолокация]', type: 'location' };
    }

    // Unknown type
    const messageType = Object.keys(messageContent)[0] || 'unknown';
    this.logger.warn(`Unknown message type: ${messageType}`);
    
    return { text: `[Медиа: ${messageType}]`, type: messageType };
  }

  /**
   * Normalize phone number (remove all non-digit characters except +)
   */
  private normalizePhone(phone: string): string {
    // Remove all non-digit characters
    let normalized = phone.replace(/\D/g, '');

    // If phone doesn't start with country code, add it (assuming Kazakhstan +7)
    if (!normalized.startsWith('7') && !normalized.startsWith('8')) {
      normalized = '7' + normalized;
    }

    // Convert 8 to 7 for Kazakhstan
    if (normalized.startsWith('8')) {
      normalized = '7' + normalized.substring(1);
    }

    return normalized;
  }

  /**
   * Detect language from message text
   */
  detectLanguage(text: string): string {
    if (!text) return 'unknown';

    // Cyrillic patterns
    const cyrillicPattern = /[а-яА-ЯёЁ]/;
    const kazakhPattern = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/;

    if (kazakhPattern.test(text)) {
      return 'kk'; // Kazakh
    }

    if (cyrillicPattern.test(text)) {
      return 'ru'; // Russian
    }

    // Latin characters (could be English or Kazakh in Latin)
    const latinPattern = /[a-zA-Z]/;
    if (latinPattern.test(text)) {
      return 'en';
    }

    return 'unknown';
  }
}
