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

  async generateNightReport(date?: Date): Promise<string> {
    const reportDate = date || new Date();
    const dateStr = dayjs(reportDate).format('YYYY-MM-DD');

    // Night period: 19:00 previous day to 08:00 today
    const from = dayjs(reportDate).subtract(1, 'day').hour(19).minute(0).second(0).toDate();
    const to = dayjs(reportDate).hour(8).minute(0).second(0).toDate();

    const leads = await this.prisma.lead.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        period: 'NIGHT',
      },
      include: {
        client: true,
        operator: true,
        procedure: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const filePath = await this.buildExcel(leads, `Night_Leads_Report_${dateStr}.xlsx`);
    this.logger.log(`Night report generated: ${filePath} (${leads.length} leads)`);

    await this.prisma.report.create({
      data: {
        type: 'NIGHT',
        date: reportDate,
        filePath,
        data: { count: leads.length },
      },
    });

    return filePath;
  }

  async generateDailyReport(date?: Date): Promise<string> {
    const reportDate = date || new Date();
    const dateStr = dayjs(reportDate).format('YYYY-MM-DD');

    const from = dayjs(reportDate).startOf('day').toDate();
    const to = dayjs(reportDate).endOf('day').toDate();

    const leads = await this.prisma.lead.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { client: true, operator: true, procedure: true },
      orderBy: { createdAt: 'asc' },
    });

    const filePath = await this.buildExcel(leads, `Daily_Report_${dateStr}.xlsx`);

    await this.prisma.report.create({
      data: {
        type: 'DAILY',
        date: reportDate,
        filePath,
        data: { count: leads.length },
      },
    });

    return filePath;
  }

  private async buildExcel(leads: any[], filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Лиды');

    sheet.columns = [
      { header: 'Дата', key: 'date', width: 14 },
      { header: 'Время', key: 'time', width: 10 },
      { header: 'Телефон', key: 'phone', width: 18 },
      { header: 'Имя', key: 'name', width: 20 },
      { header: 'Процедура', key: 'procedure', width: 22 },
      { header: 'Цена (₸)', key: 'price', width: 12 },
      { header: 'Источник', key: 'source', width: 14 },
      { header: 'Оператор', key: 'operator', width: 18 },
      { header: 'Статус', key: 'status', width: 14 },
      { header: 'Результат', key: 'result', width: 30 },
    ];

    // Header styling
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    for (const lead of leads) {
      sheet.addRow({
        date: dayjs(lead.createdAt).format('DD.MM.YYYY'),
        time: dayjs(lead.createdAt).format('HH:mm'),
        phone: lead.client?.phone || '',
        name: lead.client?.name || '',
        procedure: lead.procedure?.name || '',
        price: lead.price || lead.procedure?.price || '',
        source: lead.source || '',
        operator: lead.operator?.name || '',
        status: lead.status || '',
        result: lead.result || lead.comment || '',
      });
    }

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      }
    });

    const filePath = path.join(this.reportsDir, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async getReportsList() {
    return this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
