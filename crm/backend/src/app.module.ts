import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { LeadsModule } from './modules/leads/leads.module';
import { OperatorsModule } from './modules/operators/operators.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ProceduresModule } from './modules/procedures/procedures.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    // ── Config ────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),

    // ── Events ────────────────────────────────────────────────────────────
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),

    // ── Rate limiting ─────────────────────────────────────────────────────
    ThrottlerModule.forRoot([{
      name: 'default',
      ttl: 60_000,
      limit: 300,
    }]),

    // ── Core ──────────────────────────────────────────────────────────────
    DatabaseModule,
    AuthModule,

    // ── Business modules ──────────────────────────────────────────────────
    LeadsModule,
    OperatorsModule,
    CampaignsModule,
    ProceduresModule,
    WebhookModule,
    ReportsModule,
    NotificationsModule,
  ],
  providers: [
    // ── Global guards ─────────────────────────────────────────────────────
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // ── Global interceptors ───────────────────────────────────────────────
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    // ── Global filters ────────────────────────────────────────────────────
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
