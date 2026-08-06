import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsService } from './reports.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private reportsService: ReportsService) {}

  // Every day at 08:00 — generate night report for leads from 19:00-08:00
  @Cron('0 8 * * *')
  async generateNightReport() {
    this.logger.log('Scheduler: generating night leads report...');
    try {
      const filePath = await this.reportsService.generateNightReport();
      this.logger.log(`Night report ready: ${filePath}`);
    } catch (err) {
      this.logger.error('Failed to generate night report', err);
    }
  }

  // Every day at 20:00 — generate daily report
  @Cron('0 20 * * *')
  async generateDailyReport() {
    this.logger.log('Scheduler: generating daily report...');
    try {
      const filePath = await this.reportsService.generateDailyReport();
      this.logger.log(`Daily report ready: ${filePath}`);
    } catch (err) {
      this.logger.error('Failed to generate daily report', err);
    }
  }
}
