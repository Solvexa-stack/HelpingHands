import { LanguagesService } from './languages.service';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto';
export declare class LanguagesController {
    private languagesService;
    constructor(languagesService: LanguagesService);
    findAll(all?: string): Promise<any>;
    findOne(code: string): Promise<any>;
    create(dto: CreateLanguageDto): Promise<any>;
    update(code: string, dto: UpdateLanguageDto): Promise<any>;
    toggleActive(code: string): Promise<any>;
    remove(code: string): Promise<void>;
}
