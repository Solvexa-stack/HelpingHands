import { DonationStatus } from '@prisma/client';
export declare class CreateDonationDto {
    projectId: number;
    amount: number;
}
export declare class UpdateDonationStatusDto {
    status: DonationStatus;
    notes?: string;
}
export declare class DonationQueryDto {
    status?: DonationStatus;
    projectId?: number;
    participantId?: number;
    page?: number;
    limit?: number;
    search?: string;
}
