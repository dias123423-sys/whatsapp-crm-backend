import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OperatorsModule } from './modules/operators/operators.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ClientsModule } from './modules/clients/clients.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { ProceduresModule } from './modules/procedures/procedures.module';
import { AssignmentModule } from './modules/assignment/assignment.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CallsModule } from './modules/calls/calls.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    OperatorsModule,
    LeadsModule,
    ClientsModule,
    WhatsAppModule,
    ProceduresModule,
    AssignmentModule,
    ReportsModule,
    CallsModule,
    NotificationsModule,
    AuditModule,
    HealthModule,
  ],
})
export class AppModule {}
