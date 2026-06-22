import { PrismaService } from '../../prisma/prisma.service';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto';
export declare class LanguagesService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(activeOnly?: boolean): Promise<any>;
    findByCode(code: string): Promise<any>;
    create(dto: CreateLanguageDto): Promise<any>;
    update(code: string, dto: UpdateLanguageDto): Promise<any>;
    remove(code: string): Promise<void>;
    toggleActive(code: string): Promise<any>;
}
