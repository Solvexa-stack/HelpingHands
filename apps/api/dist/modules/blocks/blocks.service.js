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
exports.BlocksService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
let BlocksService = class BlocksService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query) {
        const { page = 1, limit = 15, category, lang, search, activeOnly = true } = query;
        const { skip, take } = (0, pagination_dto_1.paginate)(page, limit);
        const where = {};
        if (category)
            where.category = category;
        if (activeOnly)
            where.isActive = true;
        if (search) {
            where.translations = {
                some: {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { brief: { contains: search, mode: 'insensitive' } },
                    ],
                },
            };
        }
        const [data, total] = await Promise.all([
            this.prisma.block.findMany({
                where,
                skip,
                take,
                orderBy: [{ orderId: 'asc' }, { createdAt: 'desc' }],
                include: {
                    translations: lang
                        ? { where: { languageCode: lang } }
                        : true,
                    files: { where: { isActive: true }, orderBy: { orderId: 'asc' } },
                },
            }),
            this.prisma.block.count({ where }),
        ]);
        return (0, pagination_dto_1.paginatedResponse)(data, total, page, limit);
    }
    async findBySlug(slug) {
        const translation = await this.prisma.blockTranslation.findUnique({
            where: { slug },
            include: {
                block: {
                    include: {
                        translations: true,
                        files: { where: { isActive: true }, orderBy: { orderId: 'asc' } },
                    },
                },
            },
        });
        if (!translation)
            throw new common_1.NotFoundException(`Content with slug '${slug}' not found`);
        return translation.block;
    }
    async findById(id) {
        const block = await this.prisma.block.findUnique({
            where: { id },
            include: {
                translations: true,
                files: { where: { isActive: true }, orderBy: { orderId: 'asc' } },
                project: true,
            },
        });
        if (!block)
            throw new common_1.NotFoundException(`Block #${id} not found`);
        return block;
    }
    async create(dto) {
        const { translations, ...blockData } = dto;
        for (const t of translations) {
            const existing = await this.prisma.blockTranslation.findUnique({ where: { slug: t.slug } });
            if (existing)
                throw new common_1.ConflictException(`Slug '${t.slug}' already exists`);
        }
        return this.prisma.block.create({
            data: {
                ...blockData,
                translations: { create: translations },
            },
            include: { translations: true },
        });
    }
    async update(id, dto) {
        await this.findById(id);
        const { translations, ...blockData } = dto;
        if (translations?.length) {
            for (const t of translations) {
                const existing = await this.prisma.blockTranslation.findUnique({ where: { slug: t.slug } });
                if (existing && existing.blockId !== id)
                    throw new common_1.ConflictException(`Slug '${t.slug}' already exists`);
            }
            await this.prisma.blockTranslation.deleteMany({ where: { blockId: id } });
        }
        return this.prisma.block.update({
            where: { id },
            data: {
                ...blockData,
                ...(translations && { translations: { create: translations } }),
            },
            include: { translations: true },
        });
    }
    async remove(id) {
        await this.findById(id);
        await this.prisma.block.delete({ where: { id } });
    }
    async toggleActive(id) {
        const block = await this.findById(id);
        return this.prisma.block.update({
            where: { id },
            data: { isActive: !block.isActive },
        });
    }
    async findByCategory(category, lang, limit = 10) {
        return this.prisma.block.findMany({
            where: { category, isActive: true },
            take: limit,
            orderBy: [{ orderId: 'asc' }, { createdAt: 'desc' }],
            include: {
                translations: lang ? { where: { languageCode: lang } } : true,
                files: { where: { isActive: true, isCover: true }, take: 1 },
            },
        });
    }
};
exports.BlocksService = BlocksService;
exports.BlocksService = BlocksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BlocksService);
//# sourceMappingURL=blocks.service.js.map