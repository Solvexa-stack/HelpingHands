import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import configuration from './config/configuration';
import { EventsModule } from './events/events.module';
import { AuditModule } from './modules/audit/audit.module';
import { PolicyModule } from './modules/policy/policy.module';
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
import { GovernanceModule } from './modules/governance/governance.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { FundsModule } from './modules/funds/funds.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { FinancialModule } from './modules/financial/financial.module';
import { MilestonesModule } from './modules/milestones/milestones.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // Local dev (`pnpm dev`) runs with CWD apps/api — fall back to the repo
      // root .env so enforcement flags match the docker/e2e environments.
      envFilePath: ['.env.local', '.env', '../../.env'],
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
    AuditModule,
    PolicyModule,
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
    GovernanceModule,
    WorkflowModule,
    TreasuryModule,
    FundsModule,
    PaymentsModule,
    NotificationsModule,
    ExecutionModule,
    FinancialModule,
    MilestonesModule,
    OrganizationsModule,
    ReportsModule,
  ],
})
export class AppModule {}
