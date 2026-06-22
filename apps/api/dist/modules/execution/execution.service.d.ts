import { PrismaService } from '../../prisma/prisma.service';
import { CreateStepDto, UpdateStepDto, UpdateProgressDto, CreatePhaseDto, UpdatePhaseDto, CreateTaskDto, UpdateTaskDto } from './dto/execution.dto';
export declare class ExecutionService {
    private prisma;
    constructor(prisma: PrismaService);
    private getProjectBlockId;
    private assertBlockExists;
    findSteps(projectId: number): Promise<any>;
    createStep(projectId: number, dto: CreateStepDto): Promise<any>;
    updateStep(projectId: number, stepId: number, dto: UpdateStepDto): Promise<any>;
    updateStepProgress(projectId: number, stepId: number, dto: UpdateProgressDto): Promise<any>;
    removeStep(projectId: number, stepId: number): Promise<void>;
    findPhases(projectId: number): Promise<any>;
    createPhase(projectId: number, dto: CreatePhaseDto): Promise<any>;
    updatePhase(projectId: number, phaseId: number, dto: UpdatePhaseDto): Promise<any>;
    removePhase(projectId: number, phaseId: number): Promise<void>;
    findTasks(projectId: number, phaseId?: number): Promise<any>;
    createTask(projectId: number, dto: CreateTaskDto): Promise<any>;
    updateTask(projectId: number, taskId: number, dto: UpdateTaskDto): Promise<any>;
    removeTask(projectId: number, taskId: number): Promise<void>;
}
