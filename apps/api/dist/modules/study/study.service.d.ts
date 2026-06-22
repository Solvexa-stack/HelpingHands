import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChangeStudyStatusDto } from './dto/change-study-status.dto';
import { CreateStudyDto } from './dto/create-study.dto';
import { StudyFiltersDto } from './dto/study-filters.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
export declare class StudyService {
    private prisma;
    private config;
    private notificationsService;
    constructor(prisma: PrismaService, config: ConfigService, notificationsService: NotificationsService);
    createStudy(dto: CreateStudyDto, createdById: number): Promise<any>;
    getStudy(studyId: number): Promise<any>;
    getStudyByProject(projectId: number): Promise<any>;
    listStudies(filters: StudyFiltersDto, user: JwtPayload): Promise<{
        data: unknown[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
    }>;
    updateSection(sectionId: number, dto: UpdateSectionDto, requestingAdminId: number, requestingRole: string): Promise<any>;
    uploadSectionFiles(sectionId: number, files: Express.Multer.File[]): Promise<any>;
    deleteSectionFile(fileId: number): Promise<void>;
    changeStatus(studyId: number, dto: ChangeStudyStatusDto, adminId: number, adminRole: string): Promise<any>;
    private fireStatusNotification;
    deleteStudy(studyId: number): Promise<void>;
    private buildVotesSummary;
    private resolveFileType;
}
