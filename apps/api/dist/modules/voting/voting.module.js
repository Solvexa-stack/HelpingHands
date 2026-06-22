"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VotingModule = void 0;
const common_1 = require("@nestjs/common");
const voting_controller_1 = require("./voting.controller");
const voting_service_1 = require("./voting.service");
const voting_scheduler_1 = require("./voting.scheduler");
const study_module_1 = require("../study/study.module");
const notifications_module_1 = require("../notifications/notifications.module");
let VotingModule = class VotingModule {
};
exports.VotingModule = VotingModule;
exports.VotingModule = VotingModule = __decorate([
    (0, common_1.Module)({
        imports: [study_module_1.StudyModule, notifications_module_1.NotificationsModule],
        controllers: [voting_controller_1.VotingController],
        providers: [voting_service_1.VotingService, voting_scheduler_1.VotingScheduler],
        exports: [voting_service_1.VotingService],
    })
], VotingModule);
//# sourceMappingURL=voting.module.js.map