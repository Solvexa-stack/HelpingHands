import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { DomainEvent } from '../../events/domain-event';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditFiltersDto } from './dto/audit-filters.dto';

/**
 * W0-E3-S2 — writes every domain event into the append-only audit log.
 *
 * Subscribes to '**' on the domain bus. Idempotent on
 * (requestId, action, subjectType, subjectId): a replayed event hits the
 * unique index and is silently skipped. Failures are logged, never thrown —
 * the bus contract is that subscribers cannot break the emitting request.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent('**')
  async onDomainEvent(event: DomainEvent<any>): Promise<void> {
    if (!this.isDomainEvent(event)) return;

    // If the payload carries explicit snapshots use them; otherwise the
    // event data is the after-state description of the fact.
    const { before, after } = this.extractSnapshots(event.data);

    try {
      await this.prisma.auditLog.create({
        data: {
          timestamp: new Date(event.occurredAt),
          actorUserId: event.actor.userId,
          actorOrgId: null, // Wave 1: actor.activeOrgId
          action: event.event,
          subjectType: event.subject.type,
          subjectId: String(event.subject.id),
          before: before ?? Prisma.DbNull,
          after: after ?? Prisma.DbNull,
          requestId: event.requestId,
          ip: event.actor.ip,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') return; // replayed event — already audited
      this.logger.error(
        `Failed to audit "${event.event}" (requestId=${event.requestId})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ─── Read API (administrator-only, see AuditController) ─────────────────────

  async listLogs(filters: AuditFiltersDto) {
    const { page = 1, limit = 25 } = filters;
    const { skip, take } = paginate(page, limit);

    const where: Prisma.AuditLogWhereInput = {};
    if (filters.actorUserId !== undefined) where.actorUserId = filters.actorUserId;
    if (filters.subjectType) where.subjectType = filters.subjectType;
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.action) {
      where.action = filters.action.endsWith('.')
        ? { startsWith: filters.action }
        : filters.action;
    }
    if (filters.from || filters.to) {
      where.timestamp = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  async getLog(id: number) {
    const log = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException(`Audit log #${id} not found`);
    return log;
  }

  private isDomainEvent(event: unknown): event is DomainEvent<any> {
    const e = event as DomainEvent<any>;
    return (
      !!e &&
      typeof e === 'object' &&
      typeof e.event === 'string' &&
      !!e.actor &&
      !!e.subject &&
      typeof e.requestId === 'string' &&
      typeof e.occurredAt === 'string'
    );
  }

  private extractSnapshots(data: any): { before: any; after: any } {
    if (data && typeof data === 'object' && ('before' in data || 'after' in data)) {
      return { before: data.before ?? null, after: data.after ?? null };
    }
    return { before: null, after: data ?? null };
  }
}
