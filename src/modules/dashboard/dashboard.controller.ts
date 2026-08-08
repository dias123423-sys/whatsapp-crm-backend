import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('leads-chart')
  @ApiOperation({ summary: 'Get leads chart data' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Chart data retrieved' })
  getLeadsChart(@Query('days') days?: string) {
    return this.dashboardService.getLeadsChart(days ? parseInt(days) : 7);
  }

  @Get('operators-performance')
  @ApiOperation({ summary: 'Get operators performance' })
  @ApiResponse({ status: 200, description: 'Performance data retrieved' })
  getOperatorsPerformance() {
    return this.dashboardService.getOperatorsPerformance();
  }

  @Get('procedures-stats')
  @ApiOperation({ summary: 'Get procedures statistics' })
  @ApiResponse({ status: 200, description: 'Procedures stats retrieved' })
  getProceduresStats() {
    return this.dashboardService.getStats();
  }

  @Get('recent-activity')
  @ApiOperation({ summary: 'Get recent activity' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Recent activity retrieved' })
  getRecentActivity(@Query('limit') limit?: string) {
    return this.dashboardService.getRecentActivity(limit ? parseInt(limit) : 10);
  }
}
