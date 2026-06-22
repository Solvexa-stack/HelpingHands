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
var VotingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VotingService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
let VotingService = VotingService_1 = class VotingService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(VotingService_1.name);
    }
    async castVote(dto, userId) {
        const study = await this.prisma.projectStudy.findUnique({ where: { id: dto.studyId } });
        if (!study)
            throw new common_1.NotFoundException(`Study #${dto.studyId} not found`);
        if (study.status !== client_1.StudyStatus.voting_open) {
            throw new common_1.BadRequestException('This study is not currently accepting votes');
        }
        if (study.votingEndsAt && study.votingEndsAt < new Date()) {
            throw new common_1.BadRequestException('Voting period has ended');
        }
        const existing = await this.prisma.studyVote.findUnique({
            where: { studyId_userId: { studyId: dto.studyId, userId } },
        });
        if (existing)
            throw new common_1.ConflictException('You have already voted on this study');
        return this.prisma.studyVote.create({
            data: {
                studyId: dto.studyId,
                userId,
                choice: dto.choice,
                comment: dto.comment,
            },
            include: {
                user: { select: { id: true, email: true } },
            },
        });
    }
    async changeVote(studyId, userId, dto) {
        const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
        if (!study)
            throw new common_1.NotFoundException(`Study #${studyId} not found`);
        if (study.status !== client_1.StudyStatus.voting_open) {
            throw new common_1.BadRequestException('Voting is no longer open for this study');
        }
        if (study.votingEndsAt && study.votingEndsAt < new Date()) {
            throw new common_1.BadRequestException('Voting period has ended');
        }
        const existing = await this.prisma.studyVote.findUnique({
            where: { studyId_userId: { studyId, userId } },
        });
        if (!existing)
            throw new common_1.NotFoundException('You have not voted on this study yet');
        return this.prisma.studyVote.update({
            where: { studyId_userId: { studyId, userId } },
            data: { choice: dto.choice, comment: dto.comment ?? null },
            include: {
                user: { select: { id: true, email: true } },
            },
        });
    }
    async getResults(studyId, userId) {
        const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
        if (!study)
            throw new common_1.NotFoundException(`Study #${studyId} not found`);
        const groups = await this.prisma.studyVote.groupBy({
            by: ['choice'],
            where: { studyId },
            _count: { choice: true },
        });
        const total = groups.reduce((sum, g) => sum + g._count.choice, 0);
        const countOf = (c) => groups.find((g) => g.choice === c)?._count.choice ?? 0;
        const pct = (n) => total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
        const forCount = countOf(client_1.VoteChoice.for);
        const againstCount = countOf(client_1.VoteChoice.against);
        const abstainCount = countOf(client_1.VoteChoice.abstain);
        let myVote = null;
        if (userId) {
            const vote = await this.prisma.studyVote.findUnique({
                where: { studyId_userId: { studyId, userId } },
                select: { choice: true },
            });
            myVote = vote?.choice ?? null;
        }
        const recentComments = await this.prisma.studyVote.findMany({
            where: { studyId, comment: { not: null } },
            select: { choice: true, comment: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });
        return {
            studyId,
            status: study.status,
            votingEndsAt: study.votingEndsAt,
            total,
            for: { count: forCount, percentage: pct(forCount) },
            against: { count: againstCount, percentage: pct(againstCount) },
            abstain: { count: abstainCount, percentage: pct(abstainCount) },
            myVote,
            recentComments,
        };
    }
    async listVotes(studyId, filters) {
        const study = await this.prisma.projectStudy.findUnique({ where: { id: studyId } });
        if (!study)
            throw new common_1.NotFoundException(`Study #${studyId} not found`);
        const { choice, page = 1, limit = 50 } = filters;
        const { skip, take } = (0, pagination_dto_1.paginate)(page, limit);
        const where = { studyId };
        if (choice)
            where.choice = choice;
        const [data, total] = await Promise.all([
            this.prisma.studyVote.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            admin: { select: { firstName: true, lastName: true, role: true } },
                            participant: { select: { firstName: true, lastName: true } },
                        },
                    },
                },
            }),
            this.prisma.studyVote.count({ where }),
        ]);
        return (0, pagination_dto_1.paginatedResponse)(data, total, page, limit);
    }
    async getMyVotes(userId) {
        const votes = await this.prisma.studyVote.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                study: {
                    select: {
                        id: true,
                        status: true,
                        project: {
                            select: {
                                id: true,
                                block: {
                                    select: {
                                        translations: { select: { languageCode: true, name: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        return votes;
    }
    async autoCloseExpiredVotings() {
        const expired = await this.prisma.projectStudy.findMany({
            where: {
                status: client_1.StudyStatus.voting_open,
                votingEndsAt: { lt: new Date() },
            },
            select: { id: true, projectId: true },
        });
        if (expired.length === 0)
            return { closed: 0 };
        const studyIds = expired.map((s) => s.id);
        const projectIds = expired.map((s) => s.projectId);
        await this.prisma.$transaction([
            this.prisma.projectStudy.updateMany({
                where: { id: { in: studyIds } },
                data: { status: client_1.StudyStatus.voting_closed },
            }),
            this.prisma.project.updateMany({
                where: { id: { in: projectIds } },
                data: { studyStatus: client_1.StudyStatus.voting_closed },
            }),
        ]);
        this.logger.log(`Auto-closed ${expired.length} expired voting(s): ids=${studyIds.join(',')}`);
        return { closed: expired.length };
    }
};
exports.VotingService = VotingService;
exports.VotingService = VotingService = VotingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], VotingService);
//# sourceMappingURL=voting.service.js.map