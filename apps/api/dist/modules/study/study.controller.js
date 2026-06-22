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
exports.StudyController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const study_service_1 = require("./study.service");
const create_study_dto_1 = require("./dto/create-study.dto");
const update_section_dto_1 = require("./dto/update-section.dto");
const change_study_status_dto_1 = require("./dto/change-study-status.dto");
const study_filters_dto_1 = require("./dto/study-filters.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const ALLOWED_MIME = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'video/mp4',
];
const sectionFileStorage = (0, multer_1.diskStorage)({
    destination: (req, file, cb) => {
        const dir = process.env.UPLOAD_DIR || './uploads';
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${(0, path_1.extname)(file.originalname)}`);
    },
});
let StudyController = class StudyController {
    constructor(studyService) {
        this.studyService = studyService;
    }
    create(dto, user) {
        return this.studyService.createStudy(dto, user.referenceId);
    }
    findByProject(projectId) {
        return this.studyService.getStudyByProject(projectId);
    }
    findAll(filters, user) {
        return this.studyService.listStudies(filters, user);
    }
    findOne(id) {
        return this.studyService.getStudy(id);
    }
    uploadSectionFiles(sectionId, files) {
        return this.studyService.uploadSectionFiles(sectionId, files);
    }
    updateSection(sectionId, dto, user) {
        return this.studyService.updateSection(sectionId, dto, user.referenceId, user.role);
    }
    deleteSectionFile(fileId) {
        return this.studyService.deleteSectionFile(fileId);
    }
    changeStatus(id, dto, user) {
        return this.studyService.changeStatus(id, dto, user.referenceId, user.role);
    }
    remove(id) {
        return this.studyService.deleteStudy(id);
    }
};
exports.StudyController = StudyController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a study for a project (auto-populates sections from templates)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_study_dto_1.CreateStudyDto, Object]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('project/:projectId'),
    (0, roles_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get published study for a project (public)' }),
    __param(0, (0, common_1.Param)('projectId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "findByProject", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee, client_1.AdminRole.financial_officer),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'List studies with filters' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [study_filters_dto_1.StudyFiltersDto, Object]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Get study details by ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)('sections/:sectionId/files'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiOperation)({ summary: 'Upload files to a study section' }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 10, {
        storage: sectionFileStorage,
        fileFilter: (req, file, cb) => {
            if (ALLOWED_MIME.includes(file.mimetype))
                cb(null, true);
            else
                cb(new common_1.BadRequestException(`File type "${file.mimetype}" not allowed`), false);
        },
        limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
    })),
    __param(0, (0, common_1.Param)('sectionId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Array]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "uploadSectionFiles", null);
__decorate([
    (0, common_1.Patch)('sections/:sectionId'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a study section content/status/assignment' }),
    __param(0, (0, common_1.Param)('sectionId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_section_dto_1.UpdateSectionDto, Object]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "updateSection", null);
__decorate([
    (0, common_1.Delete)('sections/files/:fileId'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a section file' }),
    __param(0, (0, common_1.Param)('fileId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "deleteSectionFile", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator, client_1.AdminRole.employee),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Change study status (state machine)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, change_study_status_dto_1.ChangeStudyStatusDto, Object]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "changeStatus", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a draft study (admin only)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "remove", null);
exports.StudyController = StudyController = __decorate([
    (0, swagger_1.ApiTags)('Study'),
    (0, common_1.Controller)({ path: 'study', version: '1' }),
    __metadata("design:paramtypes", [study_service_1.StudyService])
], StudyController);
//# sourceMappingURL=study.controller.js.map