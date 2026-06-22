import { ExecutionService } from './execution.service';
import { CreateStepDto, UpdateStepDto, UpdateProgressDto, CreatePhaseDto, UpdatePhaseDto, CreateTaskDto, UpdateTaskDto } from './dto/execution.dto';
export declare class ExecutionController {
    private executionService;
    constructor(executionService: ExecutionService);
    findSteps(projectId: number): Promise<any>;
    createStep(projectId: number, dto: CreateStepDto): Promise<any>;
    updateStep(projectId: number, id: number, dto: UpdateStepDto): Promise<any>;
    updateStepProgress(projectId: number, id: number, dto: UpdateProgressDto): Promise<any>;
    removeStep(projectId: number, id: number): Promise<void>;
    findPhases(projectId: number): Promise<any>;
    createPhase(projectId: number, dto: CreatePhaseDto): Promise<any>;
    updatePhase(projectId: number, id: number, dto: UpdatePhaseDto): Promise<any>;
    removePhase(projectId: number, id: number): Promise<void>;
    findTasks(projectId: number, phaseId?: string): Promise<any>;
    createTask(projectId: number, dto: CreateTaskDto): Promise<any>;
    updateTask(projectId: number, id: number, dto: UpdateTaskDto): Promise<any>;
    removeTask(projectId: number, id: number): Promise<void>;
}
