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
exports.LanguagesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const languages_service_1 = require("./languages.service");
const language_dto_1 = require("./dto/language.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let LanguagesController = class LanguagesController {
    constructor(languagesService) {
        this.languagesService = languagesService;
    }
    findAll(all) {
        return this.languagesService.findAll(all !== 'true');
    }
    findOne(code) {
        return this.languagesService.findByCode(code);
    }
    create(dto) {
        return this.languagesService.create(dto);
    }
    update(code, dto) {
        return this.languagesService.update(code, dto);
    }
    toggleActive(code) {
        return this.languagesService.toggleActive(code);
    }
    remove(code) {
        return this.languagesService.remove(code);
    }
};
exports.LanguagesController = LanguagesController;
__decorate([
    (0, roles_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all active languages' }),
    __param(0, (0, common_1.Query)('all')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "findAll", null);
__decorate([
    (0, roles_decorator_1.Public)(),
    (0, common_1.Get)(':code'),
    (0, swagger_1.ApiOperation)({ summary: 'Get language by code' }),
    __param(0, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new language (admin only)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [language_dto_1.CreateLanguageDto]),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':code'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Update language' }),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, language_dto_1.UpdateLanguageDto]),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':code/toggle'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Toggle language active status' }),
    __param(0, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "toggleActive", null);
__decorate([
    (0, common_1.Delete)(':code'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a language' }),
    __param(0, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LanguagesController.prototype, "remove", null);
exports.LanguagesController = LanguagesController = __decorate([
    (0, swagger_1.ApiTags)('Languages'),
    (0, common_1.Controller)({ path: 'languages', version: '1' }),
    __metadata("design:paramtypes", [languages_service_1.LanguagesService])
], LanguagesController);
//# sourceMappingURL=languages.controller.js.map