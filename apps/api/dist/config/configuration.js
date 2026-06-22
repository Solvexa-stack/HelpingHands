"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => ({
    app: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.APP_PORT || '4000', 10),
        url: process.env.APP_URL || 'http://localhost:4000',
        webUrl: process.env.WEB_URL || 'http://localhost:3000',
        adminUrl: process.env.ADMIN_URL || 'http://localhost:3001',
        uploadDir: process.env.UPLOAD_DIR || './uploads',
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
    },
    database: {
        url: process.env.DATABASE_URL,
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'fallback-secret',
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    mail: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.MAIL_FROM || 'HelpingHands <noreply@helpinghands.org>',
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    },
    paypal: {
        clientId: process.env.PAYPAL_CLIENT_ID || '',
        clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
        mode: process.env.PAYPAL_MODE || 'sandbox',
    },
    payment: {
        successUrl: process.env.PAYMENT_SUCCESS_URL || 'http://localhost:3000/en/donations/success',
        cancelUrl: process.env.PAYMENT_CANCEL_URL || 'http://localhost:3000/en/donations/cancel',
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
});
//# sourceMappingURL=configuration.js.map