import { VoteChoice } from '@prisma/client';
export declare class VoteFiltersDto {
    choice?: VoteChoice;
    page?: number;
    limit?: number;
}
