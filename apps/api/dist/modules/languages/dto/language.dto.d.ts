import { Direction } from '@prisma/client';
export declare class CreateLanguageDto {
    name: string;
    code: string;
    flagCode?: string;
    direction?: Direction;
    order?: number;
    isActive?: boolean;
}
declare const UpdateLanguageDto_base: any;
export declare class UpdateLanguageDto extends UpdateLanguageDto_base {
}
export {};
