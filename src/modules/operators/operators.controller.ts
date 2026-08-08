import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { OperatorsService } from './operators.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Operators')
@Controller('operators')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OperatorsController {
  constructor(private readonly operatorsService: OperatorsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all operators' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Operators retrieved successfully' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.operatorsService.findAll(activeOnly === 'true');
  }

  @Get('leaderboard')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get operators leaderboard (Admin only)' })
  @ApiQuery({ name: 'startDate', required: false, type: Date })
  @ApiQuery({ name: 'endDate', required: false, type: Date })
  @ApiResponse({ status: 200, description: 'Leaderboard retrieved successfully' })
  getLeaderboard(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.operatorsService.getLeaderboard(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get operator by ID' })
  @ApiResponse({ status: 200, description: 'Operator retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Operator not found' })
  findOne(@Param('id') id: string) {
    return this.operatorsService.findOne(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get operator statistics' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Operator not found' })
  getStats(@Param('id') id: string) {
    return this.operatorsService.getStats(id);
  }

  @Get(':id/performance')
  @ApiOperation({ summary: 'Get operator performance' })
  @ApiQuery({ name: 'startDate', required: false, type: Date })
  @ApiQuery({ name: 'endDate', required: false, type: Date })
  @ApiResponse({ status: 200, description: 'Performance retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Operator not found' })
  getPerformance(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.operatorsService.getPerformance(
      id,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Patch(':id/toggle-active')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Toggle operator active status (Admin only)' })
  @ApiResponse({ status: 200, description: 'Status toggled successfully' })
  @ApiResponse({ status: 404, description: 'Operator not found' })
  toggleActive(@Param('id') id: string) {
    return this.operatorsService.toggleActive(id);
  }
}
