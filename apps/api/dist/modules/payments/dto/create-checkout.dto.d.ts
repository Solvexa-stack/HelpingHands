import { PaymentProvider } from '@prisma/client';
export { PaymentProvider };
export declare class CreateCheckoutDto {
    projectId: number;
    amount: number;
    provider: PaymentProvider;
    currency?: string;
}
