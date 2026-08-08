import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppParserService } from './whatsapp-parser.service';
import { WhatsAppService } from './whatsapp.service';
import { PrismaModule } from '@/common/prisma/prisma.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    HttpModule.register({ timeout: 30_000 }),
    PrismaModule,
    WebSocketModule,
  ],
  controllers: [
    WhatsAppController,
    WhatsAppWebhookController,
  ],
  providers: [
    WhatsAppService,
    WhatsAppParserService,
  ],
  exports: [
    WhatsAppService,
    WhatsAppParserService,
  ],
})
export class WhatsAppModule {}
