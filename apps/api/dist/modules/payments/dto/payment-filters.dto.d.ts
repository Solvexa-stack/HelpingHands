import { PaymentProvider, PaymentStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';
export declare class PaymentFiltersDto extends PaginationDto {
    status?: PaymentStatus;
    provider?: PaymentProvider;
    projectId?: number;
    participantId?: number;
}
