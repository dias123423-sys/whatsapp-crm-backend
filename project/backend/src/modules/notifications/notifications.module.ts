import { Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { SseService } from './sse.service';
import { SseController } from './sse.controller';

@Module({
  controllers: [SseController],
  providers: [NotificationsGateway, SseService],
  exports: [NotificationsGateway, SseService],
})
export class NotificationsModule {}
