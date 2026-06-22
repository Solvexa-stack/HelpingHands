import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { LoginDto, RegisterDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto } from './dto/auth.dto';
export declare class AuthService {
    private prisma;
    private jwt;
    private config;
    private emailService;
    constructor(prisma: PrismaService, jwt: JwtService, config: ConfigService, emailService: EmailService);
    login(dto: LoginDto): Promise<{
        accessToken: any;
        refreshToken: any;
        user: any;
    }>;
    register(dto: RegisterDto): Promise<{
        accessToken: any;
        refreshToken: any;
        user: any;
    }>;
    refreshTokens(userId: number, refreshToken: string): Promise<{
        accessToken: any;
        refreshToken: any;
    }>;
    logout(userId: number, refreshToken?: string): Promise<void>;
    forgotPassword(dto: ForgotPasswordDto): Promise<void>;
    resetPassword(dto: ResetPasswordDto): Promise<void>;
    changePassword(userId: number, dto: ChangePasswordDto): Promise<void>;
    getProfile(userId: number): Promise<any>;
    private resolveReference;
    private generateTokens;
    private sanitizeUser;
}
