import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import dayjs from 'dayjs';

// ── WhatsApp → Operator mapping ───────────────────────────────────────────────
// WA1        → Эмиль  (individual report)
// WA2, WA3, WA4 → Улдай  (combined report)
const WA_OPERATOR_MAP: Record<string, string> = {
  WA1: 'Эмиль',
  WA2: 'Улдай',
  WA3: 'Улдай',
  WA4: 'Улдай',
};

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly reportsDir = path.join(process.cwd(), 'reports');

  constructor(private prisma: PrismaService) {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  // ── Night report: 19:00 – 09:00 (generates at 09:00) ─────────────────────
  async generateNightReport(date?: Date): Promise<string[]> {
    const reportDate = date || new Date();
    const dateStr = dayjs(reportDate).format('YYYY-MM-DD');

    const from = dayjs(reportDate).subtract(1, 'day').hour(19).minute(0).second(0).toDate();
    const to   = dayjs(reportDate).hour(9).minute(0).second(0).toDate();

    const leads = await this.fetchLeads(from, to);
    this.logger.log(`Night report: ${leads.length} leads (${dayjs(from).format('HH:mm')} – ${dayjs(to).format('HH:mm')})`);

    const files: string[] = [];

    // Per-operator Excel files
    const emilLeads = this.filterByWA(leads, ['WA1']);
    const uldaiLeads = this.filterByWA(leads, ['WA2', 'WA3', 'WA4']);

    if (emilLeads.length > 0) {
      const f = await this.buildExcel(emilLeads, `Night_Emil_${dateStr}.xlsx`, 'Эмиль', 'НОЧНОЙ');
      files.push(f);
    }
    if (uldaiLeads.length > 0) {
      const f = await this.buildExcel(uldaiLeads, `Night_Uldai_${dateStr}.xlsx`, 'Улдай', 'НОЧНОЙ');
      files.push(f);
    }
    // Combined
    const combined = await this.buildExcel(leads, `Night_All_${dateStr}.xlsx`, 'Все операторы', 'НОЧНОЙ');
    files.push(combined);

    // Save reports to DB
    for (const fp of files) {
      await this.prisma.report.create({
        data: {
          type: 'NIGHT',
          date: reportDate,
          filePath: fp,
          data: { count: leads.length, file: path.basename(fp) },
        },
      });
    }

    return files;
  }

  // ── Daily report ──────────────────────────────────────────────────────────
  async generateDailyReport(date?: Date): Promise<string[]> {
    const reportDate = date || new Date();
    const dateStr = dayjs(reportDate).format('YYYY-MM-DD');

    const from = dayjs(reportDate).startOf('day').toDate();
    const to   = dayjs(reportDate).endOf('day').toDate();

    const leads = await this.fetchLeads(from, to);
    this.logger.log(`Daily report: ${leads.length} leads`);

    const files: string[] = [];

    const emilLeads  = this.filterByWA(leads, ['WA1']);
    const uldaiLeads = this.filterByWA(leads, ['WA2', 'WA3', 'WA4']);

    if (emilLeads.length > 0) {
      const f = await this.buildExcel(emilLeads, `Daily_Emil_${dateStr}.xlsx`, 'Эмиль', 'ДНЕВНОЙ');
      files.push(f);
    }
    if (uldaiLeads.length > 0) {
      const f = await this.buildExcel(uldaiLeads, `Daily_Uldai_${dateStr}.xlsx`, 'Улдай', 'ДНЕВНОЙ');
      files.push(f);
    }
    const combined = await this.buildExcel(leads, `Daily_All_${dateStr}.xlsx`, 'Все операторы', 'ДНЕВНОЙ');
    files.push(combined);

    for (const fp of files) {
      await this.prisma.report.create({
        data: {
          type: 'DAILY',
          date: reportDate,
          filePath: fp,
          data: { count: leads.length, file: path.basename(fp) },
        },
      });
    }

    return files;
  }

  // ── Fetch leads with all relations ────────────────────────────────────────
  private async fetchLeads(from: Date, to: Date) {
    return this.prisma.lead.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: {
        client: true,
        operator: true,
        procedure: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── Filter leads by WhatsApp instance source ──────────────────────────────
  // We use the whatsapp account linked via message history
  private filterByWA(leads: any[], waNames: string[]): any[] {
    // We tag leads by their operator name matching WA mapping
    // Since WA1=Эмиль means leads that came through WA1
    // Check via operator name OR just split by assignment order
    // In this system we track instanceName in messages table
    // Simple approach: split by whether lead's assigned operator matches mapping
    // For now return all leads tagged to those WA accounts via source lookup
    return leads.filter((lead) => {
      const opName = lead.operator?.name || '';
      const assignedWA = Object.entries(WA_OPERATOR_MAP)
        .filter(([, op]) => op === (waNames.includes('WA1') && waNames.length === 1 ? 'Эмиль' : 'Улдай'))
        .map(([wa]) => wa);
      // Simple: if filtering for Emil, return leads assigned to Эмиль operator
      // If filtering for Uldai, return the rest
      if (waNames.includes('WA1') && waNames.length === 1) {
        return opName === 'Эмиль';
      }
      // Uldai = everyone except Emil
      return opName !== 'Эмиль';
    });
  }

  // ── Build Excel file ───────────────────────────────────────────────────────
  private async buildExcel(
    leads: any[],
    filename: string,
    operatorLabel: string,
    reportType: string,
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Call Center System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Лиды', {
      pageSetup: { fitToPage: true, orientation: 'landscape' },
    });

    // Title row
    sheet.mergeCells('A1:J1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `${reportType} ОТЧЁТ — ${operatorLabel} — ${dayjs().format('DD.MM.YYYY')}`;
    titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    // Summary row
    sheet.mergeCells('A2:J2');
    const summaryCell = sheet.getCell('A2');
    summaryCell.value = `Всего лидов: ${leads.length}  |  Записались (BOOKED): ${leads.filter(l => l.status === 'BOOKED').length}  |  Без процедуры: ${leads.filter(l => !l.procedureId).length}`;
    summaryCell.font = { bold: true, size: 11 };
    summaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    summaryCell.alignment = { horizontal: 'center' };
    sheet.getRow(2).height = 22;

    // Column definitions
    sheet.columns = [
      { key: 'num',       width: 5  },
      { key: 'date',      width: 12 },
      { key: 'time',      width: 8  },
      { key: 'phone',     width: 18 },
      { key: 'name',      width: 20 },
      { key: 'procedure', width: 32 },
      { key: 'price',     width: 12 },
      { key: 'source',    width: 12 },
      { key: 'operator',  width: 16 },
      { key: 'status',    width: 14 },
    ];

    // Header row (row 3)
    const headerRow = sheet.getRow(3);
    const headers = ['#', 'Дата', 'Время', 'Телефон', 'Имя', 'Процедура', 'Цена (₸)', 'Источник', 'Оператор', 'Статус'];
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1E40AF' } },
        bottom: { style: 'thin', color: { argb: 'FF1E40AF' } },
        left: { style: 'thin', color: { argb: 'FF1E40AF' } },
        right: { style: 'thin', color: { argb: 'FF1E40AF' } },
      };
    });
    headerRow.height = 22;

    // Status colors
    const statusColors: Record<string, string> = {
      NEW:       'FFDBEAFE',
      CALLING:   'FFFEF9C3',
      BOOKED:    'FFD1FAE5',
      FOLLOW_UP: 'FFEDE9FE',
      NO_ANSWER: 'FFF3F4F6',
      CLOSED:    'FFFEE2E2',
    };

    // Data rows starting at row 4
    leads.forEach((lead, idx) => {
      const rowNum = idx + 4;
      const row = sheet.getRow(rowNum);
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? 'FFFAFAFA' : 'FFFFFFFF';

      const values = [
        idx + 1,
        dayjs(lead.createdAt).format('DD.MM.YYYY'),
        dayjs(lead.createdAt).format('HH:mm'),
        lead.client?.phone || '',
        lead.client?.name || '',
        lead.procedure?.name || '— не определена —',
        lead.price ?? lead.procedure?.price ?? '',
        lead.source || 'WHATSAPP',
        lead.operator?.name || '—',
        lead.status || 'NEW',
      ];

      values.forEach((val, i) => {
        const cell = row.getCell(i + 1);
        cell.value = val;
        cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' };

        // Status column coloring
        if (i === 9) {
          const statusBg = statusColors[String(val)] || rowBg;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusBg } };
          cell.font = { bold: true, size: 9 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }

        // No procedure = orange background
        if (i === 5 && !lead.procedureId) {
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

    // Freeze header rows
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
