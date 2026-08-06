import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { SchedulerService } from './scheduler.service';

@Module({
  providers: [ReportsService, SchedulerService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
