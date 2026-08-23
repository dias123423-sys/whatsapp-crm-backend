import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeadStatus } from '@prisma/client';

const TZ = process.env.APP_TIMEZONE || 'Asia/Almaty';

function todayStartAlmaty(): Date {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return new Date(`${y}-${m}-${d}T00:00:00+05:00`);
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Main dashboard stats — all data from PostgreSQL.
   * Returns flat structure that frontend expects:
   * { totalLeads, todayLeads, newLeads, inProgress, bookedLeads,
   *   followUpLeads, noAnswerLeads, closedLeads,
   *   whatsappStats, procedureStats, operatorStats }
   */
  async getStats() {
    const todayStart = todayStartAlmaty();
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const [
      totalLeads,
      todayLeads,
      newLeads,
      assignedLeads,
      callingLeads,
      bookedLeads,
      followUpLeads,
      noAnswerLeads,
      closedLeads,
      bookedResult,
      unknownResult,
      lostResult,
      // OLD PARSER METRICS
      withProcedure,
      withoutProcedure,
      withPrice,
      withoutPrice,
      withDate,
      withoutDate,
      withTime,
      withoutTime,
    ] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.lead.count({ where: { status: LeadStatus.NEW } }),
      this.prisma.lead.count({ where: { status: LeadStatus.ASSIGNED } }),
      this.prisma.lead.count({ where: { status: LeadStatus.CALLING } }),
      this.prisma.lead.count({ where: { status: LeadStatus.BOOKED } }),
      this.prisma.lead.count({ where: { status: LeadStatus.FOLLOW_UP } }),
      this.prisma.lead.count({ where: { status: LeadStatus.NO_ANSWER } }),
      this.prisma.lead.count({ where: { status: LeadStatus.CLOSED } }),
      // RESULT PARSER (botResult)
      this.prisma.lead.count({ where: { botResult: 'BOOKED' } }),
      this.prisma.lead.count({ where: { botResult: 'UNKNOWN' } }),
      this.prisma.lead.count({ where: { botResult: 'LOST' } }),
      // OLD PARSER (parsedProcedures, parsedPrice, parsedDate, parsedTime)
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count 
        FROM leads 
        WHERE array_length("parsedProcedures", 1) > 0
      `.then(r => Number(r[0].count)),
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count 
        FROM leads 
        WHERE array_length("parsedProcedures", 1) IS NULL OR array_length("parsedProcedures", 1) = 0
      `.then(r => Number(r[0].count)),
      this.prisma.lead.count({ 
        where: { 
          parsedPrice: { not: null, gt: 0 } 
        } 
      }),
      this.prisma.lead.count({ 
        where: { 
          OR: [
            { parsedPrice: null },
            { parsedPrice: 0 },
          ]
        } 
      }),
      this.prisma.lead.count({ 
        where: { 
          parsedDate: { not: null } 
        } 
      }),
      this.prisma.lead.count({ 
        where: { 
          parsedDate: null 
        } 
      }),
      this.prisma.lead.count({ 
        where: { 
          parsedTime: { not: null } 
        } 
      }),
      this.prisma.lead.count({ 
        where: { 
          parsedTime: null 
        } 
      }),
    ]);

    const inProgress = assignedLeads + callingLeads;

    // ── WhatsApp stats ──
    const waAccounts = await this.prisma.whatsAppAccount.findMany({
      where: { active: true },
      include: {
        owner: true,
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate today's leads for each WhatsApp account
    const whatsappStats = await Promise.all(
      waAccounts.map(async (acc) => {
        const [todayLeadsCount, botBooked, botUnknown, botLost] = await Promise.all([
          this.prisma.lead.count({
            where: {
              whatsappAccountId: acc.id,
              createdAt: { gte: todayStart },
            },
          }),
          this.prisma.lead.count({
            where: { whatsappAccountId: acc.id, botResult: 'BOOKED' },
          }),
          this.prisma.lead.count({
            where: { whatsappAccountId: acc.id, botResult: 'UNKNOWN' },
          }),
          this.prisma.lead.count({
            where: { whatsappAccountId: acc.id, botResult: 'LOST' },
          }),
        ]);

        return {
          accountId: acc.id,
          accountName: acc.name ?? acc.instanceName,
          phone: acc.phone ?? null, // Add phone
          ownerName: acc.owner?.name ?? null,
          status: acc.status,
          leadsCount: acc._count.leads,
          todayLeadsCount, // NEW: today's leads count
          // Bot result stats
          botResultBooked: botBooked,
          botResultUnknown: botUnknown,
          botResultLost: botLost,
        };
      }),
    );

    // ── Procedure stats (top 10) ──
    const procedureGroups = await this.prisma.lead.groupBy({
      by: ['procedureId'],
      where: { procedureId: { not: null } },
      _count: { procedureId: true },
      orderBy: { _count: { procedureId: 'desc' } },
      take: 10,
    });

    const procedureStats = await Promise.all(
      procedureGroups.map(async (g) => {
        const proc = await this.prisma.procedure.findUnique({
          where: { id: g.procedureId! },
        });
        const booked = await this.prisma.lead.count({
          where: { procedureId: g.procedureId!, status: LeadStatus.BOOKED },
        });
        const totalRevenue = await this.prisma.lead.aggregate({
          where: { procedureId: g.procedureId!, status: LeadStatus.BOOKED },
          _sum: { parsedPrice: true },
        });
        return {
          procedureId: g.procedureId!,
          procedureName: proc?.name ?? 'Неизвестна',
          count: g._count.procedureId,
          bookedCount: booked,
          totalPrice: totalRevenue._sum.parsedPrice ?? 0,
        };
      }),
    );

    // ── Operator stats ──
    const operators = await this.prisma.operator.findMany({
      where: { active: true },
      include: {
        user: { select: { name: true } },
        _count: { select: { leads: true } },
      },
    });

    const operatorStats = operators.map((op) => ({
      operatorId: op.id,
      operatorName: op.user.name,
      leadsCount: op._count.leads,
      bookedCount: op.totalBooked,
      conversionRate:
        op.totalLeads > 0
          ? Math.round((op.totalBooked / op.totalLeads) * 10000) / 100
          : 0,
    }));

    return {
      totalLeads,
      todayLeads,
      newLeads,
      inProgress,
      bookedLeads,
      followUpLeads,
      noAnswerLeads,
      closedLeads,
      // Bot result stats (RESULT PARSER)
      botResultBooked: bookedResult,
      botResultUnknown: unknownResult,
      botResultLost: lostResult,
      // OLD PARSER stats (основные данные лида)
      withProcedure,
      withoutProcedure,
      withPrice,
      withoutPrice,
      withDate,
      withoutDate,
      withTime,
      withoutTime,
      whatsappStats,
      procedureStats,
      operatorStats,
    };
  }

  /**
   * Chart data — last N days
   */
  async getLeadsChart(days = 7) {
    const todayStart = todayStartAlmaty();
    const startDate = new Date(todayStart);
    startDate.setDate(startDate.getDate() - days + 1);

    const leads = await this.prisma.lead.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true, status: true },
    });

    const result: { date: string; total: number; booked: number }[] = [];

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(startDate);
      dayStart.setDate(dayStart.getDate() + i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayLeads = leads.filter(
        (l) => l.createdAt >= dayStart && l.createdAt < dayEnd,
      );

      result.push({
        date: dayStart.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          timeZone: TZ,
        }),
        total: dayLeads.length,
        booked: dayLeads.filter((l) => l.status === LeadStatus.BOOKED).length,
      });
    }

    return result;
  }

  /**
   * Operator performance
   */
  async getOperatorsPerformance() {
    const operators = await this.prisma.operator.findMany({
      where: { active: true },
      include: {
        user: { select: { name: true } },
        _count: { select: { leads: true } },
      },
    });

    return operators
      .map((op) => ({
        id: op.id,
        name: op.user.name,
        currentLeads: op.currentLeads,
        totalLeads: op.totalLeads,
        totalBooked: op.totalBooked,
        conversionRate:
          op.totalLeads > 0
            ? Math.round((op.totalBooked / op.totalLeads) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.totalBooked - a.totalBooked);
  }

  /**
   * Recent activity
   */
  async getRecentActivity(limit = 10) {
    const leads = await this.prisma.lead.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { phone: true, whatsappName: true, name: true } },
        operator: { include: { user: { select: { name: true } } } },
        procedure: { select: { name: true } },
        whatsappOwner: true,
      },
    });

    return leads.map((l) => ({
      id: l.id,
      type: 'lead',
      message: `Новый лид от ${l.client.whatsappName || l.client.phone}`,
      procedure: l.procedure?.name || (l.parsedProcedures as string[])?.join(' + ') || 'Не определена',
      operator: l.operator?.user.name || 'Не назначен',
      whatsappOwner: (l as any).whatsappOwner?.name || null,
      status: l.status,
      timestamp: l.createdAt,
    }));
  }
}
