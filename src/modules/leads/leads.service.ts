import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateLeadStatusDto } from './dto/lead.dto';
import { LeadStatus } from '@prisma/client';
import { OperatorsService } from '../operators/operators.service';
import { WebSocketGateway as WsGateway } from '../websocket/websocket.gateway';

/** Стандартный include для Lead — везде одинаковый */
const LEAD_INCLUDE = {
  client: true,
  operator: {
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true },
      },
    },
  },
  procedure: true,
  offer: true,
  whatsappAccount: {
    include: { owner: true },
  },
  whatsappOwner: true,
} as const;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => OperatorsService))
    private operatorsService: OperatorsService,
    @Inject(forwardRef(() => WsGateway))
    private wsGateway: WsGateway,
  ) {}

  // ─────────────────────────────────────────────
  // GET ALL with filters
  // ─────────────────────────────────────────────

  async findAll(
    page = 1,
    limit = 20,
    status?: LeadStatus,
    operatorId?: string,
    period?: string,
    search?: string,
    whatsappAccountId?: string,
    whatsappOwnerId?: string,
    botResult?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) where.status = status;
    if (operatorId === 'unassigned') {
      where.operatorId = null;
    } else if (operatorId) {
      where.operatorId = operatorId;
    }
    if (period) where.period = period;
    if (whatsappAccountId) where.whatsappAccountId = whatsappAccountId;
    if (whatsappOwnerId) where.whatsappOwnerId = whatsappOwnerId;
    if (botResult) where.botResult = botResult;

    if (search) {
      where.OR = [
        { originalMessage: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { client: { phone: { contains: search } } },
        { client: { normalizedPhone: { contains: search } } },
        { client: { whatsappName: { contains: search, mode: 'insensitive' } } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        include: LEAD_INCLUDE,
        orderBy: { updatedAt: 'desc' },  // Changed from createdAt to updatedAt
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data: leads,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─────────────────────────────────────────────
  // GET ONE
  // ─────────────────────────────────────────────

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        ...LEAD_INCLUDE,
        client: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
          },
        },
        appointments: { orderBy: { date: 'desc' } },
      },
    });

    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  // ─────────────────────────────────────────────
  // GET MY LEADS (operator)
  // ─────────────────────────────────────────────

  async findByOperator(operatorId: string, status?: LeadStatus) {
    const where: any = { operatorId };
    if (status) where.status = status;

    return this.prisma.lead.findMany({
      where,
      include: LEAD_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─────────────────────────────────────────────
  // ASSIGN OPERATOR (Admin only)
  // ─────────────────────────────────────────────

  async assignOperator(leadId: string, newOperatorId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const oldOperatorId = lead.operatorId;

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        operatorId: newOperatorId,
        status: LeadStatus.ASSIGNED,
        assignedAt: new Date(),
      },
      include: LEAD_INCLUDE,
    });

    // Обновляем счётчики операторов
    if (oldOperatorId && oldOperatorId !== newOperatorId) {
      await this.operatorsService.decrementCurrentLeads(oldOperatorId);
    }
    if (newOperatorId && oldOperatorId !== newOperatorId) {
      await this.operatorsService.incrementCurrentLeads(newOperatorId);
    }
    if (!oldOperatorId) {
      // Первое назначение
      await this.operatorsService.incrementCurrentLeads(newOperatorId);
    }

    this.logger.log(`Lead assigned: ${leadId} → operator ${newOperatorId}`);
    this.wsGateway.emitLeadAssigned(updated);

    return updated;
  }

  // ─────────────────────────────────────────────
  // BULK ASSIGN (Admin only)
  // ─────────────────────────────────────────────

  async assignBulk(leadIds: string[], operatorId: string) {
    const results = await Promise.all(
      leadIds.map((id) => this.assignOperator(id, operatorId)),
    );
    return { assigned: results.length, operatorId };
  }

  // ─────────────────────────────────────────────
  // UPDATE STATUS
  // ─────────────────────────────────────────────

  async updateStatus(id: string, dto: UpdateLeadStatusDto, currentUserOperatorId?: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    // Оператор может менять только свои лиды
    if (currentUserOperatorId && lead.operatorId !== currentUserOperatorId) {
      throw new ForbiddenException('You can only update your own leads');
    }

    const oldStatus = lead.status;

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes !== undefined ? dto.notes : lead.notes,
        completedAt:
          dto.status === LeadStatus.CLOSED || dto.status === LeadStatus.BOOKED
            ? new Date()
            : lead.completedAt,
      },
      include: LEAD_INCLUDE,
    });

    // Обновляем счётчики
    if (dto.status === LeadStatus.BOOKED && lead.operatorId) {
      await this.operatorsService.incrementTotalBooked(lead.operatorId);
    }
    if (dto.status === LeadStatus.CLOSED && lead.operatorId) {
      await this.operatorsService.decrementCurrentLeads(lead.operatorId);
    }

    this.logger.log(
      `Status updated: lead=${id} ${oldStatus} → ${dto.status}`,
    );
    this.wsGateway.emitLeadUpdated(updated);

    return updated;
  }

  // ─────────────────────────────────────────────
  // UPDATE (general fields)
  // ─────────────────────────────────────────────

  async update(id: string, data: any) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
      include: LEAD_INCLUDE,
    });

    this.wsGateway.emitLeadUpdated(updated);
    return updated;
  }

  // ─────────────────────────────────────────────
  // DELETE (Admin only)
  // ─────────────────────────────────────────────

  async remove(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    if (lead.operatorId && lead.status !== LeadStatus.CLOSED) {
      await this.operatorsService.decrementCurrentLeads(lead.operatorId);
    }

    await this.prisma.lead.delete({ where: { id } });
    this.logger.log(`Lead deleted: ${id}`);
    return { message: 'Lead deleted' };
  }

  // ─────────────────────────────────────────────
  // LEGACY alias (called from old parser)
  // ─────────────────────────────────────────────

  async reassignOperator(leadId: string, newOperatorId: string) {
    return this.assignOperator(leadId, newOperatorId);
  }
}
