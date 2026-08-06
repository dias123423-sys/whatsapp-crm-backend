import { Controller, Get, Param, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OperatorsService } from './operators.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('operators')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operators')
export class OperatorsController {
  constructor(private operatorsService: OperatorsService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all operators with stats' })
  findAll() {
    return this.operatorsService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.operatorsService.findById(id);
  }

  @Get(':id/stats')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get operator stats' })
  stats(@Param('id') id: string) {
    return this.operatorsService.getStats(id);
  }

  @Put(':id/status')
  @Roles('ADMIN')
  updateStatus(@Param('id') id: string, @Body('status') status: 'ACTIVE' | 'INACTIVE') {
    return this.operatorsService.updateStatus(id, status);
  }
}
