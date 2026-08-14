import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { UpdateLeadStatusDto, ReassignOperatorDto } from './dto/lead.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, LeadStatus } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Leads')
@Controller('leads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // ─────────────────────────────────────────────
  // GET ALL (Admin sees all; Operator sees own)
  // ─────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get all leads with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: LeadStatus })
  @ApiQuery({ name: 'operatorId', required: false, type: String })
  @ApiQuery({ name: 'period', required: false, enum: ['DAY', 'NIGHT'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'whatsappAccountId', required: false, type: String })
  @ApiQuery({ name: 'whatsappOwnerId', required: false, type: String })
  @ApiQuery({ name: 'botResult', required: false, enum: ['BOOKED', 'IN_PROGRESS', 'LOST'] })
  findAll(
    @CurrentUser() currentUser: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: LeadStatus,
    @Query('operatorId') operatorId?: string,
    @Query('period') period?: string,
    @Query('search') search?: string,
    @Query('whatsappAccountId') whatsappAccountId?: string,
    @Query('whatsappOwnerId') whatsappOwnerId?: string,
    @Query('botResult') botResult?: string,
  ) {
    // Оператор видит только свои лиды
    let effectiveOperatorId = operatorId;
    if (currentUser?.role === Role.OPERATOR) {
      effectiveOperatorId = currentUser.operator?.id;
      if (!effectiveOperatorId) {
        return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      }
    }

    return this.leadsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      status,
      effectiveOperatorId,
      period,
      search,
      whatsappAccountId,
      whatsappOwnerId,
      botResult,
    );
  }

  // ─────────────────────────────────────────────
  // GET MY LEADS (Operator shortcut)
  // ─────────────────────────────────────────────

  @Get('my-leads')
  @UseGuards(RolesGuard)
  @Roles(Role.OPERATOR)
  @ApiOperation({ summary: 'Get my leads (Operator only)' })
  getMyLeads(
    @CurrentUser() currentUser: any,
    @Query('status') status?: LeadStatus,
  ) {
    const operatorId = currentUser?.operator?.id;
    if (!operatorId) return [];
    return this.leadsService.findByOperator(operatorId, status);
  }

  // ─────────────────────────────────────────────
  // GET ONE
  // ─────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get lead by ID' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: any) {
    const lead = await this.leadsService.findOne(id);

    // Оператор не может получить чужой лид
    if (
      currentUser?.role === Role.OPERATOR &&
      lead.operatorId !== currentUser?.operator?.id
    ) {
      throw new ForbiddenException('Access denied to this lead');
    }

    return lead;
  }

  // ─────────────────────────────────────────────
  // ASSIGN OPERATOR (Admin only)
  // ─────────────────────────────────────────────

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign operator to lead (Admin only)' })
  @ApiResponse({ status: 200, description: 'Lead assigned successfully' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  assign(@Param('id') id: string, @Body() dto: ReassignOperatorDto) {
    return this.leadsService.assignOperator(id, dto.operatorId);
  }

  // ─────────────────────────────────────────────
  // BULK ASSIGN (Admin only)
  // ─────────────────────────────────────────────

  @Post('assign-bulk')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Bulk assign leads to operator (Admin only)' })
  assignBulk(@Body() body: { leadIds: string[]; operatorId: string }) {
    return this.leadsService.assignBulk(body.leadIds, body.operatorId);
  }

  // ─────────────────────────────────────────────
  // UPDATE STATUS
  // ─────────────────────────────────────────────

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiOperation({ summary: 'Update lead status' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
    @CurrentUser() currentUser: any,
  ) {
    const operatorId =
      currentUser?.role === Role.OPERATOR ? currentUser?.operator?.id : undefined;
    return this.leadsService.updateStatus(id, dto, operatorId);
  }

  // ─────────────────────────────────────────────
  // REASSIGN (alias, Admin only)
  // ─────────────────────────────────────────────

  @Patch(':id/reassign')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reassign lead to another operator (Admin only)' })
  reassign(@Param('id') id: string, @Body() dto: ReassignOperatorDto) {
    return this.leadsService.assignOperator(id, dto.operatorId);
  }

  // ─────────────────────────────────────────────
  // DELETE (Admin only)
  // ─────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete lead (Admin only)' })
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id);
  }
}
