import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EventBusService } from '../../events/event-bus.service';
import { ActorContextService } from '../../events/actor-context.storage';
import { BOARD_READ_ROLES } from '../policy/tenancy.repository';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  ActivateInviteDto,
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
    private eventBus: EventBusService,
    private actorContext: ActorContextService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated. Please contact support');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { admin, participant } = await this.resolveReference(user.referenceId, user.referenceType);
    const role = user.referenceType === 'admin' ? admin?.role : 'participant';
    const tokens = await this.generateTokens(user.id, user.email, role!, user.referenceType, user.referenceId);

    return {
      user: this.sanitizeUser({ ...user, admin, participant }),
      ...tokens,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const participant = await this.prisma.participant.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        representation: dto.representation || 'personal',
      },
    });

    const user = await this.prisma.user.create({
      data: {
        referenceId: participant.id,
        referenceType: 'participant',
        email: dto.email,
        password: hashedPassword,
        isActive: true,
        joiningDate: new Date(),
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, 'participant', 'participant', participant.id);

    await this.emailService.sendWelcomeEmail(user.email, `${participant.firstName} ${participant.lastName}`);

    return {
      user: this.sanitizeUser({ ...user, admin: null, participant }),
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    // BUG-6 fix (W1-E5-S1): the userId comes from the verified refresh token
    // itself — the previous hardcoded 0 made every refresh fail.
    let userId: number;
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId, token: refreshToken, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!stored) throw new UnauthorizedException('Refresh token invalid or expired');

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const user = stored.user;
    const { admin } = await this.resolveReference(user.referenceId, user.referenceType);
    const role = user.referenceType === 'admin' ? admin?.role : 'participant';
    return this.generateTokens(user.id, user.email, role!, user.referenceType, user.referenceId);
  }

  async logout(userId: number, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({ where: { userId, token: refreshToken } });
    } else {
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) return; // Silent — don't reveal if email exists

    await this.prisma.passwordResetToken.deleteMany({ where: { email: dto.email } });

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { email: dto.email, token, expiresAt },
    });

    await this.emailService.sendPasswordResetEmail(dto.email, token);
  }

  /**
   * Invitation activation (org onboarding): the invite created the account
   * with an unusable password plus a reset-flow token; this endpoint turns it
   * into a usable account in one step — identity + password + immediate JWTs
   * (activeOrgId resolves to the invited organization via the membership the
   * invite created). The token is single-use.
   */
  async activateInvite(dto: ActivateInviteDto) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token: dto.token } });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Invitation link is invalid or has expired');
    }

    const user = await this.prisma.user.findUnique({ where: { email: record.email } });
    if (!user) throw new BadRequestException('Invitation account not found');

    if (user.referenceType === 'admin') {
      await this.prisma.admin.update({
        where: { id: user.referenceId },
        data: { firstName: dto.firstName, lastName: dto.lastName },
      });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(dto.password, 12), emailVerifiedAt: new Date() },
    });
    // single-use: consume every outstanding token for this email
    await this.prisma.passwordResetToken.deleteMany({ where: { email: record.email } });

    const { admin, participant } = await this.resolveReference(user.referenceId, user.referenceType);
    const role = user.referenceType === 'admin' ? admin?.role : 'participant';
    const tokens = await this.generateTokens(user.id, user.email, role!, user.referenceType, user.referenceId);

    return {
      user: this.sanitizeUser({ ...user, emailVerifiedAt: new Date(), admin, participant }),
      ...tokens,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset token is invalid or expired');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { email: record.email },
      data: { password: hashedPassword },
    });

    await this.prisma.passwordResetToken.delete({ where: { token: dto.token } });
    await this.prisma.refreshToken.deleteMany({
      where: { user: { email: record.email } },
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const { admin, participant } = await this.resolveReference(user.referenceId, user.referenceType);
    return this.sanitizeUser({ ...user, admin, participant });
  }

  private async resolveReference(referenceId: number, referenceType: string) {
    if (referenceType === 'admin') {
      const admin = await this.prisma.admin.findUnique({ where: { id: referenceId } });
      return { admin, participant: null };
    }
    const participant = await this.prisma.participant.findUnique({ where: { id: referenceId } });
    return { admin: null, participant };
  }

  /** Bump when the token payload shape changes; older tokens re-auth via refresh. */
  static readonly TOKEN_VERSION = 2;

  /** W2-E5-S1: the workspaces this user may operate in. */
  async getContexts(userId: number) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: 'active' },
      include: { organization: { select: { id: true, name: true, type: true, status: true } } },
      orderBy: { id: 'asc' },
    });
    const boardGrant = await this.prisma.roleAssignment.findFirst({
      where: { userId, scopeType: 'platform' },
    });
    return {
      organizations: memberships.map((m) => m.organization),
      hasBoardWorkspace: boardGrant !== null,
    };
  }

  /**
   * W2-E5-S1: mint a token pair for a different active organization.
   * Members switch into their own organizations; platform/Board grant holders
   * may enter ANY organization workspace — the same read-everywhere principle
   * as the tenancy bypass, and audited the same way (every switch emits
   * `workspace.switched`, with `boardBypass` set for non-member entries).
   */
  async switchContext(userId: number, organizationId: number) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId, status: 'active' },
    });

    let boardBypass = false;
    if (!membership) {
      const boardGrant = await this.prisma.roleAssignment.findFirst({
        where: { userId, scopeType: 'platform', role: { in: BOARD_READ_ROLES } },
      });
      if (!boardGrant) throw new UnauthorizedException('You are not a member of this organization');
      const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
      if (!organization) throw new UnauthorizedException('You are not a member of this organization');
      boardBypass = true;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    const { admin } = await this.resolveReference(user.referenceId, user.referenceType);
    const role = user.referenceType === 'admin' ? admin?.role : 'participant';
    const tokens = await this.generateTokens(user.id, user.email, role!, user.referenceType, user.referenceId, organizationId);

    this.eventBus.publish({
      event: 'workspace.switched',
      actor: this.actorContext.currentOrSystem(),
      subject: { type: 'organization', id: organizationId },
      data: { userId, organizationId, boardBypass },
    });

    return tokens;
  }

  private async generateTokens(
    userId: number,
    email: string,
    role: string,
    referenceType: string,
    referenceId: number,
    activeOrgIdOverride?: number,
  ) {
    // W1-E5-S1: activeOrgId defaults to the sole/first membership
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, status: 'active' },
      orderBy: { id: 'asc' },
    });

    const payload = {
      sub: userId,
      email,
      role,
      referenceType,
      referenceId,
      activeOrgId: activeOrgIdOverride ?? membership?.organizationId ?? null,
      tokenVersion: AuthService.TOKEN_VERSION,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.secret'),
        expiresIn: this.config.get('jwt.expiresIn', '15m'),
      }),
      // jti: two mints for the same user in the same second would otherwise
      // produce byte-identical JWTs and violate refresh_tokens.token UNIQUE
      this.jwt.signAsync({ ...payload, jti: uuidv4() }, {
        secret: this.config.get('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiresIn', '7d'),
      }),
    ]);

    const refreshExpiresIn = this.config.get('jwt.refreshExpiresIn', '7d');
    const days = parseInt(refreshExpiresIn.replace('d', ''));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, token: refreshToken, expiresAt },
    });

    // Keep last 5 refresh tokens per user
    const old = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: 5,
    });
    if (old.length) {
      await this.prisma.refreshToken.deleteMany({
        where: { id: { in: old.map((t) => t.id) } },
      });
    }

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any) {
    const { password, rememberToken, ...safe } = user;
    return safe;
  }
}
