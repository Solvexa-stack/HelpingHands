import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';
export declare class ProjectsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(query: ProjectQueryDto, userRole?: string, financialOfficerId?: number): Promise<{
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
    findById(id: number, lang?: string): Promise<any>;
    create(dto: CreateProjectDto): Promise<any>;
    update(id: number, dto: UpdateProjectDto): Promise<any>;
    remove(id: number): Promise<void>;
    recalculateProgress(projectId: number): Promise<void>;
    assignFinancialOfficer(projectId: number, officerId: number): Promise<any>;
}
