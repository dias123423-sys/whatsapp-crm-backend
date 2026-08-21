import { Injectable, Logger } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

/** Форматирует число как тенге: 3990 → "3 990 ₸" */
function fmtKZT(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return (
    Math.round(value)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸'
  );
}

/** Статусы на русском */
const STATUS_LABELS: Record<string, string> = {
  NEW: 'Новый',
  ASSIGNED: 'Назначен',
  CALLING: 'Звоним',
  BOOKED: 'Записан',
  FOLLOW_UP: 'Перезвонить',
  NO_ANSWER: 'Не ответил',
  CLOSED: 'Закрыт',
};

@Injectable()
export class ExcelService {
  private readonly logger = new Logger(ExcelService.name);
  private readonly storagePath = './storage/reports';

  constructor() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  // ═══════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════

  /**
   * Общий Excel всех лидов
   */
  async generateLeadsReport(
    leads: any[],
    reportTitle: string,
    period?: string,
  ): Promise<string> {
    const workbook = new Workbook();
    this.buildSheet(workbook, 'Лиды', leads, reportTitle, period);
    return this.saveWorkbook(workbook, `leads_report`);
  }

  /**
   * Excel по владельцу WhatsApp (Танат / Улдай / и т.д.)
   */
  async generateReportByOwner(
    leads: any[],
    ownerName: string,
    period?: string,
  ): Promise<string> {
    const workbook = new Workbook();
    this.buildSheet(workbook, ownerName, leads, `Лиды — ${ownerName}`, period);
    const safeName = ownerName.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
    return this.saveWorkbook(workbook, `leads_${safeName}`);
  }

  /**
   * Excel со всеми лидами + отдельный лист на каждого владельца
   */
  async generateFullReport(leads: any[], period?: string): Promise<string> {
    const workbook = new Workbook();

    // Лист 1: Все лиды
    this.buildSheet(workbook, 'Все лиды', leads, 'Общий отчёт', period);

    // Группируем по владельцам
    const byOwner = new Map<string, any[]>();
    for (const lead of leads) {
      const ownerName: string = lead.whatsappOwner?.name ?? 'Без владельца';
      if (!byOwner.has(ownerName)) byOwner.set(ownerName, []);
      byOwner.get(ownerName)!.push(lead);
    }

    // Листы по каждому владельцу
    for (const [ownerName, ownerLeads] of byOwner) {
      const sheetName = ownerName.slice(0, 31); // Excel ограничивает 31 символом
      this.buildSheet(workbook, sheetName, ownerLeads, `Лиды — ${ownerName}`, period);
    }

    return this.saveWorkbook(workbook, `full_report`);
  }

  /**
   * Удалить старые файлы
   */
  async cleanupOldReports(daysOld = 30): Promise<number> {
    const files = fs.readdirSync(this.storagePath);
    const maxAge = daysOld * 86_400_000;
    let deleted = 0;
    for (const file of files) {
      const fp = path.join(this.storagePath, file);
      if (Date.now() - fs.statSync(fp).mtime.getTime() > maxAge) {
        fs.unlinkSync(fp);
        deleted++;
      }
    }
    this.logger.log(`Cleaned ${deleted} old report files`);
    return deleted;
  }

  // ═══════════════════════════════════════════════
  // PRIVATE BUILDER
  // ═══════════════════════════════════════════════

