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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguagesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let LanguagesService = class LanguagesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(activeOnly = false) {
        return this.prisma.language.findMany({
            where: activeOnly ? { isActive: true } : undefined,
            orderBy: { order: 'asc' },
        });
    }
    async findByCode(code) {
        const lang = await this.prisma.language.findUnique({ where: { code } });
        if (!lang)
            throw new common_1.NotFoundException(`Language '${code}' not found`);
        return lang;
    }
    async create(dto) {
        const existing = await this.prisma.language.findUnique({ where: { code: dto.code } });
        if (existing)
            throw new common_1.ConflictException(`Language code '${dto.code}' already exists`);
        return this.prisma.language.create({ data: dto });
    }
    async update(code, dto) {
        await this.findByCode(code);
        return this.prisma.language.update({ where: { code }, data: dto });
    }
    async remove(code) {
        await this.findByCode(code);
        await this.prisma.language.delete({ where: { code } });
    }
    async toggleActive(code) {
        const lang = await this.findByCode(code);
        return this.prisma.language.update({
            where: { code },
            data: { isActive: !lang.isActive },
        });
    }
};
exports.LanguagesService = LanguagesService;
exports.LanguagesService = LanguagesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LanguagesService);
//# sourceMappingURL=languages.service.js.map