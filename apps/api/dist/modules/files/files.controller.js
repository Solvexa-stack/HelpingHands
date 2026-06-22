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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const client_1 = require("@prisma/client");
const files_service_1 = require("./files.service");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const config_1 = require("@nestjs/config");
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4'];
let FilesController = class FilesController {
    constructor(filesService, config) {
        this.filesService = filesService;
        this.config = config;
    }
    async upload(file, referenceId, referenceType, fileType, isCover, description) {
        return this.filesService.uploadFile(file, referenceId, referenceType, fileType, isCover === 'true', description);
    }
    getFiles(referenceId, referenceType) {
        return this.filesService.getFiles(referenceId, referenceType);
    }
    setCover(id) {
        return this.filesService.setCover(id);
    }
    remove(id) {
        return this.filesService.deleteFile(id);
    }
};
exports.FilesController = FilesController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Upload a file' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                referenceId: { type: 'number' },
                referenceType: { type: 'string' },
                fileType: { type: 'string', enum: ['image', 'video', 'pdf'] },
                isCover: { type: 'boolean' },
                description: { type: 'string' },
            },
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                const dir = process.env.UPLOAD_DIR || './uploads';
                if (!(0, fs_1.existsSync)(dir))
                    (0, fs_1.mkdirSync)(dir, { recursive: true });
                cb(null, dir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
                cb(null, `${uniqueSuffix}${(0, path_1.extname)(file.originalname)}`);
            },
        }),
        fileFilter: (req, file, cb) => {
            if (ALLOWED_MIME.includes(file.mimetype))
                cb(null, true);
            else
                cb(new common_1.BadRequestException(`File type ${file.mimetype} not allowed`), false);
        },
        limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)('referenceId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)('referenceType')),
    __param(3, (0, common_1.Body)('fileType')),
    __param(4, (0, common_1.Body)('isCover')),
    __param(5, (0, common_1.Body)('description')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof Express !== "undefined" && (_b = Express.Multer) !== void 0 && _b.File) === "function" ? _c : Object, Number, String, typeof (_d = typeof client_1.FileType !== "undefined" && client_1.FileType) === "function" ? _d : Object, String, String]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'List files for a reference' }),
    __param(0, (0, common_1.Query)('referenceId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('referenceType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "getFiles", null);
__decorate([
    (0, common_1.Patch)(':id/cover'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Set file as cover' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "setCover", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a file' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "remove", null);
exports.FilesController = FilesController = __decorate([
    (0, swagger_1.ApiTags)('Files'),
    (0, common_1.Controller)({ path: 'files', version: '1' }),
    __metadata("design:paramtypes", [files_service_1.FilesService, typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], FilesController);
//# sourceMappingURL=files.controller.js.map