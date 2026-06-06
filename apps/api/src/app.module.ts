import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
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
  ],
})
export class AppModule {}
