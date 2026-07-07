import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CurrentActor } from '../src/common/decorators/current-actor.decorator';
import { ActorContext, systemActor } from '../src/events/actor-context';
import { requestContextMiddleware } from '../src/events/actor-context.middleware';
import { ActorContextService } from '../src/events/actor-context.storage';
import { EventsModule } from '../src/events/events.module';
import { createTestApp } from './utils/app';
import { authHeaderFor } from './utils/auth';
import { resetDatabase } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * W0-E2-S2 — ActorContext construction, injection and requestId propagation.
 *
 * Part 1 uses a probe controller (test-only) around the real EventsModule
 * pipeline to observe the actor from inside a request. Part 2 asserts the
 * requestId surface on the full application.
 */

@Controller('probe')
class ProbeController {
  constructor(private readonly actorService: ActorContextService) {}

  @Get('actor')
  actor(@CurrentActor() actor: ActorContext) {
    return {
      fromDecorator: actor,
      fromService: this.actorService.current() ?? null,
    };
  }

  @Get('slow-actor')
  async slowActor(@CurrentActor() actor: ActorContext) {
    // Cross async boundaries before reading the service — proves the
    // AsyncLocalStorage context survives awaits.
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { fromService: this.actorService.current() ?? null, decoratorRequestId: actor.requestId };
  }
}

describe('ActorContext (W0-E2-S2) — probe app', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventsModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use(requestContextMiddleware);
    // Simulates JwtAuthGuard's outcome: guards run before interceptors, so
    // by interceptor time request.user is set on authed requests.
    app.use((req: any, _res: any, next: () => void) => {
      const header = req.headers['x-test-user'];
      if (header) {
        const [sub, referenceType] = String(header).split(':');
        req.user = { sub: Number(sub), referenceType, role: 'administrator', referenceId: 1, email: 't@t' };
      }
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('anonymous request: anonymous actor with a generated requestId, echoed as X-Request-Id', async () => {
    const res = await request(app.getHttpServer()).get('/probe/actor').expect(200);

    const actor = res.body.fromDecorator;
    expect(actor.userId).toBeNull();
    expect(actor.referenceType).toBe('anonymous');
    expect(actor.ip).toBeTruthy();
    expect(actor.requestId).toMatch(/^[0-9a-f-]{36}$/); // uuid
    expect(res.headers['x-request-id']).toBe(actor.requestId);
  });

  it('authenticated request: actor built from the JWT user', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/actor')
      .set('x-test-user', '42:admin')
      .expect(200);

    expect(res.body.fromDecorator.userId).toBe(42);
    expect(res.body.fromDecorator.referenceType).toBe('admin');
  });

  it('ActorContextService sees the same actor as the decorator (ALS wiring)', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/actor')
      .set('x-test-user', '42:admin')
      .expect(200);

    expect(res.body.fromService).toEqual(res.body.fromDecorator);
  });

  it('the ALS context survives async boundaries inside the handler', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/slow-actor')
      .set('x-test-user', '7:participant')
      .expect(200);

    expect(res.body.fromService.userId).toBe(7);
    expect(res.body.fromService.requestId).toBe(res.body.decoratorRequestId);
  });

  it('honors an inbound X-Request-Id for cross-service tracing', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/actor')
      .set('x-request-id', 'trace-abc-123')
      .expect(200);

    expect(res.body.fromDecorator.requestId).toBe('trace-abc-123');
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('concurrent requests do not leak actors across contexts', async () => {
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).get('/probe/slow-actor').set('x-test-user', '1:admin'),
      request(app.getHttpServer()).get('/probe/slow-actor').set('x-test-user', '2:participant'),
    ]);

    expect(a.body.fromService.userId).toBe(1);
    expect(b.body.fromService.userId).toBe(2);
    expect(a.body.fromService.requestId).not.toBe(b.body.fromService.requestId);
  });

  it('systemActor() provides context outside any request', () => {
    const sys = systemActor();
    expect(sys.userId).toBeNull();
    expect(sys.referenceType).toBe('system');
    expect(sys.requestId).toBeTruthy();
    expect(systemActor().requestId).not.toBe(sys.requestId); // fresh per job

    const service = new ActorContextService();
    expect(service.current()).toBeUndefined(); // no request context here
    expect(service.currentOrSystem().referenceType).toBe('system');
  });
});

describe('ActorContext (W0-E2-S2) — full application', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('every response carries X-Request-Id (public and authed routes)', async () => {
    const publicRes = await request(app.getHttpServer()).get('/api/v1/languages').expect(200);
    expect(publicRes.headers['x-request-id']).toBeTruthy();

    const authed = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', await authHeaderFor(prisma, 'administrator'))
      .set('x-request-id', 'e2e-full-app-trace')
      .expect(200);
    expect(authed.headers['x-request-id']).toBe('e2e-full-app-trace');
  });

  it('unauthenticated requests still get a requestId on the error response headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
