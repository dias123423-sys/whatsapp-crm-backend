import { Controller, Get, Post, Query, Res, Param, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ─────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Report statistics' })
  getStats() {
    return this.reportsService.getReportStats();
  }

  // ─────────────────────────────────────────────
  // GENERATE (POST)
  // ─────────────────────────────────────────────

  @Post('today')
  @ApiOperation({ summary: 'Generate today Excel report' })
  generateToday() {
    return this.reportsService.generateTodayReport();
  }

  @Post('yesterday')
  @ApiOperation({ summary: 'Generate yesterday Excel report' })
  generateYesterday() {
    return this.reportsService.generateYesterdayReport();
  }

  @Post('night')
  @ApiOperation({ summary: 'Generate night report (19:00–09:00, Asia/Almaty)' })
  generateNight() {
    return this.reportsService.generateNightReport();
  }

  @Post('day')
  @ApiOperation({ summary: 'Generate day report (09:00–19:00, Asia/Almaty)' })
  generateDay() {
    return this.reportsService.generateDayReport();
  }

  @Post('custom')
  @ApiOperation({ summary: 'Generate custom date range report' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  generateCustom(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.generateCustomReport(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Post('owner/:ownerId')
  @ApiOperation({ summary: 'Generate report for specific WhatsApp owner (Танат/Улдай)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  generateOwner(
    @Param('ownerId') ownerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.generateOwnerReport(
      ownerId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  // ─────────────────────────────────────────────
  // EXCEL DOWNLOAD (GET) — called by frontend
  // ─────────────────────────────────────────────

  /**
   * GET /reports/excel?period=today|yesterday|night|day|week|month|custom
   * Returns Excel file as binary response.
   */
  @Get('excel')
  @ApiOperation({ summary: 'Download Excel for period (Admin only)' })
  @ApiQuery({ name: 'period', required: true, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'whatsappOwnerId', required: false, type: String })
  async downloadExcel(
    @Query('period') period: string,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('whatsappOwnerId') whatsappOwnerId: string | undefined,
    @Res() res: Response,
  ) {
    let result: { filename: string };

    if (whatsappOwnerId) {
      result = await this.reportsService.generateOwnerReport(
        whatsappOwnerId,
        dateFrom ? new Date(dateFrom) : undefined,
        dateTo ? new Date(dateTo) : undefined,
      );
    } else {
      switch (period) {
        case 'today':
          result = await this.reportsService.generateTodayReport();
          break;
        case 'yesterday':
          result = await this.reportsService.generateYesterdayReport();
          break;
        case 'night':
          result = await this.reportsService.generateNightReport();
          break;
        case 'day':
          result = await this.reportsService.generateDayReport();
          break;
        case 'custom':
          if (!dateFrom || !dateTo) {
            res.status(400).json({ message: 'dateFrom and dateTo required for custom period' });
            return;
          }
          result = await this.reportsService.generateCustomReport(
            new Date(dateFrom),
            new Date(dateTo),
          );
          break;
        default:
          result = await this.reportsService.generateTodayReport();
      }
    }

    const filepath = `./storage/reports/${result.filename}`;
    if (!fs.existsSync(filepath)) {
      res.status(404).json({ message: 'Report file not found' });
      return;
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.sendFile(path.resolve(filepath));
  }

  // ─────────────────────────────────────────────
  // DOWNLOAD BY FILENAME
  // ─────────────────────────────────────────────

  @Get('download')
  @ApiOperation({ summary: 'Download report file by filename' })
  @ApiQuery({ name: 'filename', required: true, type: String })
  async downloadByFilename(
    @Query('filename') filename: string,
    @Res() res: Response,
  ) {
    const filepath = await this.reportsService.downloadReport(filename);
    res.download(filepath, filename);
  }

  @Post('cleanup')
  @ApiOperation({ summary: 'Cleanup old report files' })
  @ApiQuery({ name: 'daysOld', required: false, type: Number })
  async cleanup(@Query('daysOld') daysOld?: string) {
    const count = await this.reportsService.cleanupOldReports(
      daysOld ? parseInt(daysOld) : 30,
    );
    return { message: 'Cleanup completed', deletedFiles: count };
  }
}
