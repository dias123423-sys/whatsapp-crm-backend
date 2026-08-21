import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExcelService } from './services/excel.service';
import { Period } from '@prisma/client';
import * as fs from 'fs';

const TZ = process.env.APP_TIMEZONE || 'Asia/Almaty';

function almatyTime(hour: number, minute = 0, offsetDays = 0): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [{ value: year }, , { value: month }, , { value: day }] = formatter.formatToParts(now);
  const dateStr = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:00`;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

// Schema на VPS: WhatsAppAccount не имеет owner relation
// Lead имеет whatsappAccountId но не whatsappOwnerId
const LEAD_INCLUDE = {
  client: true,
  operator: { include: { user: { select: { name: true } } } },
  procedure: true,
  offer: true,
  whatsappAccount: true,
} as const;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private excelService: ExcelService,
  ) {}

  // ── TODAY ─────────────────────────────────────────────────────────────────

  async generateTodayReport() {
    const from = almatyTime(0, 0);
    const to   = almatyTime(0, 0, 1);
    const leads = await this.queryLeads({ createdAt: { gte: from, lt: to } });
    const filepath = await this.excelService.generateLeadsReport(leads, `Сегодня ${this.dateLabel(from)}`);
    this.logger.log(`Today report: ${leads.length} leads`);
    return { leads: leads.length, filename: this.basename(filepath) };
  }

  // ── YESTERDAY ─────────────────────────────────────────────────────────────

  async generateYesterdayReport() {
    const from = almatyTime(0, 0, -1);
    const to   = almatyTime(0, 0, 0);
    const leads = await this.queryLeads({ createdAt: { gte: from, lt: to } });
    const filepath = await this.excelService.generateLeadsReport(leads, `Вчера ${this.dateLabel(from)}`);
    return { leads: leads.length, filename: this.basename(filepath) };
  }

  // ── NIGHT 19:00 → 09:00 ───────────────────────────────────────────────────

  async generateNightReport() {
    const from = almatyTime(19, 0, -1);
    const to   = almatyTime(9, 0, 0);
    const leads = await this.queryLeads({ createdAt: { gte: from, lt: to }, period: Period.NIGHT });
    const filepath = await this.excelService.generateLeadsReport(
      leads, `Ночной отчёт 19:00–09:00`, `${from.toISOString()} – ${to.toISOString()}`,
    );
    this.logger.log(`Night report: ${leads.length} leads`);
    return { leads: leads.length, filename: this.basename(filepath), period: 'NIGHT', from: from.toISOString(), to: to.toISOString() };
  }

  // ── DAY 09:00 → 19:00 ─────────────────────────────────────────────────────

  async generateDayReport() {
    const from = almatyTime(9, 0, 0);
    const to   = almatyTime(19, 0, 0);
    const leads = await this.queryLeads({ createdAt: { gte: from, lt: to }, period: Period.DAY });
    const filepath = await this.excelService.generateLeadsReport(
      leads, `Дневной отчёт 09:00–19:00`, `${from.toISOString()} – ${to.toISOString()}`,
    );
    this.logger.log(`Day report: ${leads.length} leads`);
    return { leads: leads.length, filename: this.basename(filepath), period: 'DAY', from: from.toISOString(), to: to.toISOString() };
  }

  // ── CUSTOM ────────────────────────────────────────────────────────────────

  async generateCustomReport(startDate: Date, endDate: Date) {
    const leads = await this.queryLeads({ createdAt: { gte: startDate, lte: endDate } });
    const filepath = await this.excelService.generateLeadsReport(
      leads, `${this.dateLabel(startDate)} – ${this.dateLabel(endDate)}`,
    );
    return { leads: leads.length, filename: this.basename(filepath), startDate, endDate };
  }

  // ── BY OWNER (Танат / Улдай) ──────────────────────────────────────────────
  // Owner хранится в таблице whatsapp_owners (отдельная таблица в БД на VPS)
  // Фильтруем по whatsappAccountId тех аккаунтов, чей owner.name = нужное имя

  async generateOwnerReport(ownerId: string, startDate?: Date, endDate?: Date) {
    const from = startDate ?? almatyTime(0, 0, 0);
    const to   = endDate   ?? almatyTime(0, 0, 1);

    // Получаем аккаунты этого владельца из БД напрямую
    const accounts = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM whatsapp_owners WHERE id = ${ownerId}::uuid LIMIT 1
    `;
    const ownerName = accounts.length > 0 ? accounts[0].name : 'Владелец';

    // Ищем WhatsApp аккаунты этого владельца
    const waAccounts = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM whatsapp_accounts WHERE "ownerId" = ${ownerId}::uuid
    `;
    const waIds = waAccounts.map((a) => a.id);

    const where: any = { createdAt: { gte: from, lt: to } };
    if (waIds.length > 0) where.whatsappAccountId = { in: waIds };

    const leads = await this.queryLeads(where);
    const filepath = await this.excelService.generateLeadsReport(
      leads, `${ownerName} — ${this.dateLabel(from)} – ${this.dateLabel(to)}`,
    );
    return { owner: ownerName, leads: leads.length, filename: this.basename(filepath) };
  }

  // ── BY WHATSAPP ACCOUNT ───────────────────────────────────────────────────

  async generateWhatsAppReport(
    whatsappAccountId: string,
    hasProcedure?: boolean,
    startDate?: Date,
    endDate?: Date,
  ) {
    const from = startDate ?? almatyTime(0, 0, 0);
    const to   = endDate   ?? almatyTime(0, 0, 1);

    const where: any = { whatsappAccountId, createdAt: { gte: from, lt: to } };
    this.applyProcedureFilter(where, hasProcedure);

    const leads = await this.queryLeads(where);

    // Имя аккаунта берём из первого лида или из БД
    const accs = await this.prisma.$queryRaw<Array<{ name: string | null }>>`
      SELECT name FROM whatsapp_accounts WHERE id = ${whatsappAccountId}::uuid LIMIT 1
    `;
    const accName = accs.length > 0 ? (accs[0].name ?? 'WhatsApp') : 'WhatsApp';
    const suffix  = hasProcedure === true ? ' — С процедурой' : hasProcedure === false ? ' — Без процедуры' : '';
    const label   = `${accName}${suffix} — ${this.dateLabel(from)} – ${this.dateLabel(to)}`;

    const filepath = await this.excelService.generateLeadsReport(leads, label);
    return { account: accName, leads: leads.length, filename: this.basename(filepath) };
  }

  // ── PROCEDURE FILTER ──────────────────────────────────────────────────────

  async generateProcedureFilterReport(hasProcedure: boolean, startDate?: Date, endDate?: Date) {
    const from = startDate ?? almatyTime(0, 0, 0);
    const to   = endDate   ?? almatyTime(0, 0, 1);

    const where: any = { createdAt: { gte: from, lt: to } };
    this.applyProcedureFilter(where, hasProcedure);

    const leads   = await this.queryLeads(where);
    const label   = hasProcedure ? 'Лиды с процедурой' : 'Лиды без процедуры';
    const filepath = await this.excelService.generateLeadsReport(leads, label);
    return { leads: leads.length, filename: this.basename(filepath), hasProcedure };
  }

  // ── WHATSAPP DETAILED STATS ───────────────────────────────────────────────

  async getWhatsAppStats() {
    // Получаем все аккаунты напрямую через SQL (owner может быть в отдельной таблице)
    const accounts = await this.prisma.$queryRaw<Array<{
      id: string; name: string | null; phone: string | null; status: string; owner_name: string | null;
    }>>`
      SELECT
        wa.id,
        wa.name,
        wa.phone,
        wa.status,
        wo.name as owner_name
      FROM whatsapp_accounts wa
      LEFT JOIN whatsapp_owners wo ON wa."ownerId" = wo.id
      WHERE wa.active = true
      ORDER BY wa."createdAt"
    `;

    return Promise.all(
      accounts.map(async (acc) => {
        const base = { whatsappAccountId: acc.id };

        const [total, withProcedure, withoutProcedure, assigned, booked, followUp, noAnswer, closed, botResultBooked, botResultUnknown, botResultLost] =
          await Promise.all([
            this.prisma.lead.count({ where: base }),
            this.prisma.lead.count({
              where: { ...base, OR: [{ parsedProcedures: { isEmpty: false } }, { offerId: { not: null } }] },
            }),
            this.prisma.lead.count({
              where: { ...base, AND: [{ parsedProcedures: { equals: [] } }, { offerId: null }] },
            }),
            this.prisma.lead.count({ where: { ...base, operatorId: { not: null } } }),
            this.prisma.lead.count({ where: { ...base, status: 'BOOKED' } }),
            this.prisma.lead.count({ where: { ...base, status: 'FOLLOW_UP' } }),
            this.prisma.lead.count({ where: { ...base, status: 'NO_ANSWER' } }),
            this.prisma.lead.count({ where: { ...base, status: 'CLOSED' } }),
            this.prisma.lead.count({ where: { ...base, botResult: 'BOOKED' } }),
            this.prisma.lead.count({ where: { ...base, botResult: 'UNKNOWN' } }),
            this.prisma.lead.count({ where: { ...base, botResult: 'LOST' } }),
          ]);

        return {
          accountId: acc.id,
          accountName: acc.name ?? 'WhatsApp',
          ownerName: acc.owner_name ?? null,
          phone: acc.phone ?? null,
          status: acc.status,
          total, withProcedure, withoutProcedure, assigned, booked, followUp, noAnswer, closed,
          botResultBooked, botResultUnknown, botResultLost,
        };
      }),
    );
  }

  // ── STATS ─────────────────────────────────────────────────────────────────

  async getReportStats() {
    const todayStart     = almatyTime(0, 0, 0);
    const yesterdayStart = almatyTime(0, 0, -1);

    const [today, yesterday, night, day] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      this.prisma.lead.count({ where: { period: Period.NIGHT, createdAt: { gte: yesterdayStart } } }),
      this.prisma.lead.count({ where: { period: Period.DAY,   createdAt: { gte: todayStart } } }),
    ]);

    return { today, yesterday, night, day };
  }

  // ── FILE ──────────────────────────────────────────────────────────────────

  async downloadReport(filename: string): Promise<string> {
    const filepath = `./storage/reports/${filename}`;
    if (!fs.existsSync(filepath)) throw new NotFoundException('Report file not found');
    return filepath;
  }

  async cleanupOldReports(daysOld = 30) {
    return this.excelService.cleanupOldReports(daysOld);
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

  private async queryLeads(where: any) {
    return this.prisma.lead.findMany({ where, include: LEAD_INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  private applyProcedureFilter(where: any, hasProcedure?: boolean) {
    if (hasProcedure === true) {
      where.OR = [{ parsedProcedures: { isEmpty: false } }, { offerId: { not: null } }];
    } else if (hasProcedure === false) {
      where.AND = [{ parsedProcedures: { equals: [] } }, { offerId: null }];
    }
  }

  private dateLabel(d: Date): string {
    return d.toLocaleDateString('ru-RU', { timeZone: TZ });
  }

  private basename(filepath: string): string {
    return filepath.split('/').pop()!;
  }
}
