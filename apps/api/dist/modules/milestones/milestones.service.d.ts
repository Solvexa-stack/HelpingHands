import { PrismaService } from '../../prisma/prisma.service';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/milestone.dto';
export declare class MilestonesService {
    private prisma;
    constructor(prisma: PrismaService);
    private getProjectBlockId;
    findAll(projectId: number): Promise<any>;
    create(projectId: number, dto: CreateMilestoneDto): Promise<any>;
    update(projectId: number, milestoneId: number, dto: UpdateMilestoneDto): Promise<any>;
    remove(projectId: number, milestoneId: number): Promise<void>;
}
