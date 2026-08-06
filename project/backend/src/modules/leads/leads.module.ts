import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { AssignmentModule } from '../assignment/assignment.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AssignmentModule, NotificationsModule],
  providers: [LeadsService],
  controllers: [LeadsController],
  exports: [LeadsService],
})
export class LeadsModule {}
