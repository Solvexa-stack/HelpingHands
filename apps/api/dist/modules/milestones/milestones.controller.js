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
exports.MilestonesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const milestones_service_1 = require("./milestones.service");
const milestone_dto_1 = require("./dto/milestone.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let MilestonesController = class MilestonesController {
    constructor(milestonesService) {
        this.milestonesService = milestonesService;
    }
    findAll(projectId) {
        return this.milestonesService.findAll(projectId);
    }
    create(projectId, dto) {
        return this.milestonesService.create(projectId, dto);
    }
    update(projectId, id, dto) {
        return this.milestonesService.update(projectId, id, dto);
    }
    remove(projectId, id) {
        return this.milestonesService.remove(projectId, id);
    }
};
exports.MilestonesController = MilestonesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List project milestones' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], MilestonesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a milestone' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, milestone_dto_1.CreateMilestoneDto]),
    __metadata("design:returntype", void 0)
], MilestonesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a milestone' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, milestone_dto_1.UpdateMilestoneDto]),
    __metadata("design:returntype", void 0)
], MilestonesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a milestone' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", void 0)
], MilestonesController.prototype, "remove", null);
exports.MilestonesController = MilestonesController = __decorate([
    (0, swagger_1.ApiTags)('Milestones'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, common_1.Controller)({ path: 'projects/:projectId/milestones', version: '1' }),
    __metadata("design:paramtypes", [milestones_service_1.MilestonesService])
], MilestonesController);
//# sourceMappingURL=milestones.controller.js.map