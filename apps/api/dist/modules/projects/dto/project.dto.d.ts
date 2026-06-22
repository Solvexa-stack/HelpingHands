import { ProjectCategory } from '@prisma/client';
export declare class CreateProjectDto {
    blockId: number;
    location?: string;
    dateOfCompletion?: string;
    value: number;
    category: ProjectCategory;
    expectedStartDate?: string;
    financialOfficerId?: number;
}
declare const UpdateProjectDto_base: any;
export declare class UpdateProjectDto extends UpdateProjectDto_base {
}
export declare class ProjectQueryDto {
    category?: ProjectCategory;
    location?: string;
    search?: string;
    isCompleted?: boolean;
    page?: number;
    limit?: number;
    lang?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export {};
