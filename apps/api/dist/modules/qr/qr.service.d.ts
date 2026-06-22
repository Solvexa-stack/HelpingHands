import { ConfigService } from '@nestjs/config';
export declare class QrService {
    private config;
    constructor(config: ConfigService);
    generateToken(): string;
    buildDonationUrl(token: string): string;
    generateQrDataUrl(token: string): Promise<string>;
    generateQrBuffer(token: string): Promise<Buffer>;
}
