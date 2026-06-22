"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const schedule_1 = require("@nestjs/schedule");
const bull_1 = require("@nestjs/bull");
const configuration_1 = __importDefault(require("./config/configuration"));
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./modules/auth/auth.module");
const admins_module_1 = require("./modules/admins/admins.module");
const participants_module_1 = require("./modules/participants/participants.module");
const languages_module_1 = require("./modules/languages/languages.module");
const blocks_module_1 = require("./modules/blocks/blocks.module");
const files_module_1 = require("./modules/files/files.module");
const projects_module_1 = require("./modules/projects/projects.module");
const donations_module_1 = require("./modules/donations/donations.module");
const email_module_1 = require("./modules/email/email.module");
const qr_module_1 = require("./modules/qr/qr.module");
const dashboard_module_1 = require("./modules/dashboard/dashboard.module");
const study_module_1 = require("./modules/study/study.module");
const voting_module_1 = require("./modules/voting/voting.module");
const payments_module_1 = require("./modules/payments/payments.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const execution_module_1 = require("./modules/execution/execution.module");
const financial_module_1 = require("./modules/financial/financial.module");
const milestones_module_1 = require("./modules/milestones/milestones.module");
const reports_module_1 = require("./modules/reports/reports.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
                envFilePath: ['.env.local', '.env'],
            }),
            throttler_1.ThrottlerModule.forRoot([
                { name: 'short', ttl: 1000, limit: 20 },
                { name: 'long', ttl: 60000, limit: 200 },
            ]),
            schedule_1.ScheduleModule.forRoot(),
            bull_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (config) => ({
                    redis: {
                        host: config.get('redis.host', 'localhost'),
                        port: config.get('redis.port', 6379),
                    },
                }),
                inject: [config_1.ConfigService],
            }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            admins_module_1.AdminsModule,
            participants_module_1.ParticipantsModule,
            languages_module_1.LanguagesModule,
            blocks_module_1.BlocksModule,
            files_module_1.FilesModule,
            projects_module_1.ProjectsModule,
            donations_module_1.DonationsModule,
            email_module_1.EmailModule,
            qr_module_1.QrModule,
            dashboard_module_1.DashboardModule,
            study_module_1.StudyModule,
            voting_module_1.VotingModule,
            payments_module_1.PaymentsModule,
            notifications_module_1.NotificationsModule,
            execution_module_1.ExecutionModule,
            financial_module_1.FinancialModule,
            milestones_module_1.MilestonesModule,
            reports_module_1.ReportsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map