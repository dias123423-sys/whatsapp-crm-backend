import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReportsService } from './reports.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private reportsService: ReportsService) {}

  // ── Every day at 09:00 — Night report (19:00 prev day → 09:00 today) ─────
  @Cron('0 9 * * *', { timeZone: 'Asia/Almaty' })
  async generateNightReport() {
    this.logger.log('⏰ Scheduler: generating NIGHT report (09:00)...');
    try {
      const files = await this.reportsService.generateNightReport();
      this.logger.log(`✅ Night reports ready: ${files.map(f => f.split('/').pop()).join(', ')}`);
    } catch (err) {
      this.logger.error('❌ Night report failed:', err?.message);
    }
  }

  // ── Every day at 20:00 — Daily report ────────────────────────────────────
  @Cron('0 20 * * *', { timeZone: 'Asia/Almaty' })
  async generateDailyReport() {
    this.logger.log('⏰ Scheduler: generating DAILY report (20:00)...');
    try {
      const files = await this.reportsService.generateDailyReport();
      this.logger.log(`✅ Daily reports ready: ${files.map(f => f.split('/').pop()).join(', ')}`);
    } catch (err) {
      this.logger.error('❌ Daily report failed:', err?.message);
    }
  }
}
