import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { ProcedureDetectorService } from './procedure-detector.service';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [LeadsModule],
  controllers: [WebhookController],
  providers: [WebhookService, ProcedureDetectorService],
  exports: [ProcedureDetectorService],
})
export class WebhookModule {}
