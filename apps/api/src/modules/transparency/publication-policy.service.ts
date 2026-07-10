import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicationVisibility } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * W7-E1-S2 — the Board-controlled publication policy: which field classes the
 * public transparency layer may serve. Allowlist semantics — an unknown or
 * missing class is NOT public. `never_public` classes (beneficiary data) are
 * immutable: no policy change can open them; the read layer additionally
 * hard-excludes them at query level (defense in depth).
 */
@Injectable()
export class PublicationPolicyService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  /** 60s policy cache — public endpoints consult this on every request. */
  private cache: { at: number; map: Map<string, PublicationVisibility> } | null = null;

  async isPublic(fieldClass: string): Promise<boolean> {
    return (await this.visibilityOf(fieldClass)) === 'public';
  }

  async visibilityOf(fieldClass: string): Promise<PublicationVisibility | null> {
    if (!this.cache || Date.now() - this.cache.at > 60_000) {
      const rows = await this.prisma.publicationPolicy.findMany();
      this.cache = { at: Date.now(), map: new Map(rows.map((r) => [r.fieldClass, r.visibility])) };
    }
    return this.cache.map.get(fieldClass) ?? null;
  }

  list() {
    return this.prisma.publicationPolicy.findMany({ orderBy: { fieldClass: 'asc' } });
  }

  /** Board-gated + audited; the never_public class cannot be opened. */
  async changeVisibility(actor: ActorContext, fieldClass: string, visibility: PublicationVisibility) {
    const entry = await this.prisma.publicationPolicy.findUnique({ where: { fieldClass } });
    if (!entry) throw new NotFoundException(`Unknown publication field class "${fieldClass}"`);
    if (entry.visibility === 'never_public') {
      throw new BadRequestException(
        `"${fieldClass}" is hard-excluded from publication and cannot be opened by policy`,
      );
    }
    if (visibility === 'never_public') {
      throw new BadRequestException('never_public is reserved for hard-excluded classes seeded as such');
    }

    const updated = await this.prisma.publicationPolicy.update({
      where: { fieldClass },
      data: { visibility, updatedByUserId: actor.userId },
    });
    this.cache = null;
    this.eventBus.publish({
      event: 'publication_policy.changed',
      actor,
      subject: { type: 'publication_policy', id: updated.id },
      data: { fieldClass, before: entry.visibility, after: visibility },
    });
    return updated;
  }
}
