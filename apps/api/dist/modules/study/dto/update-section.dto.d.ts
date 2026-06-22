import { SectionStatus } from '@prisma/client';
export declare class UpdateSectionDto {
    content?: string;
    status?: SectionStatus;
    assignedTo?: number;
}
