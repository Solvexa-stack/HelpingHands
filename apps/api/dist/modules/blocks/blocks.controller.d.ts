import { BlocksService } from './blocks.service';
import { CreateBlockDto, UpdateBlockDto, BlockQueryDto } from './dto/block.dto';
export declare class BlocksController {
    private blocksService;
    constructor(blocksService: BlocksService);
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
    findOne(id: number): Promise<any>;
    findBySlug(slug: string): Promise<any>;
    create(dto: CreateBlockDto): Promise<any>;
    update(id: number, dto: UpdateBlockDto): Promise<any>;
    toggleActive(id: number): Promise<any>;
    remove(id: number): Promise<void>;
}
