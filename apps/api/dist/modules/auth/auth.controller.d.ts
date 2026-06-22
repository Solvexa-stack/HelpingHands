import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
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
    refreshTokens(dto: RefreshTokenDto): Promise<{
        accessToken: any;
        refreshToken: any;
    }>;
    logout(user: JwtPayload, body: Partial<RefreshTokenDto>): Promise<void>;
    forgotPassword(dto: ForgotPasswordDto): Promise<void>;
    resetPassword(dto: ResetPasswordDto): Promise<void>;
    changePassword(userId: number, dto: ChangePasswordDto): Promise<void>;
    getProfile(userId: number): Promise<any>;
}
