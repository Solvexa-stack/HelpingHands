import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
declare const RefreshStrategy_base: any;
export declare class RefreshStrategy extends RefreshStrategy_base {
    private config;
    constructor(config: ConfigService);
    validate(req: Request, payload: any): Promise<any>;
}
export {};
