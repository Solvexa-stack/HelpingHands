export interface JwtPayload {
    sub: number;
    email: string;
    role: string;
    referenceType: string;
    referenceId: number;
}
export declare const CurrentUser: any;
