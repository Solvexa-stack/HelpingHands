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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParticipantsService = exports.UpdateParticipantDto = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
class UpdateParticipantDto {
}
exports.UpdateParticipantDto = UpdateParticipantDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateParticipantDto.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateParticipantDto.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.Representation }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.Representation),
    __metadata("design:type", typeof (_a = typeof client_1.Representation !== "undefined" && client_1.Representation) === "function" ? _a : Object)
], UpdateParticipantDto.prototype, "representation", void 0);
let ParticipantsService = class ParticipantsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query) {
        const { page = 1, limit = 15, search } = query;
        const { skip, take } = (0, pagination_dto_1.paginate)(page, limit);
        const where = {};
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
            ];
        }
        const [data, total] = await Promise.all([
            this.prisma.participant.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } },
                    _count: { select: { donations: true } },
                },
            }),
            this.prisma.participant.count({ where }),
        ]);
        return (0, pagination_dto_1.paginatedResponse)(data, total, page, limit);
    }
    async findById(id) {
        const participant = await this.prisma.participant.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, email: true, isActive: true, avatar: true, joiningDate: true } },
                donations: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: {
                        project: {
                            include: { block: { include: { translations: true } } },
                        },
                    },
                },
                _count: { select: { donations: true } },
            },
        });
        if (!participant)
            throw new common_1.NotFoundException(`Participant #${id} not found`);
        return participant;
    }
    async update(participantId, dto, requestingUserId, role) {
        const participant = await this.prisma.participant.findUnique({
            where: { id: participantId },
            include: { user: true },
        });
        if (!participant)
            throw new common_1.NotFoundException(`Participant #${participantId} not found`);
        if (role === 'participant' && participant.user?.id !== requestingUserId) {
            throw new common_1.ForbiddenException('You can only update your own profile');
        }
        return this.prisma.participant.update({ where: { id: participantId }, data: dto });
    }
    async toggleActive(id) {
        const participant = await this.prisma.participant.findUnique({
            where: { id },
            include: { user: true },
        });
        if (!participant)
            throw new common_1.NotFoundException(`Participant #${id} not found`);
        if (!participant.user)
            throw new common_1.NotFoundException('User account not found');
        return this.prisma.user.update({
            where: { id: participant.user.id },
            data: { isActive: !participant.user.isActive },
            select: { id: true, email: true, isActive: true },
        });
    }
    async updateAvatar(participantId, avatarUrl) {
        return this.prisma.user.updateMany({
            where: { referenceId: participantId, referenceType: 'participant' },
            data: { avatar: avatarUrl },
        });
    }
};
exports.ParticipantsService = ParticipantsService;
exports.ParticipantsService = ParticipantsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ParticipantsService);
//# sourceMappingURL=participants.service.js.map