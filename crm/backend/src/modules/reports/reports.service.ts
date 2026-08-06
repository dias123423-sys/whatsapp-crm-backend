import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { TelegramService } from './telegram.service';
import ExcelJS from 'exceljs';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  // ── Daily cron at 08:00 ───────────────────────────────────────────────────
  @Cron('0 8 * * *')
  async sendDailyReports(): Promise<void> {
    this.logger.log('📊 Running daily reports...');

    const companies = await this.prisma.company.findMany({ where: { isActive: true } });

    for (const company of companies) {
      try {
        await this.generateAndSend(company.id, company.name);
      } catch (err) {
        this.logger.error(`Report failed for ${company.name}: ${String(err)}`);
      }
    }
  }

  // ── Generate report for date range ───────────────────────────────────────
  async generateReport(companyId: string, dateFrom: Date, dateTo: Date) {
    const where = { companyId, createdAt: { gte: dateFrom, lte: dateTo } };

    const [leads, operators] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          client: true,
          operator: { include: { user: { select: { firstName: true, lastName: true } } } },
          procedure: true,
          campaign: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.operator.findMany({
        where: { companyId },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    const total       = leads.length;
    const newLeads    = leads.filter((l) => l.status === 'NEW').length;
    const calling     = leads.filter((l) => l.status === 'CALLING').length;
    const booked      = leads.filter((l) => l.status === 'BOOKED').length;
    const noAnswer    = leads.filter((l) => l.status === 'NO_ANSWER').length;
    const closed      = leads.filter((l) => l.status === 'CLOSED').length;
    const duplicates  = leads.filter((l) => l.isDuplicate).length;
    const conversion  = total > 0 ? ((booked / total) * 100).toFixed(1) : '0';

    return { leads, operators, stats: { total, newLeads, calling, booked, noAnswer, closed, duplicates, conversion } };
  }

  // ── Build Excel buffer ────────────────────────────────────────────────────
  async buildExcel(companyId: string, dateFrom: Date, dateTo: Date): Promise<Buffer> {
    const { leads, stats } = await this.generateReport(companyId, dateFrom, dateTo);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'CRM System';

    // ── Summary sheet ──────────────────────────────────────────────────────
    const summary = wb.addWorksheet('Сводка');
    summary.columns = [{ width: 30 }, { width: 20 }];
    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true };

    [
      ['Отчёт за', `${format(dateFrom, 'dd.MM.yyyy')} — ${format(dateTo, 'dd.MM.yyyy')}`],
      ['Всего лидов', stats.total],
      ['Записаны (BOOKED)', stats.booked],
      ['Дубликаты', stats.duplicates],
      ['Нет ответа', stats.noAnswer],
      ['Конверсия', `${stats.conversion}%`],
    ].forEach(([k, v], i) => {
      const row = summary.addRow([k, v]);
      if (i === 0) {
        row.eachCell((c) => { c.fill = headerFill; c.font = headerFont; });
      }
    });

    // ── Leads sheet ────────────────────────────────────────────────────────
    const ws = wb.addWorksheet('Лиды');
    ws.columns = [
      { header: '#', key: 'n', width: 6 },
      { header: 'Телефон', key: 'phone', width: 16 },
      { header: 'Имя WA', key: 'name', width: 22 },
      { header: 'Статус', key: 'status', width: 14 },
      { header: 'Процедура', key: 'proc', width: 24 },
      { header: 'Оператор', key: 'op', width: 22 },
      { header: 'Кампания', key: 'camp', width: 20 },
      { header: 'Создан', key: 'created', width: 18 },
    ];

    const hRow = ws.getRow(1);
    hRow.eachCell((c) => { c.fill = headerFill; c.font = headerFont; c.alignment = { horizontal: 'center' }; });
    hRow.height = 24;

    leads.forEach((l, i) => {
      ws.addRow({
        n: i + 1,
        phone: l.client.phone,
        name: l.client.waName ?? '—',
        status: l.status,
        proc: l.procedure?.name ?? '—',
        op: l.operator ? `${l.operator.user.firstName} ${l.operator.user.lastName}` : '—',
        camp: l.campaign?.name ?? '—',
        created: format(l.createdAt, 'dd.MM.yyyy HH:mm'),
      });
    });

    ws.autoFilter = 'A1:H1';
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ── Send daily report to Telegram ─────────────────────────────────────────
  private async generateAndSend(companyId: string, companyName: string): Promise<void> {
    const yesterday = subDays(new Date(), 1);
    const from = startOfDay(yesterday);
    const to   = endOfDay(yesterday);

    const { stats } = await this.generateReport(companyId, from, to);
    const buffer    = await this.buildExcel(companyId, from, to);

    const msg = [
      `<b>📊 Ежедневный отчёт — ${companyName}</b>`,
      `📅 ${format(yesterday, 'dd.MM.yyyy')}`,
      '',
      `🟢 Всего лидов: <b>${stats.total}</b>`,
      `✅ Записаны: <b>${stats.booked}</b>`,
      `📞 Нет ответа: <b>${stats.noAnswer}</b>`,
      `🔁 Дубликаты: <b>${stats.duplicates}</b>`,
      `📈 Конверсия: <b>${stats.conversion}%</b>`,
    ].join('\n');

    await this.telegram.sendMessage(msg);

    // Send Excel file
    const filename = `report_${format(yesterday, 'yyyy-MM-dd')}.xlsx`;
    await this.telegram.sendDocument(this.config.get<string>('telegram.chatId') ?? '', buffer, filename);

    // Store in DB
    await this.prisma.report.create({
      data: {
        companyId,
        type: 'DAILY',
        title: `Daily ${format(yesterday, 'dd.MM.yyyy')}`,
        dateFrom: from,
        dateTo: to,
        data: stats as unknown as import('@prisma/client').Prisma.InputJsonValue,
        sentAt: new Date(),
        channels: ['TELEGRAM'],
      },
    });
  }

  // ── Manual trigger ────────────────────────────────────────────────────────
  async triggerReport(companyId: string, dateFrom: string, dateTo: string) {
    return this.generateReport(companyId, new Date(dateFrom), new Date(dateTo));
  }
}
