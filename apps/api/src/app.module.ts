import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import configuration from './config/configuration';
import { EventsModule } from './events/events.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminsModule } from './modules/admins/admins.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { LanguagesModule } from './modules/languages/languages.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { FilesModule } from './modules/files/files.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DonationsModule } from './modules/donations/donations.module';
import { EmailModule } from './modules/email/email.module';
import { QrModule } from './modules/qr/qr.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { StudyModule } from './modules/study/study.module';
import { VotingModule } from './modules/voting/voting.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { FinancialModule } from './modules/financial/financial.module';
import { MilestonesModule } from './modules/milestones/milestones.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'long', ttl: 60000, limit: 200 },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    EventsModule,
    PrismaModule,
    AuthModule,
    AdminsModule,
    ParticipantsModule,
    LanguagesModule,
    BlocksModule,
    FilesModule,
    ProjectsModule,
    DonationsModule,
    EmailModule,
    QrModule,
    DashboardModule,
    StudyModule,
    VotingModule,
    PaymentsModule,
    NotificationsModule,
    ExecutionModule,
    FinancialModule,
    MilestonesModule,
    ReportsModule,
  ],
})
export class AppModule {}
