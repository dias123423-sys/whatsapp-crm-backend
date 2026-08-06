import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [ReportsController],
  providers: [ReportsService, TelegramService],
  exports: [ReportsService],
})
export class ReportsModule {}
