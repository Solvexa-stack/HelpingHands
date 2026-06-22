import { ParticipantsService, UpdateParticipantDto } from './participants.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class ParticipantsController {
    private participantsService;
    constructor(participantsService: ParticipantsService);
    findAll(query: PaginationDto): Promise<{
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
    findOne(id: number): Promise<any>;
    update(id: number, dto: UpdateParticipantDto, user: JwtPayload): Promise<any>;
    toggleActive(id: number): Promise<any>;
    updateAvatar(id: number, file: Express.Multer.File, user: JwtPayload): Promise<any>;
}
