import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';

@Injectable()
export class QrService {
  constructor(private config: ConfigService) {}

  generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  buildDonationUrl(token: string): string {
    const appUrl = this.config.get('app.webUrl', 'http://localhost:3200');
    return `${appUrl}/donations/${token}`;
  }

  async generateQrDataUrl(token: string): Promise<string> {
    const url = this.buildDonationUrl(token);
    return QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 2,
      color: { dark: '#1e3a5f', light: '#ffffff' },
    });
  }

  async generateQrBuffer(token: string): Promise<Buffer> {
    const url = this.buildDonationUrl(token);
    return QRCode.toBuffer(url, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 400,
      margin: 2,
    });
  }
}
