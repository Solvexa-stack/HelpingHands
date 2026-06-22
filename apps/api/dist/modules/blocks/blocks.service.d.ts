import { PrismaService } from '../../prisma/prisma.service';
import { CreateBlockDto, UpdateBlockDto, BlockQueryDto } from './dto/block.dto';
import { BlockCategory } from '@prisma/client';
export declare class BlocksService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(query: BlockQueryDto): Promise<{
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
    findBySlug(slug: string): Promise<any>;
    findById(id: number): Promise<any>;
    create(dto: CreateBlockDto): Promise<any>;
    update(id: number, dto: UpdateBlockDto): Promise<any>;
    remove(id: number): Promise<void>;
    toggleActive(id: number): Promise<any>;
    findByCategory(category: BlockCategory, lang?: string, limit?: number): Promise<any>;
}
