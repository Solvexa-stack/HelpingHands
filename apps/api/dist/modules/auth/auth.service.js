"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
const email_service_1 = require("../email/email.service");
const bcrypt = __importStar(require("bcryptjs"));
const uuid_1 = require("uuid");
let AuthService = class AuthService {
    constructor(prisma, jwt, config, emailService) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.config = config;
        this.emailService = emailService;
    }
    async login(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!user || !user.password) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!user.isActive) {
            throw new common_1.UnauthorizedException('Account is deactivated. Please contact support');
        }
        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const { admin, participant } = await this.resolveReference(user.referenceId, user.referenceType);
        const role = user.referenceType === 'admin' ? admin?.role : 'participant';
        const tokens = await this.generateTokens(user.id, user.email, role, user.referenceType, user.referenceId);
        return {
            user: this.sanitizeUser({ ...user, admin, participant }),
            ...tokens,
        };
    }
    async register(dto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing)
            throw new common_1.ConflictException('Email already registered');
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
    async refreshTokens(userId, refreshToken) {
        const stored = await this.prisma.refreshToken.findFirst({
            where: { userId, token: refreshToken, expiresAt: { gt: new Date() } },
            include: { user: true },
        });
        if (!stored)
            throw new common_1.UnauthorizedException('Refresh token invalid or expired');
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
        const user = stored.user;
        const { admin } = await this.resolveReference(user.referenceId, user.referenceType);
        const role = user.referenceType === 'admin' ? admin?.role : 'participant';
        return this.generateTokens(user.id, user.email, role, user.referenceType, user.referenceId);
    }
    async logout(userId, refreshToken) {
        if (refreshToken) {
            await this.prisma.refreshToken.deleteMany({ where: { userId, token: refreshToken } });
        }
        else {
            await this.prisma.refreshToken.deleteMany({ where: { userId } });
        }
    }
    async forgotPassword(dto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user)
            return;
        await this.prisma.passwordResetToken.deleteMany({ where: { email: dto.email } });
        const token = (0, uuid_1.v4)();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await this.prisma.passwordResetToken.create({
            data: { email: dto.email, token, expiresAt },
        });
        await this.emailService.sendPasswordResetEmail(dto.email, token);
    }
    async resetPassword(dto) {
        const record = await this.prisma.passwordResetToken.findUnique({
            where: { token: dto.token },
        });
        if (!record || record.expiresAt < new Date()) {
            throw new common_1.BadRequestException('Reset token is invalid or expired');
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
    async changePassword(userId, dto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.password)
            throw new common_1.NotFoundException('User not found');
        const isValid = await bcrypt.compare(dto.currentPassword, user.password);
        if (!isValid)
            throw new common_1.BadRequestException('Current password is incorrect');
        const hashed = await bcrypt.hash(dto.newPassword, 12);
        await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const { admin, participant } = await this.resolveReference(user.referenceId, user.referenceType);
        return this.sanitizeUser({ ...user, admin, participant });
    }
    async resolveReference(referenceId, referenceType) {
        if (referenceType === 'admin') {
            const admin = await this.prisma.admin.findUnique({ where: { id: referenceId } });
            return { admin, participant: null };
        }
        const participant = await this.prisma.participant.findUnique({ where: { id: referenceId } });
        return { admin: null, participant };
    }
    async generateTokens(userId, email, role, referenceType, referenceId) {
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
    sanitizeUser(user) {
        const { password, rememberToken, ...safe } = user;
        return safe;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, typeof (_a = typeof jwt_1.JwtService !== "undefined" && jwt_1.JwtService) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object, email_service_1.EmailService])
], AuthService);
//# sourceMappingURL=auth.service.js.map