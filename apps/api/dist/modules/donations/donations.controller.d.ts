import { Response } from 'express';
import { DonationsService } from './donations.service';
import { CreateDonationDto, UpdateDonationStatusDto, DonationQueryDto } from './dto/donation.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
export declare class DonationsController {
    private donationsService;
    constructor(donationsService: DonationsService);
    findAll(query: DonationQueryDto, user: JwtPayload): Promise<{
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
    findByToken(token: string): Promise<any>;
    getQr(token: string): Promise<any>;
    downloadQr(token: string, res: Response): Promise<void>;
    create(dto: CreateDonationDto, user: JwtPayload): Promise<any>;
    updateStatus(id: number, dto: UpdateDonationStatusDto, user: JwtPayload): Promise<any>;
    cancel(id: number, user: JwtPayload): Promise<any>;
}
