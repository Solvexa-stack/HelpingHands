import { StudyService } from './study.service';
import { CreateStudyDto } from './dto/create-study.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { ChangeStudyStatusDto } from './dto/change-study-status.dto';
import { StudyFiltersDto } from './dto/study-filters.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
export declare class StudyController {
    private studyService;
    constructor(studyService: StudyService);
    create(dto: CreateStudyDto, user: JwtPayload): Promise<any>;
    findByProject(projectId: number): Promise<any>;
    findAll(filters: StudyFiltersDto, user: JwtPayload): Promise<{
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
    findOne(id: number): Promise<any>;
    uploadSectionFiles(sectionId: number, files: Express.Multer.File[]): Promise<any>;
    updateSection(sectionId: number, dto: UpdateSectionDto, user: JwtPayload): Promise<any>;
    deleteSectionFile(fileId: number): Promise<void>;
    changeStatus(id: number, dto: ChangeStudyStatusDto, user: JwtPayload): Promise<any>;
    remove(id: number): Promise<void>;
}
