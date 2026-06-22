import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';
export declare class ProjectsController {
    private projectsService;
    constructor(projectsService: ProjectsService);
    findAll(query: ProjectQueryDto): Promise<{
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
    findOne(id: number, lang?: string): Promise<any>;
    create(dto: CreateProjectDto): Promise<any>;
    update(id: number, dto: UpdateProjectDto): Promise<any>;
    remove(id: number): Promise<void>;
    assignOfficer(id: number, officerId: number): Promise<any>;
}
