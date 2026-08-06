import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import * as path from 'path';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get()
  getList() {
    return this.reportsService.getReportsList();
  }

  @Post('generate/night')
  async generateNight() {
    const files = await this.reportsService.generateNightReport();
    return { files: files.map(f => path.basename(f)) };
  }

  @Post('generate/daily')
  async generateDaily() {
    const files = await this.reportsService.generateDailyReport();
    return { files: files.map(f => path.basename(f)) };
  }

  @Get('download')
  async download(@Query('file') file: string, @Res() res: Response) {
    const filePath = path.join(process.cwd(), 'reports', path.basename(file));
    res.download(filePath);
  }
}
