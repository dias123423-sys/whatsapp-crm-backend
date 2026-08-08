import { Controller, Get, Post, Param, UseGuards, Logger } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { WhatsAppService } from './whatsapp.service';
import { Role } from '@prisma/client';

@ApiTags('WhatsApp')
@ApiBearerAuth()
@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private whatsappService: WhatsAppService) {}

  /**
   * GET /whatsapp
   * Получить все 4 WhatsApp аккаунта из БД с актуальными статусами
   */
  @Get()
  @ApiOperation({ summary: 'Get all WhatsApp accounts with real-time status' })
  async getAllAccounts() {
    return this.whatsappService.getAllAccounts();
  }

  /**
   * GET /whatsapp/:id
   * Получить один WhatsApp аккаунт
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get WhatsApp account by ID' })
  async getAccount(@Param('id') id: string) {
    return this.whatsappService.getAccountById(id);
  }

  /**
   * GET /whatsapp/:id/status
   * Получить статус подключения
   */
  @Get(':id/status')
  @ApiOperation({ summary: 'Get connection status from Evolution API' })
  async getStatus(@Param('id') id: string) {
    const account = await this.whatsappService.getAccountById(id);
    const status = await this.whatsappService.getInstanceStatus(account.instanceName);
    return { status: status.state, phone: status.phone };
  }

  /**
   * POST /whatsapp/:id/qr
   * Сгенерировать QR код для подключения (также создаёт instance если нет)
   */
  @Post(':id/qr')
  @ApiOperation({ summary: 'Generate QR code for WhatsApp connection' })
  async generateQR(@Param('id') id: string) {
    return this.whatsappService.generateQR(id);
  }

  /**
   * POST /whatsapp/:id/connect
   * Алиас для generateQR (совместимость с frontend)
   */
  @Post(':id/connect')
  @ApiOperation({ summary: 'Connect WhatsApp account (generates QR)' })
  async connect(@Param('id') id: string) {
    return this.whatsappService.generateQR(id);
  }

  /**
   * POST /whatsapp/:id/disconnect
   * Отключить WhatsApp аккаунт
   */
  @Post(':id/disconnect')
  @ApiOperation({ summary: 'Disconnect WhatsApp account' })
  async disconnect(@Param('id') id: string) {
    return this.whatsappService.disconnect(id);
  }

  /**
   * POST /whatsapp/:id/reconnect
   * Переподключить (logout + новый QR)
   */
  @Post(':id/reconnect')
  @ApiOperation({ summary: 'Reconnect WhatsApp account (logout + new QR)' })
  async reconnect(@Param('id') id: string) {
    return this.whatsappService.reconnect(id);
  }
}
