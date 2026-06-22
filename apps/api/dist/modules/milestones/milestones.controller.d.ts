import { MilestonesService } from './milestones.service';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/milestone.dto';
export declare class MilestonesController {
    private milestonesService;
    constructor(milestonesService: MilestonesService);
    findAll(projectId: number): Promise<any>;
    create(projectId: number, dto: CreateMilestoneDto): Promise<any>;
    update(projectId: number, id: number, dto: UpdateMilestoneDto): Promise<any>;
    remove(projectId: number, id: number): Promise<void>;
}
