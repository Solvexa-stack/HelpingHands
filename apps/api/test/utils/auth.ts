import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';

/** The four accounts created by packages/database/prisma/seed.ts. */
export const SEED_ACCOUNTS = {
  administrator: { email: 'admin@helpinghands.org', password: 'Admin@123456' },
  employee: { email: 'employee@helpinghands.org', password: 'Employee@123' },
  financial_officer: { email: 'officer@helpinghands.org', password: 'Officer@123' },
  participant: { email: 'participant@example.com', password: 'Participant@123' },
} as const;

export type SeededRole = keyof typeof SEED_ACCOUNTS;

/**
 * Signs an access token for a seeded account without going through
 * POST /auth/login (avoids the login throttle and keeps suites fast).
 * Payload shape mirrors AuthService.generateTokens exactly.
 */
export async function accessTokenFor(prisma: PrismaClient, role: SeededRole): Promise<string> {
  const { email } = SEED_ACCOUNTS[role];
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`Seeded user ${email} not found — did resetDatabase() run?`);
  }

  const resolvedRole =
    user.referenceType === 'admin'
      ? (await prisma.admin.findUnique({ where: { id: user.referenceId } }))!.role
      : 'participant';

  const jwt = new JwtService({
    secret: process.env.JWT_SECRET,
    signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
  });

  const membership = await prisma.organizationMembership.findFirst({
    where: { userId: user.id, status: 'active' },
    orderBy: { id: 'asc' },
  });

  return jwt.signAsync({
    sub: user.id,
    email: user.email,
    role: resolvedRole,
    referenceType: user.referenceType,
    referenceId: user.referenceId,
    activeOrgId: membership?.organizationId ?? null,
    tokenVersion: 2, // keep in sync with AuthService.TOKEN_VERSION
  });
}

/** Convenience: `Authorization` header value for a seeded role. */
export async function authHeaderFor(prisma: PrismaClient, role: SeededRole): Promise<string> {
  return `Bearer ${await accessTokenFor(prisma, role)}`;
}
