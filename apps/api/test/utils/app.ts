import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/**
 * Boots the full application for e2e tests with the exact same request
 * pipeline as production (see src/app.setup.ts). Callers own the returned
 * app and must `await app.close()` in afterAll.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureApp(app);
  await app.init();
  return app;
}
