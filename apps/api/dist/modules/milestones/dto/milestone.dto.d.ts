import { MilestoneStatus } from '@prisma/client';
export declare class CreateMilestoneDto {
    blockId: number;
    targetDate?: string;
    status?: MilestoneStatus;
}
declare const UpdateMilestoneDto_base: any;
export declare class UpdateMilestoneDto extends UpdateMilestoneDto_base {
    completedAt?: string;
}
export {};
