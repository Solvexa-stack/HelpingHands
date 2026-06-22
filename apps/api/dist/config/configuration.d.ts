declare const _default: () => {
    app: {
        nodeEnv: any;
        port: number;
        url: any;
        webUrl: any;
        adminUrl: any;
        uploadDir: any;
        maxFileSize: number;
    };
    database: {
        url: any;
    };
    jwt: {
        secret: any;
        expiresIn: any;
        refreshSecret: any;
        refreshExpiresIn: any;
    };
    mail: {
        host: any;
        port: number;
        secure: boolean;
        user: any;
        pass: any;
        from: any;
    };
    stripe: {
        secretKey: any;
        webhookSecret: any;
        publishableKey: any;
    };
    paypal: {
        clientId: any;
        clientSecret: any;
        mode: any;
    };
    payment: {
        successUrl: any;
        cancelUrl: any;
    };
    redis: {
        host: any;
        port: number;
    };
};
export default _default;
