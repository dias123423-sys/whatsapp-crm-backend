import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsService } from '../reports.service';

@Injectable()
export class ReportScheduler {
  private readonly logger = new Logger(ReportScheduler.name);

  constructor(private reportsService: ReportsService) {}

  /**
   * Generate night report automatically at 09:00
   * Night period: 19:00 - 08:59
   */
  @Cron('0 9 * * *', {
    name: 'night-report',
    timeZone: 'Asia/Almaty',
  })
  async handleNightReport() {
    try {
      this.logger.log('Starting automatic night report generation...');

      const report = await this.reportsService.generateNightReport();

      this.logger.log(
        `Night report generated successfully: ${report.leads} leads, file: ${report.filename}`,
      );
    } catch (error) {
      this.logger.error('Failed to generate night report', error);
    }
  }

  /**
   * Generate day report automatically at 20:00
   * Day period: 09:00 - 19:59
   */
  @Cron('0 20 * * *', {
    name: 'day-report',
    timeZone: 'Asia/Almaty',
  })
  async handleDayReport() {
    try {
      this.logger.log('Starting automatic day report generation...');

      const report = await this.reportsService.generateDayReport();

      this.logger.log(
        `Day report generated successfully: ${report.leads} leads, file: ${report.filename}`,
      );
    } catch (error) {
      this.logger.error('Failed to generate day report', error);
    }
  }

  /**
   * Cleanup old reports every Sunday at 02:00
   */
  @Cron('0 2 * * 0', {
    name: 'cleanup-reports',
    timeZone: 'Asia/Almaty',
  })
  async handleCleanupReports() {
    try {
      this.logger.log('Starting report cleanup...');

      const count = await this.reportsService.cleanupOldReports();

      this.logger.log(`Report cleanup completed: ${count} files deleted`);
    } catch (error) {
      this.logger.error('Failed to cleanup reports', error);
    }
  }
}
