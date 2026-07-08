import { Global, Module } from '@nestjs/common';
import { PolicyDivergenceRecorder, PolicyGuard } from './policy.guard';
import { PolicyService } from './policy.service';
import { TenancyRepository } from './tenancy.repository';

/**
 * W1-E4 — policy engine. Global so guards and (later) workflow/tenancy code
 * can inject PolicyService. The shadow PolicyGuard itself is registered in
 * AuthModule between JwtAuthGuard and RolesGuard (guard order matters).
 */
@Global()
@Module({
  providers: [PolicyService, PolicyDivergenceRecorder, PolicyGuard, TenancyRepository],
  exports: [PolicyService, PolicyDivergenceRecorder, PolicyGuard, TenancyRepository],
})
export class PolicyModule {}
