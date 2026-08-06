import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.baseUrl = this.config.get('EVOLUTION_API_URL', 'http://localhost:8080');
    this.apiKey = this.config.get('EVOLUTION_API_KEY', '');
  }

  private get headers() {
    return { apikey: this.apiKey, 'Content-Type': 'application/json' };
  }

  async createInstance(instanceName: string) {
    const res = await axios.post(
      `${this.baseUrl}/instance/create`,
      {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      },
      { headers: this.headers },
    );

    await this.prisma.whatsAppAccount.upsert({
      where: { instanceName },
      update: { status: 'CONNECTING' },
      create: { instanceName, status: 'CONNECTING' },
    });

    return res.data;
  }

  async getQrCode(instanceName: string) {
    const res = await axios.get(`${this.baseUrl}/instance/connect/${instanceName}`, {
      headers: this.headers,
    });
    return res.data;
  }

  async getInstanceStatus(instanceName: string) {
    try {
      const res = await axios.get(`${this.baseUrl}/instance/connectionState/${instanceName}`, {
        headers: this.headers,
      });
      const state = res.data?.instance?.state;
      const status = state === 'open' ? 'ONLINE' : state === 'connecting' ? 'CONNECTING' : 'OFFLINE';

      await this.prisma.whatsAppAccount.updateMany({
        where: { instanceName },
        data: { status },
      });

      return { instanceName, status, raw: res.data };
    } catch {
      return { instanceName, status: 'OFFLINE' };
    }
  }

  async getAllInstances() {
    const accounts = await this.prisma.whatsAppAccount.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const withStatus = await Promise.all(
      accounts.map((acc) => this.getInstanceStatus(acc.instanceName)),
    );

    return this.prisma.whatsAppAccount.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async deleteInstance(instanceName: string) {
    await axios.delete(`${this.baseUrl}/instance/delete/${instanceName}`, {
      headers: this.headers,
    });
    return this.prisma.whatsAppAccount.deleteMany({ where: { instanceName } });
  }

  async sendMessage(instanceName: string, phone: string, text: string) {
    const res = await axios.post(
      `${this.baseUrl}/message/sendText/${instanceName}`,
      { number: phone, textMessage: { text } },
      { headers: this.headers },
    );
    return res.data;
  }
}
