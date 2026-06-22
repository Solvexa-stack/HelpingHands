import { VoteChoice } from '@prisma/client';
export declare class CastVoteDto {
    studyId: number;
    choice: VoteChoice;
    comment?: string;
}
