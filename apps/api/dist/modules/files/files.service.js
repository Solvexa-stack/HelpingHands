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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let FilesService = class FilesService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    async uploadFile(file, referenceId, referenceType, fileType, isCover = false, description) {
        const appUrl = this.config.get('app.url', 'http://localhost:4000');
        const url = `${appUrl}/uploads/${file.filename}`;
        if (isCover) {
            await this.prisma.file.updateMany({
                where: { referenceId, referenceType, isCover: true },
                data: { isCover: false },
            });
        }
        return this.prisma.file.create({
            data: {
                referenceId,
                referenceType,
                name: file.originalname,
                url,
                fileType,
                isCover,
                description,
            },
        });
    }
    async getFiles(referenceId, referenceType) {
        return this.prisma.file.findMany({
            where: { referenceId, referenceType, isActive: true },
            orderBy: [{ isCover: 'desc' }, { orderId: 'asc' }],
        });
    }
    async deleteFile(id) {
        const file = await this.prisma.file.findUnique({ where: { id } });
        if (!file)
            throw new common_1.NotFoundException(`File #${id} not found`);
        try {
            const uploadDir = this.config.get('app.uploadDir', './uploads');
            const filename = file.url.split('/uploads/').pop();
            if (filename) {
                const filePath = path.join(process.cwd(), uploadDir.replace('./', ''), filename);
                if (fs.existsSync(filePath))
                    fs.unlinkSync(filePath);
            }
        }
        catch (e) {
        }
        await this.prisma.file.delete({ where: { id } });
    }
    async setCover(id) {
        const file = await this.prisma.file.findUnique({ where: { id } });
        if (!file)
            throw new common_1.NotFoundException(`File #${id} not found`);
        await this.prisma.file.updateMany({
            where: { referenceId: file.referenceId, referenceType: file.referenceType, isCover: true },
            data: { isCover: false },
        });
        return this.prisma.file.update({ where: { id }, data: { isCover: true } });
    }
    async reorder(ids) {
        const updates = ids.map((id, index) => this.prisma.file.update({ where: { id }, data: { orderId: index } }));
        return Promise.all(updates);
    }
    getMulterConfig() {
        const uploadDir = this.config.get('app.uploadDir', './uploads');
        const maxSize = this.config.get('app.maxFileSize', 10485760);
        return { uploadDir, maxSize };
    }
};
exports.FilesService = FilesService;
exports.FilesService = FilesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], FilesService);
//# sourceMappingURL=files.service.js.map