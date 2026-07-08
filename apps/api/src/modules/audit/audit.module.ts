import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Audit trail (W0-E3). AuditService subscribes to all domain events and
 * writes append-only AuditLog rows; AuditController exposes the
 * administrator-only read API used by the admin audit viewer.
 */
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
