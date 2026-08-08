import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';

// Core modules
import { PrismaModule } from './common/prisma/prisma.module';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OperatorsModule } from './modules/operators/operators.module';
import { ClientsModule } from './modules/clients/clients.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ProceduresModule } from './modules/procedures/procedures.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { WebSocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // HTTP Module for external API calls
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),

    // Bull Queue
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
        },
      }),
    }),

    // Schedule (for cron jobs)
    ScheduleModule.forRoot(),

    // Core
    PrismaModule,

    // Features
    AuthModule,
    UsersModule,
    OperatorsModule,
    ClientsModule,
    LeadsModule,
    ProceduresModule,
    WhatsAppModule,
    ReportsModule,
    DashboardModule,
    AppointmentsModule,
    WebSocketModule,
  ],
})
export class AppModule {}
