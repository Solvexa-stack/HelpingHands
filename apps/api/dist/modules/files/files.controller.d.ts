import { FileType } from '@prisma/client';
import { FilesService } from './files.service';
import { ConfigService } from '@nestjs/config';
export declare class FilesController {
    private filesService;
    private config;
    constructor(filesService: FilesService, config: ConfigService);
    upload(file: Express.Multer.File, referenceId: number, referenceType: string, fileType: FileType, isCover?: string, description?: string): Promise<any>;
    getFiles(referenceId: number, referenceType: string): Promise<any>;
    setCover(id: number): Promise<any>;
    remove(id: number): Promise<void>;
}
