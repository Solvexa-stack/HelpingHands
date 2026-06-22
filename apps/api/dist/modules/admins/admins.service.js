"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const pagination_dto_1 = require("../../common/dto/pagination.dto");
let AdminsService = class AdminsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query, role) {
        const { page = 1, limit = 15, search } = query;
        const { skip, take } = (0, pagination_dto_1.paginate)(page, limit);
        const where = {};
        if (role)
            where.role = role;
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
            ];
        }
        const [data, total] = await Promise.all([
            this.prisma.admin.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } } },
            }),
            this.prisma.admin.count({ where }),
        ]);
        return (0, pagination_dto_1.paginatedResponse)(data, total, page, limit);
    }
    async findById(id) {
        const admin = await this.prisma.admin.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } },
                assignedProjects: {
                    include: { block: { include: { translations: true } } },
                },
            },
        });
        if (!admin)
            throw new common_1.NotFoundException(`Admin #${id} not found`);
        return admin;
    }
    async create(dto, creatorRole) {
        if (creatorRole !== client_1.AdminRole.administrator) {
            throw new common_1.ForbiddenException('Only administrators can create admin accounts');
        }
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing)
            throw new common_1.ConflictException('Email already registered');
        const hashedPassword = await bcrypt.hash(dto.password, 12);
        const admin = await this.prisma.admin.create({
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                role: dto.role,
            },
        });
        const user = await this.prisma.user.create({
            data: {
                referenceId: admin.id,
                referenceType: 'admin',
                email: dto.email,
                password: hashedPassword,
                isActive: true,
                joiningDate: new Date(),
            },
        });
        return { ...admin, user: { id: user.id, email: user.email, isActive: user.isActive } };
    }
    async update(id, dto, updaterRole) {
        const admin = await this.findById(id);
        if (admin.role === client_1.AdminRole.administrator && updaterRole !== client_1.AdminRole.administrator) {
            throw new common_1.ForbiddenException('Cannot modify administrator accounts');
        }
        const { password, email, ...adminData } = dto;
        if (email || password) {
            const updates = {};
            if (email) {
                const existing = await this.prisma.user.findFirst({
                    where: { email, NOT: { referenceId: id, referenceType: 'admin' } },
                });
                if (existing)
                    throw new common_1.ConflictException('Email already in use');
                updates.email = email;
            }
            if (password)
                updates.password = await bcrypt.hash(password, 12);
            await this.prisma.user.updateMany({
                where: { referenceId: id, referenceType: 'admin' },
                data: updates,
            });
        }
        return this.prisma.admin.update({ where: { id }, data: adminData });
    }
    async toggleActive(id) {
        const admin = await this.findById(id);
        if (admin.role === client_1.AdminRole.administrator) {
            throw new common_1.ForbiddenException('Cannot deactivate administrator accounts');
        }
        const user = await this.prisma.user.findFirst({
            where: { referenceId: id, referenceType: 'admin' },
        });
        if (!user)
            throw new common_1.NotFoundException('User account not found');
        return this.prisma.user.update({
            where: { id: user.id },
            data: { isActive: !user.isActive },
            select: { id: true, email: true, isActive: true },
        });
    }
    async findFinancialOfficers() {
        return this.prisma.admin.findMany({
            where: { role: client_1.AdminRole.financial_officer },
            include: {
                user: { select: { id: true, email: true, isActive: true } },
                assignedProjects: { select: { id: true } },
            },
        });
    }
};
exports.AdminsService = AdminsService;
exports.AdminsService = AdminsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminsService);
//# sourceMappingURL=admins.service.js.map