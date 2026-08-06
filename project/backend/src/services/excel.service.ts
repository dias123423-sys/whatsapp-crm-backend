import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { logger } from '../utils/logger';

const REPORTS_DIR = process.env.REPORTS_DIR
  ? path.resolve(process.env.REPORTS_DIR)
  : path.join(process.cwd(), 'reports');

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export type ExportType = 'AINUR' | 'AIBEK' | 'BOT' | 'ALL';

interface AppointmentRow {
  id: string;
  clientName: string;
  phone: string;
  appointmentDate: Date;
  appointmentTime: string;
  whatsappAccount: string;
  createdBy: 'BOT' | 'OPERATOR';
  operatorName?: string | null;
  createdAt: Date;
}

/**
 * Build an .xlsx file in-memory and return the buffer.
 * exportType filters which rows are included:
 *   AINUR → WA1 only
 *   AIBEK → WA2, WA3, WA4
 *   BOT   → all accounts, createdBy=BOT
 *   ALL   → everything
 */
export async function buildExcelBuffer(
  rows: AppointmentRow[],
  exportType: ExportType,
): Promise<Buffer> {
  const filtered = filterRows(rows, exportType);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WhatsApp Call Center';
  wb.created = new Date();

  const ws = wb.addWorksheet('Записи');

  // ── Column definitions ────────────────────────────────────────────────────
  ws.columns = [
    { header: '#',        key: 'num',       width: 6  },
    { header: 'Клиент',   key: 'name',      width: 24 },
    { header: 'Телефон',  key: 'phone',     width: 18 },
    { header: 'Дата',     key: 'date',      width: 14 },
    { header: 'Время',    key: 'time',      width: 10 },
    { header: 'WhatsApp', key: 'wa',        width: 10 },
    { header: 'Принял',   key: 'source',    width: 14 },
    { header: 'Оператор', key: 'operator',  width: 18 },
    { header: 'Создано',  key: 'createdAt', width: 16 },
  ];

  // ── Header style ──────────────────────────────────────────────────────────
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
    };
  });
  headerRow.height = 28;

  // ── Data rows ─────────────────────────────────────────────────────────────
  filtered.forEach((apt, i) => {
    const row = ws.addRow({
      num:       i + 1,
      name:      apt.clientName,
      phone:     apt.phone,
      date:      format(apt.appointmentDate, 'dd.MM.yyyy', { locale: ru }),
      time:      apt.appointmentTime,
      wa:        apt.whatsappAccount,
      source:    apt.createdBy === 'BOT' ? '🤖 BOT' : '👤 OPERATOR',
      operator:  apt.operatorName ?? '—',
      createdAt: format(apt.createdAt, 'dd.MM HH:mm'),
    });

    // Alternate row fill
    const fill: ExcelJS.Fill = i % 2 === 0
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } };

    row.eachCell((cell) => {
      cell.fill = fill;
      cell.alignment = { vertical: 'middle' };
    });

    // Highlight BOT source cell green, OPERATOR blue
    const sourceCell = row.getCell('source');
    if (apt.createdBy === 'BOT') {
      sourceCell.font = { color: { argb: 'FF065F46' }, bold: true };
    } else {
      sourceCell.font = { color: { argb: 'FF1E3A8A' }, bold: true };
    }
  });

  // ── Auto-filter ───────────────────────────────────────────────────────────
  ws.autoFilter = { from: 'A1', to: 'I1' };

  // ── Freeze header ─────────────────────────────────────────────────────────
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Write Excel to disk (used for background export with Socket.IO notification).
 */
export async function generateReportFile(
  rows: AppointmentRow[],
): Promise<string> {
  const fileName = `appointments_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
  const filePath = path.join(REPORTS_DIR, fileName);
  const buffer = await buildExcelBuffer(rows, 'ALL');
  fs.writeFileSync(filePath, buffer);
  logger.info(`📊 Excel report written → ${filePath}`);
  return filePath;
}

function filterRows(rows: AppointmentRow[], type: ExportType): AppointmentRow[] {
  switch (type) {
    case 'AINUR': return rows.filter((r) => r.whatsappAccount === 'WA1');
    case 'AIBEK': return rows.filter((r) => ['WA2', 'WA3', 'WA4'].includes(r.whatsappAccount));
    case 'BOT':   return rows.filter((r) => r.createdBy === 'BOT');
    case 'ALL':
    default:      return rows;
  }
}
