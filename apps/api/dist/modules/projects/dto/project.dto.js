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
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectQueryDto = exports.UpdateProjectDto = exports.CreateProjectDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const client_1 = require("@prisma/client");
class CreateProjectDto {
}
exports.CreateProjectDto = CreateProjectDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Block ID for project content' }),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateProjectDto.prototype, "blockId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Nairobi, Kenya' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProjectDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateProjectDto.prototype, "dateOfCompletion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 50000 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateProjectDto.prototype, "value", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.ProjectCategory }),
    (0, class_validator_1.IsEnum)(client_1.ProjectCategory),
    __metadata("design:type", typeof (_a = typeof client_1.ProjectCategory !== "undefined" && client_1.ProjectCategory) === "function" ? _a : Object)
], CreateProjectDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateProjectDto.prototype, "expectedStartDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Financial officer admin ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateProjectDto.prototype, "financialOfficerId", void 0);
class UpdateProjectDto extends (0, swagger_1.PartialType)(CreateProjectDto) {
}
exports.UpdateProjectDto = UpdateProjectDto;
class ProjectQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 15;
        this.sortBy = 'createdAt';
        this.sortOrder = 'desc';
    }
}
exports.ProjectQueryDto = ProjectQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.ProjectCategory }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.ProjectCategory),
    __metadata("design:type", typeof (_b = typeof client_1.ProjectCategory !== "undefined" && client_1.ProjectCategory) === "function" ? _b : Object)
], ProjectQueryDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ProjectQueryDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ProjectQueryDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter completed projects' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ProjectQueryDto.prototype, "isCompleted", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ProjectQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 15 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ProjectQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ProjectQueryDto.prototype, "lang", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['value', 'progression', 'createdAt'], default: 'createdAt' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ProjectQueryDto.prototype, "sortBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['asc', 'desc'], default: 'desc' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ProjectQueryDto.prototype, "sortOrder", void 0);
//# sourceMappingURL=project.dto.js.map