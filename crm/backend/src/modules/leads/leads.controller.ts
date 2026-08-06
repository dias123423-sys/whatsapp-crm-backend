import {
  Controller, Get, Patch, Post, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../shared/types/request.types';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { LeadFiltersDto } from './dto/lead-filters.dto';
import { CreateNoteDto } from '../notes/dto/create-note.dto';
import { NotesService } from '../notes/notes.service';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly notesService: NotesService,
  ) {}

  // ── GET /leads ─────────────────────────────────────────────────────────────
  @Get()
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: LeadFiltersDto,
  ) {
    // Operators only see their leads
    const operatorId =
      user.role === UserRole.OPERATOR ? user.operatorId : undefined;
    return this.leadsService.findMany(user.companyId, filters, operatorId);
  }

  // ── GET /leads/stats ───────────────────────────────────────────────────────
  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  getStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().setDate(1));
    const to   = dateTo   ? new Date(dateTo)   : new Date();
    return this.leadsService.getStats(user.companyId, from, to);
  }

  // ── GET /leads/:id ─────────────────────────────────────────────────────────
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  // ── PATCH /leads/:id/status ────────────────────────────────────────────────
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.updateStatus(id, dto, user.id);
  }

  // ── POST /leads/:id/notes ──────────────────────────────────────────────────
  @Post(':id/notes')
  addNote(
    @Param('id') leadId: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notesService.create(leadId, user.operatorId!, dto);
  }

  // ── PATCH /leads/:id/assign ────────────────────────────────────────────────
  @Patch(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  assign(
    @Param('id') leadId: string,
    @Body('operatorId') operatorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.updateStatus(
      leadId,
      { status: 'NEW' as import('../../shared/enums').LeadStatus },
      user.id,
    );
  }
}
