import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExcelService } from './services/excel.service';
import { Period } from '@prisma/client';
import * as fs from 'fs';

// ─────────────────────────────────────────────
// Timezone helper (Asia/Almaty)
// ─────────────────────────────────────────────

const TZ = process.env.APP_TIMEZONE || 'Asia/Almaty';

/**
 * Returns a Date for today at HH:MM:00 in APP_TIMEZONE.
 * Converts the wall-clock time in Almaty to a UTC Date object.
 */
function almatyTime(hour: number, minute = 0, offsetDays = 0): Date {
  const now = new Date();
  // Build an ISO-8601 string in Almaty time then parse as UTC
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [{ value: year }, , { value: month }, , { value: day }] =
    formatter.formatToParts(now);

  // Create date string in Almaty
  const almatyOffset = '+05:00'; // UTC+5
  const dateStr = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${almatyOffset}`;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

const LEAD_INCLUDE = {
  client: true,
  operator: {
    include: {
      user: { select: { name: true } },
    },
  },
  procedure: true,
  offer: true,
  whatsappAccount: { include: { owner: true } },
  whatsappOwner: true,
} as const;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private excelService: ExcelService,
  ) {}

  // ─────────────────────────────────────────────
  // TODAY
  // ─────────────────────────────────────────────

  async generateTodayReport() {
    const from = almatyTime(0, 0);
    const to = almatyTime(0, 0, 1);

    const leads = await this.getLeads({ gte: from, lt: to });
    const filepath = await this.excelService.generateFullReport(
      leads,
      `Сегодня ${this.dateLabel(from)}`,
    );
    this.logger.log(`Today report: ${leads.length} leads`);
    return { leads: leads.length, filename: this.basename(filepath) };
  }

  // ─────────────────────────────────────────────
  // YESTERDAY
  // ─────────────────────────────────────────────

  async generateYesterdayReport() {
    const from = almatyTime(0, 0, -1);
    const to = almatyTime(0, 0, 0);

    const leads = await this.getLeads({ gte: from, lt: to });
    const filepath = await this.excelService.generateFullReport(
      leads,
      `Вчера ${this.dateLabel(from)}`,
    );
    return { leads: leads.length, filename: this.basename(filepath) };
  }

  // ─────────────────────────────────────────────
  // NIGHT REPORT (19:00 → 09:00) — Asia/Almaty
  // ─────────────────────────────────────────────

  async generateNightReport() {
    // Start: yesterday 19:00 Almaty
    const from = almatyTime(19, 0, -1);
    // End:   today    09:00 Almaty
    const to = almatyTime(9, 0, 0);

    const leads = await this.getLeads({ gte: from, lt: to }, Period.NIGHT);
    const filepath = await this.excelService.generateFullReport(
      leads,
      `Ночной отчёт 19:00–09:00`,
    );
    this.logger.log(`Night report: ${leads.length} leads (${from.toISOString()} – ${to.toISOString()})`);
    return {
      leads: leads.length,
      filename: this.basename(filepath),
      period: 'NIGHT',
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  // ─────────────────────────────────────────────
  // DAY REPORT (09:00 → 19:00) — Asia/Almaty
  // ─────────────────────────────────────────────

  async generateDayReport() {
    const from = almatyTime(9, 0, 0);
    const to = almatyTime(19, 0, 0);

    const leads = await this.getLeads({ gte: from, lt: to }, Period.DAY);
    const filepath = await this.excelService.generateFullReport(
      leads,
      `Дневной отчёт 09:00–19:00`,
    );
    this.logger.log(`Day report: ${leads.length} leads`);
    return {
      leads: leads.length,
      filename: this.basename(filepath),
      period: 'DAY',
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  // ─────────────────────────────────────────────
  // CUSTOM DATE RANGE
  // ─────────────────────────────────────────────

  async generateCustomReport(startDate: Date, endDate: Date) {
    const leads = await this.getLeads({ gte: startDate, lte: endDate });
    const filepath = await this.excelService.generateFullReport(
      leads,
      `${this.dateLabel(startDate)} – ${this.dateLabel(endDate)}`,
    );
    return {
      leads: leads.length,
      filename: this.basename(filepath),
      startDate,
      endDate,
    };
  }

  // ─────────────────────────────────────────────
  // REPORT BY OWNER (отдельный Excel для Танат / Улдай)
  // ─────────────────────────────────────────────

  async generateOwnerReport(ownerId: string, startDate?: Date, endDate?: Date) {
    const owner = await this.prisma.whatsAppOwner.findUnique({ where: { id: ownerId } });
    if (!owner) throw new NotFoundException('WhatsApp owner not found');

    const from = startDate ?? almatyTime(0, 0, 0);
    const to = endDate ?? almatyTime(0, 0, 1);

    const leads = await this.prisma.lead.findMany({
      where: {
        whatsappOwnerId: ownerId,
        createdAt: { gte: from, lt: to },
      },
      include: LEAD_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    const filepath = await this.excelService.generateReportByOwner(
      leads,
      owner.name,
      `${this.dateLabel(from)} – ${this.dateLabel(to)}`,
    );

    return {
      owner: owner.name,
      leads: leads.length,
      filename: this.basename(filepath),
    };
  }

  // ─────────────────────────────────────────────
  // STATS for dashboard
  // ─────────────────────────────────────────────

  async getReportStats() {
    const todayStart = almatyTime(0, 0, 0);
    const yesterdayStart = almatyTime(0, 0, -1);

    const [today, yesterday, night, day] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      this.prisma.lead.count({ where: { period: Period.NIGHT, createdAt: { gte: yesterdayStart } } }),
      this.prisma.lead.count({ where: { period: Period.DAY, createdAt: { gte: todayStart } } }),
    ]);

    return { today, yesterday, night, day };
  }

  // ─────────────────────────────────────────────
  // DOWNLOAD FILE
  // ─────────────────────────────────────────────

  async downloadReport(filename: string): Promise<string> {
    const filepath = `./storage/reports/${filename}`;
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException('Report file not found');
    }
    return filepath;
  }

  async cleanupOldReports(daysOld = 30) {
    return this.excelService.cleanupOldReports(daysOld);
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private async getLeads(createdAt: any, period?: Period) {
    const where: any = { createdAt };
    if (period) where.period = period;

    return this.prisma.lead.findMany({
      where,
      include: LEAD_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  private dateLabel(d: Date): string {
    return d.toLocaleDateString('ru-RU', { timeZone: TZ });
  }

  private basename(filepath: string): string {
    return filepath.split('/').pop()!;
  }
}
