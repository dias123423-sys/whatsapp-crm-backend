import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignmentService } from '../assignment/assignment.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
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
  ) {}

  private determinePeriod(): 'DAY' | 'NIGHT' {
    const hour = dayjs().hour();
    return hour >= 19 || hour < 8 ? 'NIGHT' : 'DAY';
  }

  async createFromWebhook(data: {
    phone: string;
    name?: string;
    message: string;
    source?: string;
    whatsappInstanceId?: string;
  }) {
    // Upsert client
    const client = await this.prisma.client.upsert({
      where: { phone: data.phone },
      update: { name: data.name || undefined },
      create: {
        phone: data.phone,
        name: data.name || null,
        source: (data.source as any) || 'WHATSAPP',
      },
    });

    // Detect procedure from message
    const procedure = await this.detectProcedure(data.message);

    // Get operator
    const operatorId = await this.assignment.assignOperator();

    const period = this.determinePeriod();

    const lead = await this.prisma.lead.create({
      data: {
        clientId: client.id,
        operatorId,
        procedureId: procedure?.id,
        price: procedure?.price,
        source: (data.source as any) || 'WHATSAPP',
        period,
      },
      include: {
        client: true,
        operator: true,
        procedure: true,
      },
    });

    // Add history
    await this.prisma.leadHistory.create({
      data: {
        leadId: lead.id,
        event: 'Лид создан через WhatsApp',
        details: `Сообщение: ${data.message.substring(0, 200)}`,
      },
    });

    // Notify via WebSocket
    this.notifications.notifyNewLead(lead);

    return lead;
  }

  async create(dto: CreateLeadDto) {
    let operatorId = dto.operatorId;
    if (!operatorId) {
      operatorId = await this.assignment.assignOperator();
    }

    const lead = await this.prisma.lead.create({
      data: {
        clientId: dto.clientId,
        operatorId,
        procedureId: dto.procedureId,
        price: dto.price,
        source: dto.source || 'MANUAL',
        period: this.determinePeriod(),
      },
      include: { client: true, operator: true, procedure: true },
    });

    await this.prisma.leadHistory.create({
      data: { leadId: lead.id, event: 'Лид создан вручную' },
    });

    this.notifications.notifyNewLead(lead);
    return lead;
  }

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

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: { client: true, operator: true, procedure: true },
        orderBy: { createdAt: 'desc' },
        skip: filter.skip || 0,
        take: filter.take || 50,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, skip: filter.skip || 0, take: filter.take || 50 };
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

    if (dto.status) {
      await this.prisma.leadHistory.create({
        data: {
          leadId: id,
          event: `Статус изменён на ${dto.status}`,
          details: dto.comment,
        },
      });
      this.notifications.notifyLeadUpdate(lead);
    }

    return lead;
  }

  async getDashboardStats() {
    const today = dayjs().startOf('day').toDate();

    const [newLeads, processed, booked, total] = await Promise.all([
      this.prisma.lead.count({ where: { status: 'NEW', createdAt: { gte: today } } }),
      this.prisma.lead.count({ where: { status: { not: 'NEW' }, createdAt: { gte: today } } }),
      this.prisma.lead.count({ where: { status: 'BOOKED', createdAt: { gte: today } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: today } } }),
    ]);

    const conversion = total > 0 ? Math.round((booked / total) * 100) : 0;

    return { newLeads, processed, booked, total, conversion };
  }

  private async detectProcedure(message: string) {
    const procedures = await this.prisma.procedure.findMany({ where: { isActive: true } });
    const lower = message.toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[+*•]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Score each procedure — more matching keywords = higher score
    let best: { proc: any; score: number } | null = null;

    for (const proc of procedures) {
      let score = 0;
      for (const keyword of proc.keywords) {
        const kw = keyword.toLowerCase().replace(/ё/g, 'е');
        if (lower.includes(kw)) {
          // Longer keyword match = more specific = higher score
          score += kw.length;
        }
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { proc, score };
      }
    }

    return best?.proc || null;
  }
}
