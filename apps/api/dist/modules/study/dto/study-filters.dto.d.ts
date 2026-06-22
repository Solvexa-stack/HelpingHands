import { StudyStatus } from '@prisma/client';
export declare class StudyFiltersDto {
    status?: StudyStatus;
    projectId?: number;
    page?: number;
    limit?: number;
}
