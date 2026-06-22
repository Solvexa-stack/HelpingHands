"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const execution_service_1 = require("./execution.service");
const execution_dto_1 = require("./dto/execution.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let ExecutionController = class ExecutionController {
    constructor(executionService) {
        this.executionService = executionService;
    }
    findSteps(projectId) {
        return this.executionService.findSteps(projectId);
    }
    createStep(projectId, dto) {
        return this.executionService.createStep(projectId, dto);
    }
    updateStep(projectId, id, dto) {
        return this.executionService.updateStep(projectId, id, dto);
    }
    updateStepProgress(projectId, id, dto) {
        return this.executionService.updateStepProgress(projectId, id, dto);
    }
    removeStep(projectId, id) {
        return this.executionService.removeStep(projectId, id);
    }
    findPhases(projectId) {
        return this.executionService.findPhases(projectId);
    }
    createPhase(projectId, dto) {
        return this.executionService.createPhase(projectId, dto);
    }
    updatePhase(projectId, id, dto) {
        return this.executionService.updatePhase(projectId, id, dto);
    }
    removePhase(projectId, id) {
        return this.executionService.removePhase(projectId, id);
    }
    findTasks(projectId, phaseId) {
        return this.executionService.findTasks(projectId, phaseId ? +phaseId : undefined);
    }
    createTask(projectId, dto) {
        return this.executionService.createTask(projectId, dto);
    }
    updateTask(projectId, id, dto) {
        return this.executionService.updateTask(projectId, id, dto);
    }
    removeTask(projectId, id) {
        return this.executionService.removeTask(projectId, id);
    }
};
exports.ExecutionController = ExecutionController;
__decorate([
    (0, common_1.Get)('steps'),
    (0, swagger_1.ApiOperation)({ summary: 'List project steps' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "findSteps", null);
__decorate([
    (0, common_1.Post)('steps'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a step' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, execution_dto_1.CreateStepDto]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "createStep", null);
__decorate([
    (0, common_1.Patch)('steps/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a step' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, execution_dto_1.UpdateStepDto]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "updateStep", null);
__decorate([
    (0, common_1.Patch)('steps/:id/progress'),
    (0, swagger_1.ApiOperation)({ summary: 'Update step progress (0-100)' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, execution_dto_1.UpdateProgressDto]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "updateStepProgress", null);
__decorate([
    (0, common_1.Delete)('steps/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a step' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "removeStep", null);
__decorate([
    (0, common_1.Get)('phases'),
    (0, swagger_1.ApiOperation)({ summary: 'List project phases' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "findPhases", null);
__decorate([
    (0, common_1.Post)('phases'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a phase' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, execution_dto_1.CreatePhaseDto]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "createPhase", null);
__decorate([
    (0, common_1.Patch)('phases/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a phase' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, execution_dto_1.UpdatePhaseDto]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "updatePhase", null);
__decorate([
    (0, common_1.Delete)('phases/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a phase' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "removePhase", null);
__decorate([
    (0, common_1.Get)('tasks'),
    (0, swagger_1.ApiOperation)({ summary: 'List project tasks' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('phaseId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "findTasks", null);
__decorate([
    (0, common_1.Post)('tasks'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a task' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, execution_dto_1.CreateTaskDto]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "createTask", null);
__decorate([
    (0, common_1.Patch)('tasks/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a task' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, execution_dto_1.UpdateTaskDto]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "updateTask", null);
__decorate([
    (0, common_1.Delete)('tasks/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a task' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", void 0)
], ExecutionController.prototype, "removeTask", null);
exports.ExecutionController = ExecutionController = __decorate([
    (0, swagger_1.ApiTags)('Execution'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, common_1.Controller)({ path: 'projects/:projectId/execution', version: '1' }),
    __metadata("design:paramtypes", [execution_service_1.ExecutionService])
], ExecutionController);
//# sourceMappingURL=execution.controller.js.map