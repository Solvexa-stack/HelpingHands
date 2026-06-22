import { VotingService } from './voting.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChangeVoteDto } from './dto/change-vote.dto';
import { VoteFiltersDto } from './dto/vote-filters.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
export declare class VotingController {
    private votingService;
    constructor(votingService: VotingService);
    castVote(dto: CastVoteDto, userId: number): Promise<any>;
    changeVote(studyId: number, dto: ChangeVoteDto, userId: number): Promise<any>;
    getResults(studyId: number, user: JwtPayload | undefined): Promise<{
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
    getMyVotes(userId: number): Promise<any>;
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
}
