import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Representation } from '@prisma/client';
export declare class UpdateParticipantDto {
    firstName?: string;
    lastName?: string;
    representation?: Representation;
}
export declare class ParticipantsService {
    private prisma;
    constructor(prisma: PrismaService);
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
    findById(id: number): Promise<any>;
    update(participantId: number, dto: UpdateParticipantDto, requestingUserId: number, role: string): Promise<any>;
    toggleActive(id: number): Promise<any>;
    updateAvatar(participantId: number, avatarUrl: string): Promise<any>;
}
