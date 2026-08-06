import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EvolutionService } from './evolution.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private evolutionService: EvolutionService) {}

  @Get()
  @ApiOperation({ summary: 'Get all WhatsApp instances' })
  getAllInstances() {
    return this.evolutionService.getAllInstances();
  }

  @Get(':instanceName/status')
  getStatus(@Param('instanceName') name: string) {
    return this.evolutionService.getInstanceStatus(name);
  }

  @Get(':instanceName/qr')
  @ApiOperation({ summary: 'Get QR code for connection' })
  getQr(@Param('instanceName') name: string) {
    return this.evolutionService.getQrCode(name);
  }

  @Post()
  @ApiOperation({ summary: 'Create new WhatsApp instance' })
  createInstance(@Body('instanceName') instanceName: string) {
    return this.evolutionService.createInstance(instanceName);
  }

  @Delete(':instanceName')
  deleteInstance(@Param('instanceName') name: string) {
    return this.evolutionService.deleteInstance(name);
  }
}
