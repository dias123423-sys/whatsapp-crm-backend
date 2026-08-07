import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignmentService } from '../assignment/assignment.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { SseService } from '../notifications/sse.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadFilterDto } from './dto/lead-filter.dto';
import dayjs from 'dayjs';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private assignment: AssignmentService,
    private notifications: NotificationsGateway,
    private sse: SseService,
  ) {}

  // ── Period ────────────────────────────────────────────────────────────────
  private determinePeriod(): 'DAY' | 'NIGHT' {
    const hour = dayjs().hour();
    return hour >= 19 || hour < 9 ? 'NIGHT' : 'DAY';
  }

  // ── Create from WhatsApp webhook ──────────────────────────────────────────
  // RULE: ALWAYS create a lead. procedureId = NULL if not detected.
  async createFromWebhook(data: {
    phone: string;
    name?: string;
    message: string;
    messageType?: string;
    source?: string;
    whatsappInstanceName?: string;
  }) {
    // Upsert client
    const client = await this.prisma.client.upsert({
      where: { phone: data.phone },
      update: { ...(data.name ? { name: data.name } : {}) },
      create: {
        phone: data.phone,
        name: data.name || null,
        source: 'WHATSAPP',
      },
    });

    // Try to detect procedure — NEVER block lead creation on this
    let procedure: any = null;
    try {
      procedure = await this.detectProcedure(data.message);
    } catch {
      procedure = null;
    }

    // Auto-assign operator (Round Robin / Least Busy)
    let operatorId: string | null = null;
    try {
      operatorId = await this.assignment.assignOperator();
    } catch {
      operatorId = null;
    }

    const period = this.determinePeriod();

    // Resolve WhatsApp account
    let whatsappAccountId: string | null = null;
    if (data.whatsappInstanceName) {
      const wa = await this.prisma.whatsAppAccount.findUnique({
        where: { instanceName: data.whatsappInstanceName },
      });
      whatsappAccountId = wa?.id ?? null;
    }

    // CREATE LEAD — always, no matter what
    const lead = await this.prisma.lead.create({
      data: {
        clientId: client.id,
        operatorId,
        procedureId: procedure?.id ?? null,   // NULL if not detected
        price: procedure?.price ?? null,
        source: 'WHATSAPP',
        period,
        status: 'NEW',
      },
      include: {
        client: true,
        operator: true,
        procedure: true,
      },
    });

    // History entry
    const historyEvent = procedure
      ? `Лид создан через WhatsApp | Процедура: ${procedure.name}`
      : `Лид создан через WhatsApp | Процедура не определена`;

    await this.prisma.leadHistory.create({
      data: {
        leadId: lead.id,
        event: historyEvent,
        details: data.message ? data.message.slice(0, 500) : `[${data.messageType || 'message'}]`,
      },
    });

    // Notify via WebSocket
    try {
      this.notifications.notifyNewLead(lead);
    } catch {}

    // Notify via SSE (dashboard + leads table auto-update)
    try {
      this.sse.emit({ type: 'new_lead', data: lead });
    } catch {}

    return lead;
  }

  // ── Create manually ────────────────────────────────────────────────────────
  async create(dto: CreateLeadDto) {
    let operatorId = dto.operatorId;
    if (!operatorId) {
      operatorId = await this.assignment.assignOperator();
    }

    const lead = await this.prisma.lead.create({
      data: {
        clientId: dto.clientId,
        operatorId,
        procedureId: dto.procedureId ?? null,
        price: dto.price ?? null,
        source: dto.source || 'MANUAL',
        period: this.determinePeriod(),
        status: 'NEW',
      },
      include: { client: true, operator: true, procedure: true },
    });

    await this.prisma.leadHistory.create({
      data: { leadId: lead.id, event: 'Лид создан вручную' },
    });

    try { this.notifications.notifyNewLead(lead); } catch {}
    try { this.sse.emit({ type: 'new_lead', data: lead }); } catch {}
    return lead;
  }

  // ── Find all ───────────────────────────────────────────────────────────────
  async findAll(filter: LeadFilterDto) {
    const where: any = {};

    if (filter.status) where.status = filter.status;
    if (filter.operatorId) where.operatorId = filter.operatorId;
    if (filter.procedureId) where.procedureId = filter.procedureId;
    if (filter.source) where.source = filter.source;
    if (filter.period) where.period = filter.period;

    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {};
      if (filter.dateFrom) where.createdAt.gte = new Date(filter.dateFrom);
      if (filter.dateTo) where.createdAt.lte = new Date(filter.dateTo);
    }

    if (filter.search) {
      where.OR = [
        { client: { phone: { contains: filter.search, mode: 'insensitive' } } },
        { client: { name: { contains: filter.search, mode: 'insensitive' } } },
      ];
    }

    const skip = filter.skip || 0;
    const take = filter.take || 50;

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: { client: true, operator: true, procedure: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, skip, take };
  }

  async findByOperator(operatorId: string, filter: LeadFilterDto) {
    return this.findAll({ ...filter, operatorId });
  }

  async findById(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        client: true,
        operator: { include: { user: { select: { email: true } } } },
        procedure: true,
        calls: { orderBy: { calledAt: 'desc' } },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!lead) throw new NotFoundException('Лид не найден');
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto, userId?: string) {
    await this.findById(id);

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        status: dto.status,
        operatorId: dto.operatorId,
        procedureId: dto.procedureId,
        price: dto.price,
        comment: dto.comment,
        result: dto.result,
        assignedAt: dto.operatorId ? new Date() : undefined,
      },
      include: { client: true, operator: true, procedure: true },
    });

    if (dto.status || dto.operatorId || dto.comment) {
      await this.prisma.leadHistory.create({
        data: {
          leadId: id,
          event: dto.status
            ? `Статус изменён → ${dto.status}`
            : dto.operatorId
            ? `Назначен оператор`
            : 'Обновлён комментарий',
          details: dto.comment || null,
        },
      });
      try { this.notifications.notifyLeadUpdate(lead); } catch {}
      try { this.sse.emit({ type: 'lead_updated', data: lead }); } catch {}
    }

    return lead;
  }

  async getDashboardStats() {
    const todayStart = dayjs().startOf('day').toDate();
    const yesterdayStart = dayjs().subtract(1, 'day').startOf('day').toDate();
    const yesterdayEnd = dayjs().subtract(1, 'day').endOf('day').toDate();

    const [
      total,
      todayCount,
      yesterdayCount,
      newLeads,
      unprocessed,
      booked,
    ] = await Promise.all([
      // All-time total
      this.prisma.lead.count(),
      // Today
      this.prisma.lead.count({ where: { createdAt: { gte: todayStart } } }),
      // Yesterday
      this.prisma.lead.count({ where: { createdAt: { gte: yesterdayStart, lte: yesterdayEnd } } }),
      // New today (status = NEW)
      this.prisma.lead.count({ where: { status: 'NEW', createdAt: { gte: todayStart } } }),
      // Unprocessed = NEW regardless of date (not yet touched)
      this.prisma.lead.count({ where: { status: 'NEW' } }),
      // Booked today
      this.prisma.lead.count({ where: { status: 'BOOKED', createdAt: { gte: todayStart } } }),
    ]);

    const conversion = todayCount > 0 ? Math.round((booked / todayCount) * 100) : 0;

    return {
      total,
      today: todayCount,
      yesterday: yesterdayCount,
      newLeads,
      unprocessed,
      booked,
      conversion,
    };
  }

  // ── Procedure detection (secondary — never blocks lead creation) ──────────
  async detectProcedure(message: string) {
    if (!message) return null;

    const procedures = await this.prisma.procedure.findMany({
      where: { isActive: true },
    });

    // Normalize text
    const lower = message
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[+*•\-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Skip obvious non-procedure messages
    const skipPatterns = [
      /^\[.*\]$/,      // [media], [sticker] etc
      /^(ok|ок|да|нет|иә|жоқ|привет|сәлем|hello|hi|👍|👋|❤️|😊|\?+|!+|\.+)$/i,
    ];
    if (skipPatterns.some(p => p.test(lower.trim()))) return null;

    // Score-based matching: longer keyword = more specific = higher score
    let best: { proc: any; score: number } | null = null;

    for (const proc of procedures) {
      let score = 0;
      for (const keyword of proc.keywords) {
        const kw = keyword.toLowerCase().replace(/ё/g, 'е').trim();
        if (kw && lower.includes(kw)) {
          score += kw.length * 2; // Weight longer matches more
        }
      }
      // Also check procedure name itself
      const procName = proc.name.toLowerCase().replace(/ё/g, 'е');
      if (lower.includes(procName)) {
        score += procName.length * 3;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { proc, score };
      }
    }

    return best?.proc ?? null;
  }
}
