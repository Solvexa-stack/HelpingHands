import { AdminRole } from '@prisma/client';
import { AdminsService } from './admins.service';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class AdminsController {
    private adminsService;
    constructor(adminsService: AdminsService);
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
    findFinancialOfficers(): Promise<any>;
    findOne(id: number): Promise<any>;
    create(dto: CreateAdminDto, role: AdminRole): Promise<any>;
    update(id: number, dto: UpdateAdminDto, role: AdminRole): Promise<any>;
    toggleActive(id: number): Promise<any>;
}
