import { AdminRole } from '@prisma/client';
export declare const ROLES_KEY = "roles";
export declare const Roles: (...roles: (AdminRole | "participant")[]) => any;
export declare const Public: () => any;
