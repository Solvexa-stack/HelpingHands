import { PrismaClient, PublicationVisibility } from '@prisma/client';

/**
 * W7-E1-S2 — conservative publication-policy defaults (18): aggregates
 * public, detail workspace-only, donor identity private unless opted-in,
 * beneficiary data NEVER public (immutable — enforced in the policy service
 * and hard-excluded at query level in the read layer).
 *
 * Idempotent: creates missing rows only — Board changes survive reseeds.
 */
export const PUBLICATION_POLICY_DEFAULTS: Array<{
  fieldClass: string;
  visibility: PublicationVisibility;
  description: string;
}> = [
  { fieldClass: 'platform.stats', visibility: 'public', description: 'Platform-level statistics: projects by category/status, intake by channel, orgs by type' },
  { fieldClass: 'fund.totals', visibility: 'public', description: 'Fund balances, intake, allocated, disbursed' },
  { fieldClass: 'fund.allocations', visibility: 'public', description: 'Per-project allocations from funds (amounts, statuses, spend by category)' },
  { fieldClass: 'project.funding', visibility: 'public', description: 'Project funding totals by channel, progress, funding sources' },
  { fieldClass: 'project.spend', visibility: 'public', description: 'Project money trail: intake → account credit → spend category' },
  { fieldClass: 'project.decisions', visibility: 'public', description: 'Board decision registry entries (decision, rationale, date — no member identities)' },
  { fieldClass: 'org.portfolio', visibility: 'public', description: 'Organization profile, verified badge, project portfolio' },
  { fieldClass: 'sector.totals', visibility: 'public', description: 'Sector-level totals: donations, allocated, spent, remaining balance, active projects (W9)' },
  { fieldClass: 'donor.identity', visibility: 'workspace_only', description: 'Donor names/emails — private unless the donor opts in (opt-in arrives with a later wave)' },
  { fieldClass: 'beneficiary.data', visibility: 'never_public', description: 'Personal beneficiary data (social-support categories) — hard-excluded from the public layer at query level; cannot be opened by policy' },
];

export async function seedPublicationPolicy(prisma: PrismaClient): Promise<{ created: number }> {
  let created = 0;
  for (const entry of PUBLICATION_POLICY_DEFAULTS) {
    const existing = await prisma.publicationPolicy.findUnique({ where: { fieldClass: entry.fieldClass } });
    if (!existing) {
      await prisma.publicationPolicy.create({ data: entry });
      created += 1;
    }
  }
  return { created };
}
