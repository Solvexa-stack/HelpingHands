"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const response_interceptor_1 = require("./common/interceptors/response.interceptor");
const path_1 = require("path");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log', 'debug'],
        cors: true,
        rawBody: true,
    });
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('app.port', 4000);
    const appUrl = configService.get('app.url', 'http://localhost:4000');
    app.use((0, helmet_1.default)({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    app.enableCors({
        origin: [
            configService.get('app.webUrl', 'http://localhost:3000'),
            configService.get('app.adminUrl', 'http://localhost:3001'),
            'http://localhost:3000',
            'http://localhost:3002',
            'http://localhost:3001',
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
    });
    app.useStaticAssets((0, path_1.join)(process.cwd(), 'uploads'), { prefix: '/uploads' });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: common_1.VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    app.useGlobalInterceptors(new response_interceptor_1.ResponseInterceptor());
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('HelpingHands API')
        .setDescription('Donation Management Platform REST API')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
        .addTag('Auth', 'Authentication endpoints')
        .addTag('Languages', 'Language management')
        .addTag('Blocks', 'Content blocks (blog, news, events, about)')
        .addTag('Files', 'File management')
        .addTag('Projects', 'Project management')
        .addTag('Donations', 'Donation management')
        .addTag('Participants', 'Participant management')
        .addTag('Admins', 'Admin management')
        .addTag('Dashboard', 'Dashboard statistics')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: { persistAuthorization: true },
    });
    await app.listen(port);
    console.log(`\n🚀 API running at ${appUrl}/api`);
    console.log(`📖 Swagger docs at ${appUrl}/api/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map