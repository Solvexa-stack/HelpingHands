import { BlockCategory } from '@prisma/client';
export declare class BlockTranslationDto {
    languageCode: string;
    name: string;
    slug: string;
    brief: string;
    description: string;
}
export declare class CreateBlockDto {
    category: BlockCategory;
    imageUrl?: string;
    fileUrl?: string;
    classification?: string;
    orderId?: number;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    translations: BlockTranslationDto[];
}
declare const UpdateBlockDto_base: any;
export declare class UpdateBlockDto extends UpdateBlockDto_base {
}
export declare class BlockQueryDto {
    category?: BlockCategory;
    lang?: string;
    search?: string;
    page?: number;
    limit?: number;
    activeOnly?: boolean;
}
export {};
