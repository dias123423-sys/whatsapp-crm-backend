import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ExcelService } from './services/excel.service';
import { ReportScheduler } from './services/report-scheduler.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'reports',
    }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ExcelService, ReportScheduler],
  exports: [ReportsService, ExcelService],
})
export class ReportsModule {}
