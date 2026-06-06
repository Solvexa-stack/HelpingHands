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
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import { AdminRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        admin: true,
        participant: true,
      },
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

    const role = user.referenceType === 'admin' ? user.admin?.role : 'participant';
    const tokens = await this.generateTokens(user.id, user.email, role!, user.referenceType, user.referenceId);

    return {
      user: this.sanitizeUser(user),
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
      include: { participant: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, 'participant', 'participant', participant.id);

    await this.emailService.sendWelcomeEmail(user.email, `${participant.firstName} ${participant.lastName}`);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refreshTokens(userId: number, refreshToken: string) {
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId, token: refreshToken, expiresAt: { gt: new Date() } },
      include: { user: { include: { admin: true, participant: true } } },
    });

    if (!stored) throw new UnauthorizedException('Refresh token invalid or expired');

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const user = stored.user;
    const role = user.referenceType === 'admin' ? user.admin?.role : 'participant';
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

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { admin: true, participant: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitizeUser(user);
  }

  private async generateTokens(
    userId: number,
    email: string,
    role: string,
    referenceType: string,
    referenceId: number,
  ) {
    const payload = { sub: userId, email, role, referenceType, referenceId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.secret'),
        expiresIn: this.config.get('jwt.expiresIn', '15m'),
      }),
      this.jwt.signAsync(payload, {
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

    // Clean up old tokens (keep last 5)
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: 5,
    });
    if (tokens.length) {
      await this.prisma.refreshToken.deleteMany({
        where: { id: { in: tokens.map((t) => t.id) } },
      });
    }

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any) {
    const { password, rememberToken, ...safe } = user;
    return safe;
  }
}
