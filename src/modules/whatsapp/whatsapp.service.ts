import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly evolutionApiUrl: string;
  private readonly evolutionApiKey: string;
  private readonly backendUrl: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.evolutionApiUrl =
      this.configService.get('EVOLUTION_API_URL') || 'http://localhost:8080';
    this.evolutionApiKey = this.configService.get('EVOLUTION_API_KEY') || '';
    this.backendUrl = this.configService.get('APP_URL') || 'http://localhost:3000';
  }

  private get headers() {
    return { apikey: this.evolutionApiKey };
  }

  /**
   * Получить все WhatsApp аккаунты из БД с актуальным статусом из Evolution API
   */
  async getAllAccounts() {
    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { active: true },
      include: {
        owner: true,
        _count: {
          select: { leads: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Обновляем статус из Evolution API (не ждём — делаем best-effort)
    const enriched = await Promise.all(
      accounts.map(async (account) => {
        try {
          const evStatus = await this.getInstanceStatus(account.instanceName);
          // Обновляем статус в БД если изменился
          if (evStatus.state !== account.status) {
            await this.prisma.whatsAppAccount.update({
              where: { id: account.id },
              data: { status: evStatus.state },
            });
          }
          return { ...account, status: evStatus.state, phone: evStatus.phone ?? account.phone };
        } catch {
          return account;
        }
      }),
    );

    return enriched;
  }

  /**
   * Получить один аккаунт по ID
   */
  async getAccountById(id: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id },
      include: {
        owner: true,
        _count: { select: { leads: true } },
      },
    });
    if (!account) {
      throw new NotFoundException(`WhatsApp account ${id} not found`);
    }
    return account;
  }

  /**
   * Получить аккаунт по instanceName
   */
  async getAccountByInstanceName(instanceName: string) {
    return this.prisma.whatsAppAccount.findUnique({
      where: { instanceName },
      include: { owner: true },
    });
  }

  /**
   * Получить статус instance из Evolution API
   */
  async getInstanceStatus(instanceName: string): Promise<{ state: string; phone: string | null }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.evolutionApiUrl}/instance/connectionState/${instanceName}`,
          { headers: this.headers },
        ),
      );

      return {
        state: this.mapEvolutionStatus(response.data.state),
        phone: response.data.number || null,
      };
    } catch (error) {
      this.logger.warn(`Failed to get status for ${instanceName}: ${error.message}`);
      return { state: 'DISCONNECTED', phone: null };
    }
  }

  /**
   * Сгенерировать QR код для подключения
   */
  async generateQR(accountId: string) {
    const account = await this.getAccountById(accountId);

    // Создаём instance если не существует
    await this.ensureInstanceExists(account.instanceName);

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.evolutionApiUrl}/instance/connect/${account.instanceName}`,
          { headers: this.headers },
        ),
      );

      const qrCode: string = response.data.base64 || response.data.code || '';

      // Сохраняем QR в БД
      await this.prisma.whatsAppAccount.update({
        where: { id: account.id },
        data: { qrCode, status: 'QR_REQUIRED' },
      });

      this.logger.log(`QR generated for ${account.instanceName}`);

      return {
        qrCode,
        instanceName: account.instanceName,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate QR for ${account.instanceName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Отключить WhatsApp аккаунт
   */
  async disconnect(accountId: string) {
    const account = await this.getAccountById(accountId);

    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.evolutionApiUrl}/instance/logout/${account.instanceName}`,
          { headers: this.headers },
        ),
      );
    } catch (error) {
      this.logger.warn(`Evolution logout failed for ${account.instanceName}: ${error.message}`);
    }

    await this.prisma.whatsAppAccount.update({
      where: { id: account.id },
      data: { status: 'DISCONNECTED', qrCode: null },
    });

    this.logger.log(`Disconnected ${account.instanceName}`);
    return { success: true, message: `${account.name} отключён` };
  }

  /**
   * Переподключить — logout + QR
   */
  async reconnect(accountId: string) {
    await this.disconnect(accountId);
    await new Promise((res) => setTimeout(res, 2000));
    return this.generateQR(accountId);
  }

  /**
   * Обновить статус аккаунта (вызывается из webhook)
   */
  async updateAccountStatus(instanceName: string, status: string) {
    const mapped = this.mapEvolutionStatus(status);
    await this.prisma.whatsAppAccount.upsert({
      where: { instanceName },
      update: { status: mapped, updatedAt: new Date() },
      create: {
        instanceName,
        status: mapped,
        active: true,
      },
    });
    this.logger.log(`Status updated for ${instanceName}: ${mapped}`);
  }

  /**
   * Сохранить QR код (вызывается из webhook)
   */
  async updateQRCode(instanceName: string, qrCode: string) {
    await this.prisma.whatsAppAccount.upsert({
      where: { instanceName },
      update: { qrCode, status: 'QR_REQUIRED', updatedAt: new Date() },
      create: {
        instanceName,
        qrCode,
        status: 'QR_REQUIRED',
        active: true,
      },
    });
  }

  /**
   * Создать instance в Evolution API если не существует
   */
  private async ensureInstanceExists(instanceName: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.get(
          `${this.evolutionApiUrl}/instance/connectionState/${instanceName}`,
          { headers: this.headers },
        ),
      );
      this.logger.log(`Instance ${instanceName} already exists`);
    } catch {
      this.logger.log(`Creating instance ${instanceName}`);
      await firstValueFrom(
        this.httpService.post(
          `${this.evolutionApiUrl}/instance/create`,
          {
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: {
              url: `${this.backendUrl}/api/v1/whatsapp/webhook`,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
              enabled: true,
            },
          },
          { headers: this.headers },
        ),
      );
    }
  }

  /**
   * Настроить webhook для instance
   */
  async setWebhook(instanceName: string) {
    const webhookUrl = `${this.backendUrl}/api/v1/whatsapp/webhook`;
    await firstValueFrom(
      this.httpService.post(
        `${this.evolutionApiUrl}/webhook/set/${instanceName}`,
        {
          enabled: true,
          url: webhookUrl,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
        },
        { headers: this.headers },
      ),
    );
    this.logger.log(`Webhook set for ${instanceName}: ${webhookUrl}`);
  }

  /**
   * Маппинг статусов Evolution API → наши статусы
   */
  private mapEvolutionStatus(evolutionState: string): string {
    const mapping: Record<string, string> = {
      open: 'CONNECTED',
      connecting: 'CONNECTING',
      close: 'DISCONNECTED',
      closed: 'DISCONNECTED',
      qr: 'QR_REQUIRED',
      qrcode: 'QR_REQUIRED',
    };
    return mapping[evolutionState?.toLowerCase()] || 'DISCONNECTED';
  }
}
