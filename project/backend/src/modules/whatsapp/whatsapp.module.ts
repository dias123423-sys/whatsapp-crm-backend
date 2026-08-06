import { Module } from '@nestjs/common';
import { EvolutionService } from './evolution.service';
import { WhatsAppController } from './whatsapp.controller';
import { WebhookController } from './webhook.controller';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [LeadsModule],
  providers: [EvolutionService],
  controllers: [WhatsAppController, WebhookController],
  exports: [EvolutionService],
})
export class WhatsAppModule {}
