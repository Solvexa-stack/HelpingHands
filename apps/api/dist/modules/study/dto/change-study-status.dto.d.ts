import { StudyStatus } from '@prisma/client';
export declare class ChangeStudyStatusDto {
    status: StudyStatus;
    rejectionReason?: string;
    votingStartsAt?: string;
    votingEndsAt?: string;
}
