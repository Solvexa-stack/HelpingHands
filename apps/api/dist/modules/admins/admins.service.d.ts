import { PrismaService } from '../../prisma/prisma.service';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';
import { AdminRole } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class AdminsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(query: PaginationDto, role?: AdminRole): Promise<{
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
    create(dto: CreateAdminDto, creatorRole: AdminRole): Promise<any>;
    update(id: number, dto: UpdateAdminDto, updaterRole: AdminRole): Promise<any>;
    toggleActive(id: number): Promise<any>;
    findFinancialOfficers(): Promise<any>;
}
