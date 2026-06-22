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
exports.BlocksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const blocks_service_1 = require("./blocks.service");
const block_dto_1 = require("./dto/block.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let BlocksController = class BlocksController {
    constructor(blocksService) {
        this.blocksService = blocksService;
    }
    findAll(query) {
        return this.blocksService.findAll(query);
    }
    findOne(id) {
        return this.blocksService.findById(id);
    }
    findBySlug(slug) {
        return this.blocksService.findBySlug(slug);
    }
    create(dto) {
        return this.blocksService.create(dto);
    }
    update(id, dto) {
        return this.blocksService.update(id, dto);
    }
    toggleActive(id) {
        return this.blocksService.toggleActive(id);
    }
    remove(id) {
        return this.blocksService.remove(id);
    }
};
exports.BlocksController = BlocksController;
__decorate([
    (0, roles_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List content blocks with filtering' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [block_dto_1.BlockQueryDto]),
    __metadata("design:returntype", void 0)
], BlocksController.prototype, "findAll", null);
__decorate([
    (0, roles_decorator_1.Public)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get block by ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], BlocksController.prototype, "findOne", null);
__decorate([
    (0, roles_decorator_1.Public)(),
    (0, common_1.Get)('slug/:slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Get block by slug' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BlocksController.prototype, "findBySlug", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Create content block' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [block_dto_1.CreateBlockDto]),
    __metadata("design:returntype", void 0)
], BlocksController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Update content block' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, block_dto_1.UpdateBlockDto]),
    __metadata("design:returntype", void 0)
], BlocksController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/toggle'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Toggle block active status' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], BlocksController.prototype, "toggleActive", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete content block' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], BlocksController.prototype, "remove", null);
exports.BlocksController = BlocksController = __decorate([
    (0, swagger_1.ApiTags)('Blocks'),
    (0, common_1.Controller)({ path: 'blocks', version: '1' }),
    __metadata("design:paramtypes", [blocks_service_1.BlocksService])
], BlocksController);
//# sourceMappingURL=blocks.controller.js.map