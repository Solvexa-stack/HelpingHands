import { VoteChoice } from '@prisma/client';
export declare class ChangeVoteDto {
    choice: VoteChoice;
    comment?: string;
}
