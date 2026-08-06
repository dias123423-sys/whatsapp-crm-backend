import { prisma } from '../database/prisma.client';
import { socketService } from './socket.service';
import { buildExcelBuffer, ExportType } from './excel.service';
import { logger } from '../utils/logger';
import { Prisma, WhatsAppAccount, CreatedBy } from '@prisma/client';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateAppointmentDto {
  clientName: string;
  phone: string;
  appointmentDate: Date;
  appointmentTime: string;
  whatsappAccount: WhatsAppAccount;
  createdBy: CreatedBy;
  rawMessage?: string;
  operatorName?: string;
  notes?: string;
}

export interface AppointmentFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
  whatsappAccount?: WhatsAppAccount;
  createdBy?: CreatedBy;
  page?: number;
  limit?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const appointmentService = {

  async create(dto: CreateAppointmentDto) {
    const appointment = await prisma.appointment.create({
      data: {
        clientName:      dto.clientName,
        phone:           dto.phone,
        appointmentDate: dto.appointmentDate,
        appointmentTime: dto.appointmentTime,
        whatsappAccount: dto.whatsappAccount,
        createdBy:       dto.createdBy,
        rawMessage:      dto.rawMessage,
        operatorName:    dto.operatorName,
        notes:           dto.notes,
      },
    });

    logger.info(`New appointment created: ${appointment.id} (${dto.clientName})`);

    // Real-time push to dashboard
    socketService.emitNewAppointment(appointment as unknown as { id: string; [key: string]: unknown });
    socketService.emitStatsUpdate();

    // Log to DB
    await this.logActivity(dto.whatsappAccount, 'appointment:created', `Запись для ${dto.clientName}`);

    return appointment;
  },

  async findMany(filters: AppointmentFilters) {
    const page  = Math.max(1, filters.page  ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const skip  = (page - 1) * limit;

    const where: Prisma.AppointmentWhereInput = {};

    if (filters.search) {
      where.OR = [
        { clientName: { contains: filters.search, mode: 'insensitive' } },
        { phone:      { contains: filters.search } },
      ];
    }

    if (filters.startDate || filters.endDate) {
      where.appointmentDate = {};
      if (filters.startDate) where.appointmentDate.gte = new Date(filters.startDate);
      if (filters.endDate)   where.appointmentDate.lte = endOfDay(new Date(filters.endDate));
    }

    if (filters.whatsappAccount) where.whatsappAccount = filters.whatsappAccount;
    if (filters.createdBy)       where.createdBy       = filters.createdBy;

    const [total, data] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async findById(id: string) {
    return prisma.appointment.findUnique({ where: { id } });
  },

  async delete(id: string) {
    const appointment = await prisma.appointment.delete({ where: { id } });
    socketService.emitDeletedAppointment(id);
    socketService.emitStatsUpdate();
    return appointment;
  },

  async getStats() {
    const now   = new Date();
    const today = { gte: startOfDay(now), lte: endOfDay(now) };
    const week  = { gte: startOfWeek(now, { weekStartsOn: 1 }), lte: endOfWeek(now, { weekStartsOn: 1 }) };
    const month = { gte: startOfMonth(now), lte: endOfMonth(now) };

    const [todayCount, weekCount, monthCount, botCount, operatorCount, totalCount, byAccountRaw] =
      await Promise.all([
        prisma.appointment.count({ where: { createdAt: today } }),
        prisma.appointment.count({ where: { createdAt: week } }),
        prisma.appointment.count({ where: { createdAt: month } }),
        prisma.appointment.count({ where: { createdBy: 'BOT' } }),
        prisma.appointment.count({ where: { createdBy: 'OPERATOR' } }),
        prisma.appointment.count(),
        prisma.appointment.groupBy({
          by: ['whatsappAccount'],
          _count: { _all: true },
        }),
      ]);

    const byAccount: Record<string, number> = { WA1: 0, WA2: 0, WA3: 0, WA4: 0 };
    for (const row of byAccountRaw) {
      byAccount[row.whatsappAccount] = row._count._all;
    }

    return {
      today:         todayCount,
      thisWeek:      weekCount,
      thisMonth:     monthCount,
      botCount,
      operatorCount,
      totalCount,
      byAccount,
    };
  },

  async exportExcel(type: ExportType): Promise<Buffer> {
    const rows = await prisma.appointment.findMany({
      orderBy: { appointmentDate: 'asc' },
    });
    return buildExcelBuffer(
      rows.map((r) => ({
        ...r,
        operatorName: r.operatorName ?? undefined,
      })),
      type,
    );
  },

  // ── Activity log helper ─────────────────────────────────────────────────

  async logActivity(accountId: string, eventType: string, message: string, metadata?: Record<string, unknown>) {
    try {
      await prisma.activityLog.create({ data: { accountId, eventType, message, metadata } });
    } catch (err) {
      logger.warn(`Failed to write activity log: ${String(err)}`);
    }
  },
};