  private buildSheet(
    workbook: Workbook,
    sheetName: string,
    leads: any[],
    title: string,
    period?: string,
  ): Worksheet {
    const ws = workbook.addWorksheet(sheetName);
    ws.properties.defaultRowHeight = 18;

    // ── Header block ──
    const TOTAL_COLS = 19; // A–S
    const colRange   = `A1:S1`;

    ws.mergeCells(colRange);
    const titleCell = ws.getCell('A1');
    titleCell.value = title;
    titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D6F42' } };
    ws.getRow(1).height = 30;

    ws.mergeCells('A2:S2');
    ws.getCell('A2').value = `Дата формирования: ${new Date().toLocaleString('ru-RU', {
      timeZone: process.env.APP_TIMEZONE || 'Asia/Almaty',
    })}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.getRow(2).height = 18;

    // ── Bot Result statistics ──
    const botBooked = leads.filter((l) => l.botResult === 'BOOKED').length;
    const botUnknown = leads.filter((l) => l.botResult === 'UNKNOWN').length;
    const botLost = leads.filter((l) => l.botResult === 'LOST').length;

    ws.mergeCells('A3:S3');
    ws.getCell('A3').value = `BOOKED: ${botBooked}  |  UNKNOWN: ${botUnknown}  |  LOST: ${botLost}`;
    ws.getCell('A3').font = { bold: true, size: 11 };
    ws.getCell('A3').alignment = { horizontal: 'center' };
    ws.getRow(3).height = 20;

    if (period) {
      ws.mergeCells('A4:S4');
      ws.getCell('A4').value = `Период: ${period}`;
      ws.getCell('A4').alignment = { horizontal: 'center' };
      ws.getRow(4).height = 16;
    }

    const dataStartRow = period ? 6 : 5;

    // ── Column definitions (19 колонок A–S) ──
    ws.columns = [
      { key: 'no',           header: '№',                     width: 6  },
      { key: 'createdDate',  header: 'Дата лида',             width: 12 },
      { key: 'createdTime',  header: 'Время лида',            width: 8  },
      { key: 'phone',        header: 'Телефон',               width: 18 },
      { key: 'name',         header: 'Имя',                   width: 22 },
      { key: 'procedure',    header: 'Процедура',             width: 30 },
      { key: 'price',        header: 'Цена',                  width: 14 },
      { key: 'currency',     header: 'Валюта',                width: 8  },
      { key: 'parsedDate',   header: 'Дата записи',           width: 14 },
      { key: 'parsedTime',   header: 'Время записи',          width: 12 },
      { key: 'whatsapp',     header: 'WhatsApp',              width: 14 },
      { key: 'owner',        header: 'Владелец WA',           width: 14 },
      { key: 'operator',     header: 'Оператор',              width: 18 },
      { key: 'status',       header: 'Статус',                width: 14 },
      { key: 'botResult',    header: 'Результат',             width: 16 },
      { key: 'source',       header: 'Источник',              width: 14 },
      { key: 'campaign',     header: 'Campaign',              width: 18 },
      { key: 'adId',         header: 'Ad ID',                 width: 16 },
      { key: 'message',      header: 'Оригинальное сообщение', width: 40 },
    ];

    // ── Header row style ──
    const headerRow = ws.getRow(dataStartRow);
    const headers = [
      '№', 'Дата лида', 'Время лида', 'Телефон', 'Имя', 'Процедура',
      'Цена', 'Валюта', 'Дата записи', 'Время записи',
      'WhatsApp', 'Владелец WA', 'Оператор',
      'Статус', 'Результат', 'Источник', 'Campaign', 'Ad ID', 'Оригинальное сообщение',
    ];
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' },
      };
    });
    headerRow.height = 22;

    // Freeze header
    ws.views = [{ state: 'frozen', ySplit: dataStartRow }];

    // Auto filter
    ws.autoFilter = {
      from: { row: dataStartRow, column: 1 },
      to:   { row: dataStartRow, column: 19 },
    };

    // ── Data rows ──
    const tz = process.env.APP_TIMEZONE || 'Asia/Almaty';

    leads.forEach((lead, index) => {
      const createdAt = new Date(lead.createdAt);

      const procedures: string =
        (lead.parsedProcedures?.length > 0
          ? lead.parsedProcedures.join(' + ')
          : lead.offer?.name) || '—';

      const priceNum: number | null = lead.parsedPrice ?? lead.offer?.price ?? null;

      // Bot Result labels
      const resultLabels: Record<string, string> = {
        BOOKED:  '✅ Запись была',
        LOST:    '❌ Слив / отказ',
        UNKNOWN: '⏳ Не определён',
      };
      const botResultText = lead.botResult ? (resultLabels[lead.botResult] ?? lead.botResult) : '—';

      // Дата/время записи (из диалога)
      const parsedDateStr = (lead as any).parsedDate ?? '—';
      const parsedTimeStr = (lead as any).parsedTime ?? '—';

      const row = ws.addRow([
        index + 1,
        createdAt.toLocaleDateString('ru-RU', { timeZone: tz }),
        createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz }),
        lead.client?.phone || lead.client?.normalizedPhone || '—',
        lead.client?.whatsappName || lead.client?.name || '—',
        procedures,
        priceNum !== null ? priceNum : '',
        'KZT',
        parsedDateStr,
        parsedTimeStr,
        lead.whatsappAccount?.name || '—',
        lead.whatsappOwner?.name || '—',
        lead.operator?.user?.name || '—',
        STATUS_LABELS[lead.status] || lead.status,
        botResultText,
        lead.source || '—',
        lead.campaign || '—',
        lead.adId || '—',
        lead.originalMessage || '—',
      ]);

      row.alignment = { vertical: 'middle', wrapText: false };

      // Чередующийся фон
      if (index % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      }

      // Цвет статуса (колонка 14)
      const statusCell = row.getCell(14);
      switch (lead.status) {
        case 'NEW':
          statusCell.font = { color: { argb: 'FF0070C0' }, bold: true };
          break;
        case 'BOOKED':
          statusCell.font = { color: { argb: 'FF00B050' }, bold: true };
          break;
        case 'CALLING':
        case 'ASSIGNED':
          statusCell.font = { color: { argb: 'FFFFA500' }, bold: true };
          break;
        case 'CLOSED':
          statusCell.font = { color: { argb: 'FF7F7F7F' } };
          break;
      }

      // Цвет bot result
      const resultCell = row.getCell(13);
      switch (lead.botResult) {
        case 'BOOKED':
          resultCell.font = { color: { argb: 'FF00B050' }, bold: true };
          break;
        case 'UNKNOWN':
          resultCell.font = { color: { argb: 'FF808080' }, italic: true };
          break;
        case 'LOST':
          resultCell.font = { color: { argb: 'FFD00000' }, bold: true };
          break;
      }

      // Цена — числовой формат
      if (priceNum !== null) {
        const priceCell = row.getCell(7);
        priceCell.numFmt = '#,##0" ₸"';
      }

      // Borders
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // ── Summary ──
    const summaryRowNum = ws.lastRow!.number + 2;
    ws.mergeCells(`A${summaryRowNum}:H${summaryRowNum}`);
    const sumCell = ws.getCell(`A${summaryRowNum}`);
    sumCell.value = `Всего лидов: ${leads.length}`;
    sumCell.font = { bold: true, size: 11 };
    sumCell.alignment = { horizontal: 'center' };

    // Total revenue (only booked)
    const booked = leads.filter((l) => l.status === 'BOOKED');
    const revenue = booked.reduce(
      (sum, l) => sum + (l.parsedPrice ?? l.offer?.price ?? 0),
      0,
    );
    const sumRevRow = summaryRowNum + 1;
    ws.mergeCells(`A${sumRevRow}:H${sumRevRow}`);
    const revCell = ws.getCell(`A${sumRevRow}`);
    revCell.value = `Записано: ${booked.length} | Выручка: ${fmtKZT(revenue)}`;
    revCell.font = { bold: true, size: 11, color: { argb: 'FF00B050' } };
    revCell.alignment = { horizontal: 'center' };

    return ws;
  }

  // ── Save workbook ──
  private async saveWorkbook(workbook: Workbook, prefix: string): Promise<string> {
    const ts = Date.now();
    const filename = `${prefix}_${ts}.xlsx`;
    const filepath = path.join(this.storagePath, filename);
    await workbook.xlsx.writeFile(filepath);
    this.logger.log(`Excel saved: ${filename}`);
    return filepath;
  }
}
