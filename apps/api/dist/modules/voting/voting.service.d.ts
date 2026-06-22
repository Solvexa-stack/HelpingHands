import { PrismaService } from '../../prisma/prisma.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChangeVoteDto } from './dto/change-vote.dto';
import { VoteFiltersDto } from './dto/vote-filters.dto';
export declare class VotingService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    castVote(dto: CastVoteDto, userId: number): Promise<any>;
    changeVote(studyId: number, userId: number, dto: ChangeVoteDto): Promise<any>;
    getResults(studyId: number, userId?: number): Promise<{
        studyId: number;
        status: any;
        votingEndsAt: any;
        total: any;
        for: {
            count: any;
            percentage: number;
        };
        against: {
            count: any;
            percentage: number;
        };
        abstain: {
            count: any;
            percentage: number;
        };
        myVote: any;
        recentComments: any;
    }>;
    listVotes(studyId: number, filters: VoteFiltersDto): Promise<{
        data: unknown[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
    }>;
    getMyVotes(userId: number): Promise<any>;
    autoCloseExpiredVotings(): Promise<{
        closed: any;
    }>;
}
