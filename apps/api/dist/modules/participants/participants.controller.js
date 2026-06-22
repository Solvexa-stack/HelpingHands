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
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParticipantsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const client_1 = require("@prisma/client");
const participants_service_1 = require("./participants.service");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
let ParticipantsController = class ParticipantsController {
    constructor(participantsService) {
        this.participantsService = participantsService;
    }
    findAll(query) {
        return this.participantsService.findAll(query);
    }
    findOne(id) {
        return this.participantsService.findById(id);
    }
    update(id, dto, user) {
        return this.participantsService.update(id, dto, user.sub, user.role);
    }
    toggleActive(id) {
        return this.participantsService.toggleActive(id);
    }
    async updateAvatar(id, file, user) {
        if (user.role === 'participant' && user.referenceId !== id) {
            throw new common_1.BadRequestException('You can only update your own avatar');
        }
        const appUrl = process.env.APP_URL || 'http://localhost:4000';
        const avatarUrl = `${appUrl}/uploads/${file.filename}`;
        return this.participantsService.updateAvatar(id, avatarUrl);
    }
};
exports.ParticipantsController = ParticipantsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiOperation)({ summary: 'List all participants' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pagination_dto_1.PaginationDto]),
    __metadata("design:returntype", void 0)
], ParticipantsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee, 'participant'),
    (0, swagger_1.ApiOperation)({ summary: 'Get participant by ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], ParticipantsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, 'participant'),
    (0, swagger_1.ApiOperation)({ summary: 'Update participant profile' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, participants_service_1.UpdateParticipantDto, Object]),
    __metadata("design:returntype", void 0)
], ParticipantsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/toggle-active'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator),
    (0, swagger_1.ApiOperation)({ summary: 'Toggle participant active status' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], ParticipantsController.prototype, "toggleActive", null);
__decorate([
    (0, common_1.Patch)(':id/avatar'),
    (0, roles_decorator_1.Roles)('participant'),
    (0, swagger_1.ApiOperation)({ summary: 'Update participant avatar' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('avatar', {
        storage: (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                const dir = process.env.UPLOAD_DIR || './uploads';
                if (!(0, fs_1.existsSync)(dir))
                    (0, fs_1.mkdirSync)(dir, { recursive: true });
                cb(null, dir);
            },
            filename: (req, file, cb) => {
                cb(null, `avatar-${Date.now()}${(0, path_1.extname)(file.originalname)}`);
            },
        }),
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/'))
                cb(null, true);
            else
                cb(new common_1.BadRequestException('Only images allowed'), false);
        },
        limits: { fileSize: 2 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, typeof (_b = typeof Express !== "undefined" && (_a = Express.Multer) !== void 0 && _a.File) === "function" ? _b : Object, Object]),
    __metadata("design:returntype", Promise)
], ParticipantsController.prototype, "updateAvatar", null);
exports.ParticipantsController = ParticipantsController = __decorate([
    (0, swagger_1.ApiTags)('Participants'),
    (0, common_1.Controller)({ path: 'participants', version: '1' }),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    __metadata("design:paramtypes", [participants_service_1.ParticipantsService])
], ParticipantsController);
//# sourceMappingURL=participants.controller.js.map