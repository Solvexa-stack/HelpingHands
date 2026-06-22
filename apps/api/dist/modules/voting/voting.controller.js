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
exports.VotingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const voting_service_1 = require("./voting.service");
const cast_vote_dto_1 = require("./dto/cast-vote.dto");
const change_vote_dto_1 = require("./dto/change-vote.dto");
const vote_filters_dto_1 = require("./dto/vote-filters.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let VotingController = class VotingController {
    constructor(votingService) {
        this.votingService = votingService;
    }
    castVote(dto, userId) {
        return this.votingService.castVote(dto, userId);
    }
    changeVote(studyId, dto, userId) {
        return this.votingService.changeVote(studyId, userId, dto);
    }
    getResults(studyId, user) {
        return this.votingService.getResults(studyId, user?.sub);
    }
    getMyVotes(userId) {
        return this.votingService.getMyVotes(userId);
    }
    listVotes(studyId, filters) {
        return this.votingService.listVotes(studyId, filters);
    }
};
exports.VotingController = VotingController;
__decorate([
    (0, common_1.Post)('cast'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Cast a vote on a study (any authenticated user)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cast_vote_dto_1.CastVoteDto, Number]),
    __metadata("design:returntype", void 0)
], VotingController.prototype, "castVote", null);
__decorate([
    (0, common_1.Patch)(':studyId/change'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'Update your vote while voting is open' }),
    __param(0, (0, common_1.Param)('studyId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, change_vote_dto_1.ChangeVoteDto, Number]),
    __metadata("design:returntype", void 0)
], VotingController.prototype, "changeVote", null);
__decorate([
    (0, common_1.Get)(':studyId/results'),
    (0, roles_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get vote results for a study (public, anonymized)' }),
    __param(0, (0, common_1.Param)('studyId', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", void 0)
], VotingController.prototype, "getResults", null);
__decorate([
    (0, common_1.Get)('my-votes'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'List all votes cast by the current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], VotingController.prototype, "getMyVotes", null);
__decorate([
    (0, common_1.Get)(':studyId/votes'),
    (0, roles_decorator_1.Roles)(client_1.AdminRole.administrator),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, swagger_1.ApiOperation)({ summary: 'List all votes for a study with user details (admin audit)' }),
    __param(0, (0, common_1.Param)('studyId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, vote_filters_dto_1.VoteFiltersDto]),
    __metadata("design:returntype", void 0)
], VotingController.prototype, "listVotes", null);
exports.VotingController = VotingController = __decorate([
    (0, swagger_1.ApiTags)('Voting'),
    (0, common_1.Controller)({ path: 'voting', version: '1' }),
    __metadata("design:paramtypes", [voting_service_1.VotingService])
], VotingController);
//# sourceMappingURL=voting.controller.js.map