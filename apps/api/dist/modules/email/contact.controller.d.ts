import { EmailService } from './email.service';
declare class ContactDto {
    name: string;
    email: string;
    subject: string;
    message: string;
}
export declare class ContactController {
    private emailService;
    constructor(emailService: EmailService);
    submit(dto: ContactDto): Promise<{
        success: boolean;
        message: string;
    }>;
}
export {};
