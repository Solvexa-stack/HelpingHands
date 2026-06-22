import { StepStatus, PhaseStatus, TaskStatus } from '@prisma/client';
export declare class CreateStepDto {
    blockId: number;
    parentId?: number;
    status?: StepStatus;
    priority?: number;
    startDate?: string;
    endDate?: string;
}
declare const UpdateStepDto_base: any;
export declare class UpdateStepDto extends UpdateStepDto_base {
}
export declare class UpdateProgressDto {
    progress: number;
}
export declare class CreatePhaseDto {
    blockId: number;
    order?: number;
    status?: PhaseStatus;
    startDate?: string;
    endDate?: string;
}
declare const UpdatePhaseDto_base: any;
export declare class UpdatePhaseDto extends UpdatePhaseDto_base {
}
export declare class CreateTaskDto {
    blockId: number;
    phaseId?: number;
    assignedToId?: number;
    status?: TaskStatus;
    startDate?: string;
    endDate?: string;
}
declare const UpdateTaskDto_base: any;
export declare class UpdateTaskDto extends UpdateTaskDto_base {
}
export {};
