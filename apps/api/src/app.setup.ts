import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/**
 * Request-pipeline configuration shared between the production bootstrap
 * (main.ts) and the e2e test harness (test/utils/app.ts). Anything that
 * changes how a request is parsed, validated or serialized belongs here.
 */
export function configureApp(app: INestApplication): void {
  // Global prefix & versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
}
