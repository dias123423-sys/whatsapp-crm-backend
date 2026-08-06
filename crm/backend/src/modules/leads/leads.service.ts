import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { AssignmentEngine } from '../assignments/assignment.engine';
import { ProcedureDetectorService } from '../webhook/procedure-detector.service';
import { LeadStatus, AssignmentAlgorithm } from '../../shared/enums';
import { PaginatedResult } from '../../shared/types/request.types';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadFiltersDto } from './dto/lead-filters.dto';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentEngine: AssignmentEngine,
    private readonly procedureDetector: ProcedureDetectorService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Create lead from webhook ──────────────────────────────────────────────
  async createFromWebhook(dto: CreateLeadDto) {
    const { companyId, phone, waName, firstMessage, waAccountId, campaignId, adId } = dto;

    // ── 1. Upsert client ────────────────────────────────────────────────────
    const client = await this.prisma.client.upsert({
      where: { companyId_phone: { companyId, phone } },
      create: { companyId, phone, waName },
      update: { waName: waName ?? undefined },
    });

    // ── 2. Duplicate check ──────────────────────────────────────────────────
    const existingLead = await this.prisma.lead.findFirst({
      where: {
        companyId,
        clientId: client.id,
        status: { notIn: [LeadStatus.CLOSED, LeadStatus.DUPLICATE] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingLead) {
      this.logger.log(`Duplicate lead for phone ${phone}, merging into ${existingLead.id}`);

      // Create duplicate lead referencing original
      const dup = await this.prisma.lead.create({
        data: {
          companyId,
          clientId: client.id,
          operatorId: existingLead.operatorId,
          campaignId: campaignId ?? undefined,
          adId: adId ?? undefined,
          waAccountId,
          firstMessage,
          status: LeadStatus.DUPLICATE,
          isDuplicate: true,
          duplicateOfId: existingLead.id,
        },
        include: this.defaultInclude(),
      });

      this.events.emit('lead.duplicate', dup);
      return dup;
    }

    // ── 3. Detect procedure ─────────────────────────────────────────────────
    const detection = await this.procedureDetector.detect(
      companyId,
      firstMessage,
      campaignId,
      adId,
    );

    // ── 4. Resolve campaign + branch ────────────────────────────────────────
    let branchId: string | undefined;
    let assignAlgo = AssignmentAlgorithm.ROUND_ROBIN;

    if (campaignId) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { branchId: true, assignAlgo: true },
      });
      if (campaign) {
        branchId = campaign.branchId ?? undefined;
        assignAlgo = campaign.assignAlgo as AssignmentAlgorithm;
      }
    }

    // ── 5. Assign operator ──────────────────────────────────────────────────
    const operatorId = await this.assignmentEngine.assign({
      companyId,
      branchId,
      procedureId: detection.procedureId ?? undefined,
      isVipClient: client.isVip,
      algorithm: assignAlgo,
    });

    // ── 6. Create lead ──────────────────────────────────────────────────────
    const lead = await this.prisma.lead.create({
      data: {
        companyId,
        branchId: branchId ?? undefined,
        clientId: client.id,
        operatorId: operatorId ?? undefined,
        campaignId: campaignId ?? undefined,
        adId: adId ?? undefined,
        procedureId: detection.procedureId ?? undefined,
        waAccountId,
        firstMessage,
        status: LeadStatus.NEW,
        confidence: detection.confidence,
        metadata: { detectedKeyword: detection.matched },
      },
      include: this.defaultInclude(),
    });

    // ── 7. Status history ───────────────────────────────────────────────────
    await this.prisma.leadStatusHistory.create({
      data: {
        leadId: lead.id,
        toStatus: LeadStatus.NEW,
        note: `Lead created. Assigned to operator ${operatorId ?? 'none'}`,
      },
    });

    this.logger.log(
      `New lead ${lead.id} | ${phone} | ${detection.procedureName ?? 'unknown'} | operator ${operatorId ?? 'unassigned'}`,
    );

    this.events.emit('lead.created', lead);
    return lead;
  }

  // ─── Update status ─────────────────────────────────────────────────────────
  async updateStatus(leadId: string, dto: UpdateLeadStatusDto, userId: string) {
    const lead = await this.findOne(leadId);

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        status: dto.status,
        ...(dto.status === LeadStatus.BOOKED ? { bookedAt: new Date() } : {}),
        ...(dto.status === LeadStatus.CLOSED ? { closedAt: new Date(), lostReason: dto.reason } : {}),
        ...(dto.scheduledCallAt ? { scheduledCallAt: new Date(dto.scheduledCallAt) } : {}),
      },
      include: this.defaultInclude(),
    });

    await this.prisma.leadStatusHistory.create({
      data: {
        leadId,
        fromStatus: lead.status,
        toStatus: dto.status,
        changedBy: userId,
        note: dto.note,
      },
    });

    this.events.emit('lead.status_changed', updated);
    return updated;
  }

  // ─── Find many (paginated + filtered) ─────────────────────────────────────
  async findMany(
    companyId: string,
    filters: LeadFiltersDto,
    operatorId?: string,
  ): Promise<PaginatedResult<unknown>> {
    const page  = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, filters.limit ?? 20);
    const skip  = (page - 1) * limit;

    const where: Record<string, unknown> = {
      companyId,
      ...(operatorId ? { operatorId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.procedureId ? { procedureId: filters.procedureId } : {}),
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.isDuplicate !== undefined ? { isDuplicate: filters.isDuplicate } : {}),
      ...(filters.operatorId ? { operatorId: filters.operatorId } : {}),
    };

    if (filters.search) {
      where['client'] = {
        OR: [
          { phone: { contains: filters.search } },
          { waName: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    if (filters.dateFrom || filters.dateTo) {
      where['createdAt'] = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        include: this.defaultInclude(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── Find one ──────────────────────────────────────────────────────────────
  async findOne(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        ...this.defaultInclude(),
        statusHistory: { orderBy: { createdAt: 'desc' } },
        calls: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' }, include: { operator: { include: { user: { select: { firstName: true, lastName: true } } } } } },
        messages: { orderBy: { timestamp: 'desc' }, take: 50 },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  // ─── Stats for dashboard ───────────────────────────────────────────────────
  async getStats(companyId: string, dateFrom: Date, dateTo: Date) {
    const where = {
      companyId,
      createdAt: { gte: dateFrom, lte: dateTo },
    };

    const [total, byStatus, byProcedure, byOperator] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['procedureId'],
        where: { ...where, procedureId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['operatorId'],
        where: { ...where, operatorId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const booked = byStatus.find((s) => s.status === 'BOOKED')?._count._all ?? 0;
    const conversion = total > 0 ? Math.round((booked / total) * 100) : 0;

    return { total, byStatus, byProcedure, byOperator, conversion };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────
  private defaultInclude() {
    return {
      client: true,
      operator: {
        include: {
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
      procedure: { select: { id: true, name: true, color: true, slug: true } },
      campaign: { select: { id: true, name: true, source: true } },
      ad: { select: { id: true, name: true } },
    } as const;
  }
}
