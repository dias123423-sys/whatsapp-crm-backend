import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadFilterDto } from './dto/lead-filter.dto';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(
    private leadsService: LeadsService,
    private prisma: PrismaService,
  ) {}

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Dashboard stats for admin' })
  dashboard() {
    return this.leadsService.getDashboardStats();
  }

  @Get('my')
  @ApiOperation({ summary: 'Operator: get only my assigned leads' })
  async myLeads(@Request() req: any, @Query() filter: LeadFilterDto) {
    const operator = await this.prisma.operator.findUnique({
      where: { userId: req.user.id },
    });
    if (!operator) return { data: [], total: 0, skip: 0, take: 50 };
    return this.leadsService.findByOperator(operator.id, filter);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: get all leads with filters' })
  findAll(@Query() filter: LeadFilterDto) {
    return this.leadsService.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead by id' })
  findOne(@Param('id') id: string) {
    return this.leadsService.findById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: create lead manually' })
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update lead (status, operator, comment)' })
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @Request() req: any) {
    return this.leadsService.update(id, dto, req.user.id);
  }
}
