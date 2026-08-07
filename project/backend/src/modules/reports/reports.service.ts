import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import dayjs from 'dayjs';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly reportsDir = path.join(process.cwd(), 'reports');

  constructor(private prisma: PrismaService) {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  // ── Night report: previous day 19:00 → today 09:00 (runs at 09:00) ───────
  async generateNightReport(date?: Date): Promise<string[]> {
    const reportDate = date || new Date();
    const dateStr = dayjs(reportDate).format('YYYY-MM-DD');

    const from = dayjs(reportDate).subtract(1, 'day').hour(19).minute(0).second(0).millisecond(0).toDate();
    const to   = dayjs(reportDate).hour(9).minute(0).second(0).millisecond(0).toDate();

    const leads = await this.fetchLeads(from, to);
    this.logger.log(
      `Night report: ${leads.length} leads | ${dayjs(from).format('DD.MM HH:mm')} – ${dayjs(to).format('DD.MM HH:mm')}`,
    );

    const filename = `Night_${dateStr}.xlsx`;
    const filePath = await this.buildExcel(leads, filename, 'НОЧНОЙ', from, to);

    await this.prisma.report.create({
      data: {
        type: 'NIGHT',
        date: reportDate,
        filePath,
        data: { count: leads.length, file: filename },
      },
    });

    return [filename];
  }

  // ── Daily report: 00:00 → 19:59 (runs at 20:00) ─────────────────────────
  async generateDailyReport(date?: Date): Promise<string[]> {
    const reportDate = date || new Date();
    const dateStr = dayjs(reportDate).format('YYYY-MM-DD');

    const from = dayjs(reportDate).startOf('day').toDate();
    // Period ends at 19:59:59 (before the night period starts at 20:00)
    const to   = dayjs(reportDate).hour(19).minute(59).second(59).millisecond(999).toDate();

    const leads = await this.fetchLeads(from, to);
    this.logger.log(`Daily report: ${leads.length} leads | ${dayjs(from).format('HH:mm')} – ${dayjs(to).format('HH:mm')}`);

    const filename = `Daily_${dateStr}.xlsx`;
    const filePath = await this.buildExcel(leads, filename, 'ДНЕВНОЙ', from, to);

    await this.prisma.report.create({
      data: {
        type: 'DAILY',
        date: reportDate,
        filePath,
        data: { count: leads.length, file: filename },
      },
    });

    return [filename];
  }

  // ── Fetch leads with all relations ────────────────────────────────────────
  private async fetchLeads(from: Date, to: Date) {
    return this.prisma.lead.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { client: true, operator: true, procedure: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── Build Excel file ──────────────────────────────────────────────────────
  private async buildExcel(
    leads: any[],
    filename: string,
    reportType: 'НОЧНОЙ' | 'ДНЕВНОЙ',
    from: Date,
    to: Date,
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Call Center System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Лиды', {
      pageSetup: { fitToPage: true, orientation: 'landscape' },
    });

    const dateLabel = dayjs(to).format('DD.MM.YYYY');
    const periodLabel = `${dayjs(from).format('DD.MM HH:mm')} – ${dayjs(to).format('DD.MM HH:mm')}`;

    // ── Row 1: Main title ──────────────────────────────────────────────────
    const COLS = 9; // A–I
    sheet.mergeCells(`A1:I1`);
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Отчёт по лидам`;
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 32;

    // ── Row 2: Meta info ───────────────────────────────────────────────────
    sheet.mergeCells('A2:I2');
    const metaCell = sheet.getCell('A2');
    metaCell.value = `${reportType === 'НОЧНОЙ' ? '🌙 Ночной' : '☀️ Дневной'} отчёт  |  Дата: ${dateLabel}  |  Период: ${periodLabel}  |  Всего лидов: ${leads.length}`;
    metaCell.font = { bold: true, size: 10 };
    metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    // ── Row 3: Column headers ──────────────────────────────────────────────
    sheet.columns = [
      { key: 'num',       width: 5  },
      { key: 'time',      width: 14 },
      { key: 'phone',     width: 18 },
      { key: 'name',      width: 22 },
      { key: 'procedure', width: 34 },
      { key: 'price',     width: 13 },
      { key: 'operator',  width: 18 },
      { key: 'status',    width: 14 },
      { key: 'source',    width: 12 },
    ];

    const HEADERS = ['#', 'Время', 'Телефон', 'Имя', 'Процедура', 'Цена (₸)', 'Оператор', 'Статус', 'Источник'];
    const headerRow = sheet.getRow(3);
    HEADERS.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FF1E40AF' } },
        bottom: { style: 'thin', color: { argb: 'FF1E40AF' } },
        left:   { style: 'thin', color: { argb: 'FF1E40AF' } },
        right:  { style: 'thin', color: { argb: 'FF1E40AF' } },
      };
    });
    headerRow.height = 22;

    // ── Status → background colour map ────────────────────────────────────
    const STATUS_COLORS: Record<string, string> = {
      NEW:       'FFDBEAFE',
      CALLING:   'FFFEF9C3',
      BOOKED:    'FFD1FAE5',
      FOLLOW_UP: 'FFEDE9FE',
      NO_ANSWER: 'FFF3F4F6',
      CLOSED:    'FFFEE2E2',
    };

    // ── Data rows (start at row 4) ─────────────────────────────────────────
    leads.forEach((lead, idx) => {
      const row = sheet.getRow(idx + 4);
      const rowBg = idx % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF';

      const rawPrice = lead.price ?? lead.procedure?.price;
      const priceDisplay = rawPrice != null ? Number(rawPrice).toLocaleString('ru-RU') : '';

      const values: any[] = [
        idx + 1,
        dayjs(lead.createdAt).format('DD.MM.YYYY HH:mm'),
        lead.client?.phone || '',
        lead.client?.name || '',
        lead.procedure?.name || '— не определена —',
        priceDisplay,
        lead.operator?.name || '—',
        lead.status || 'NEW',
        lead.source || 'WHATSAPP',
      ];

      values.forEach((val, i) => {
        const cell = row.getCell(i + 1);
        cell.value = val;
        cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' };

        // Status column (index 7)
        if (i === 7) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_COLORS[String(val)] || rowBg } };
          cell.font = { bold: true, size: 9 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }

        // Procedure column (index 4): highlight missing procedure in yellow
        if (i === 4 && !lead.procedureId) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
          cell.font = { italic: true, color: { argb: 'FF92400E' } };
        }

        cell.border = {
          top:    { style: 'hair' },
          bottom: { style: 'hair' },
          left:   { style: 'hair' },
          right:  { style: 'hair' },
        };
      });

      row.height = 18;
    });

    // ── Summary footer ─────────────────────────────────────────────────────
    const footerRowNum = leads.length + 4;
    sheet.mergeCells(`A${footerRowNum}:I${footerRowNum}`);
    const footerCell = sheet.getCell(`A${footerRowNum}`);
    footerCell.value = `Итого лидов: ${leads.length}   |   Записались (BOOKED): ${leads.filter(l => l.status === 'BOOKED').length}   |   Без процедуры: ${leads.filter(l => !l.procedureId).length}`;
    footerCell.font = { bold: true, size: 10 };
    footerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(footerRowNum).height = 20;

    // Freeze top 3 rows
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

    const filePath = path.join(this.reportsDir, filename);
    await workbook.xlsx.writeFile(filePath);
    this.logger.log(`Excel saved: ${filename} (${leads.length} rows)`);
    return filePath;
  }

  // ── List reports ──────────────────────────────────────────────────────────
  async getReportsList() {
    return this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
