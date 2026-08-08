import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class EvolutionApiService {
  private readonly logger = new Logger(EvolutionApiService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly instanceName: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('EVOLUTION_API_URL');
    this.apiKey = this.configService.get<string>('EVOLUTION_API_KEY');
    this.instanceName = this.configService.get<string>('EVOLUTION_INSTANCE_NAME');
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.apiKey,
    };
  }

  /**
   * Get instance connection status
   */
  async getInstanceStatus(instanceName?: string) {
    try {
      const instance = instanceName || this.instanceName;
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/instance/connectionState/${instance}`, {
          headers: this.getHeaders(),
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get instance status', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create new instance
   */
  async createInstance(instanceName: string, webhookUrl?: string) {
    try {
      const payload: any = {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      };

      if (webhookUrl) {
        payload.webhook = {
          url: webhookUrl,
          events: [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
          ],
        };
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/instance/create`, payload, {
          headers: this.getHeaders(),
        }),
      );

      this.logger.log(`Instance created: ${instanceName}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create instance', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Connect instance (get QR code)
   */
  async connectInstance(instanceName?: string) {
    try {
      const instance = instanceName || this.instanceName;
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/instance/connect/${instance}`, {
          headers: this.getHeaders(),
        }),
      );

      this.logger.log(`Instance connecting: ${instance}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to connect instance', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Logout instance
   */
  async logoutInstance(instanceName?: string) {
    try {
      const instance = instanceName || this.instanceName;
      const response = await firstValueFrom(
        this.httpService.delete(`${this.apiUrl}/instance/logout/${instance}`, {
          headers: this.getHeaders(),
        }),
      );

      this.logger.log(`Instance logged out: ${instance}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to logout instance', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send text message
   */
  async sendTextMessage(phone: string, message: string, instanceName?: string) {
    try {
      const instance = instanceName || this.instanceName;
      
      // Format phone number (remove + and add @s.whatsapp.net)
      const formattedPhone = phone.replace(/\D/g, '');
      const number = `${formattedPhone}@s.whatsapp.net`;

      const payload = {
        number,
        text: message,
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/message/sendText/${instance}`,
          payload,
          { headers: this.getHeaders() },
        ),
      );

      this.logger.log(`Message sent to ${phone}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to send message', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Set webhook
   */
  async setWebhook(webhookUrl: string, instanceName?: string) {
    try {
      const instance = instanceName || this.instanceName;

      const payload = {
        enabled: true,
        url: webhookUrl,
        events: [
          'MESSAGES_UPSERT',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
        ],
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/webhook/set/${instance}`,
          payload,
          { headers: this.getHeaders() },
        ),
      );

      this.logger.log(`Webhook set for ${instance}: ${webhookUrl}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to set webhook', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get profile picture
   */
  async getProfilePicture(phone: string, instanceName?: string) {
    try {
      const instance = instanceName || this.instanceName;
      const formattedPhone = phone.replace(/\D/g, '');
      const number = `${formattedPhone}@s.whatsapp.net`;

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.apiUrl}/chat/fetchProfilePictureUrl/${instance}?number=${number}`,
          { headers: this.getHeaders() },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.warn(`Failed to get profile picture for ${phone}`);
      return null;
    }
  }

  /**
   * Fetch all instances
   */
  async fetchInstances() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/instance/fetchInstances`, {
          headers: this.getHeaders(),
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch instances', error.response?.data || error.message);
      throw error;
    }
  }
}
