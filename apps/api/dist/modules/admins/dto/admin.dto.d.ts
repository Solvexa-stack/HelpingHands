import { AdminRole } from '@prisma/client';
export declare class CreateAdminDto {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: AdminRole;
}
declare const UpdateAdminDto_base: any;
export declare class UpdateAdminDto extends UpdateAdminDto_base {
}
export declare class UpdateProfileDto {
    firstName?: string;
    lastName?: string;
}
export {};
