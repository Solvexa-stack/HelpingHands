import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { FileType } from '@prisma/client';
export declare class FilesService {
    private prisma;
    private config;
    constructor(prisma: PrismaService, config: ConfigService);
    uploadFile(file: Express.Multer.File, referenceId: number, referenceType: string, fileType: FileType, isCover?: boolean, description?: string): Promise<any>;
    getFiles(referenceId: number, referenceType: string): Promise<any>;
    deleteFile(id: number): Promise<void>;
    setCover(id: number): Promise<any>;
    reorder(ids: number[]): Promise<any>;
    getMulterConfig(): {
        uploadDir: any;
        maxSize: any;
    };
}
