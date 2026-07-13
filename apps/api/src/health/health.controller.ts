import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../common/decorators/roles.decorator';

// Liveness probe for Docker/orchestrator health checks (docs/docker/production.md).
// Version-neutral and public so it resolves to /api/health without auth or
// the /v1 prefix, independent of API versioning changes.
@Controller('health')
export class HealthController {
  @Public()
  @Version(VERSION_NEUTRAL)
  @Get()
  check() {
    return { status: 'ok' };
  }
}
