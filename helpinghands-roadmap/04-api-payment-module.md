# Step 04 — API: Payment Module (Stripe + PayPal)

## Context

You are working on `apps/api/src/modules/payments/`.
This module adds online donation via Stripe and PayPal alongside the existing QR/cash flow.
A donation can only be made online if the project's study is approved (studyStatus = approved).

## Install required packages

```bash
pnpm --filter @helping-hands/api add stripe @paypal/checkout-server-sdk
```

## Module structure

```
apps/api/src/modules/payments/
├── payments.module.ts
├── payments.controller.ts
├── payments.service.ts
├── stripe.service.ts
├── paypal.service.ts
├── webhooks.controller.ts     ← separate controller, no global auth
└── dto/
    ├── create-checkout.dto.ts
    └── payment-filters.dto.ts
```

---

## New environment variables to add to `.env.example`

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox    # sandbox | live

# Frontend URLs (used for redirect after payment)
PAYMENT_SUCCESS_URL=http://localhost:3000/en/donations/success
PAYMENT_CANCEL_URL=http://localhost:3000/en/donations/cancel
```

Add all to `apps/api/src/config/` configuration mapping.

---

## DTOs

### `create-checkout.dto.ts`
```typescript
export class CreateCheckoutDto {
  @ApiProperty() @IsInt() @Min(1) projectId: number
  @ApiProperty() @IsNumber() @Min(1) amount: number
  @ApiProperty({ enum: PaymentProvider }) @IsEnum(PaymentProvider) provider: PaymentProvider
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string // default USD
}
```

---

## StripeService: `stripe.service.ts`

```typescript
@Injectable()
export class StripeService {
  private stripe: Stripe

  constructor(private config: ConfigService) {
    this.stripe = new Stripe(config.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-04-10' })
  }

  async createCheckoutSession(params: {
    projectId: number
    projectName: string
    amount: number        // in cents
    currency: string
    successUrl: string
    cancelUrl: string
    metadata: Record<string, string>
  }): Promise<Stripe.Checkout.Session>

  async constructWebhookEvent(payload: Buffer, signature: string): Promise<Stripe.Event>

  async retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session>
}
```

## PayPalService: `paypal.service.ts`

```typescript
@Injectable()
export class PayPalService {
  async createOrder(params: {
    projectId: number
    amount: number
    currency: string
    description: string
  }): Promise<{ id: string, approvalUrl: string }>

  async captureOrder(orderId: string): Promise<{ status: string, paymentId: string }>

  async verifyWebhook(headers: Record<string, string>, body: string): Promise<boolean>
}
```

---

## PaymentsService: `payments.service.ts`

### `createCheckout(dto, participantId)`
1. Verify project exists and `project.studyStatus === 'approved'` — throw `ForbiddenException` if not
2. Create a pending `OnlineDonation` record
3. Call `StripeService.createCheckoutSession` or `PayPalService.createOrder`
4. Save `providerSessionId` to the `OnlineDonation`
5. Return `{ checkoutUrl, donationId }`

### `handleStripeWebhook(payload, signature)`
Parse the Stripe event. Handle:
- `checkout.session.completed` → mark donation `completed`, update `project.progression`
- `checkout.session.expired` → mark donation `failed`
- Always verify signature before processing

### `handlePayPalWebhook(headers, body)`
Verify webhook authenticity, handle:
- `PAYMENT.CAPTURE.COMPLETED` → mark donation `completed`, update `project.progression`
- `PAYMENT.CAPTURE.DENIED` → mark donation `failed`

### `getDonationStatus(donationId, userId)`
Return current status of an online donation. User can only see their own.

### `listOnlineDonations(filters)`
Admin/employee: all. Participant: own only.

### `updateProjectProgressionOnline(projectId)`
Reuse/extend the existing progression calculation logic from donations module. Sum both `ProjectDonation` (approved) and `OnlineDonation` (completed) amounts.

---

## WebhooksController: `webhooks.controller.ts`

**IMPORTANT**: This controller must be outside the global `JwtAuthGuard`.
Use `@Public()` on all webhook endpoints.
Use raw body parsing (not JSON) for Stripe signature verification.

```typescript
@Controller('webhooks')
export class WebhooksController {

  @Post('stripe')
  @Public()
  @Header('Content-Type', 'application/json')
  handleStripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string
  )

  @Post('paypal')
  @Public()
  handlePayPal(
    @Req() req: Request,
    @Headers() headers: Record<string, string>
  )
}
```

Configure raw body in `main.ts`:
```typescript
const app = await NestFactory.create(AppModule, { rawBody: true })
```

---

## PaymentsController: `payments.controller.ts`

```typescript
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {

  @Post('checkout')
  // Participant only
  @Roles('participant')
  createCheckout(@Body() dto: CreateCheckoutDto, @CurrentUser('referenceId') participantId: number)

  @Get('donations/:id/status')
  // Participant sees own. Admin sees all.
  getDonationStatus(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload)

  @Get('donations')
  @Roles('administrator', 'employee')
  listDonations(@Query() filters: PaymentFiltersDto)
}
```

---

## Security checklist

- [ ] Stripe webhook: always verify signature with `stripe.webhooks.constructEvent()`
- [ ] PayPal webhook: always call PayPal verify API before processing
- [ ] Amount in checkout: use server-side value from DB, NEVER trust client-sent amount
- [ ] Idempotency: check if `providerSessionId` already exists before creating new donation
- [ ] Log all webhook events to a `WebhookLog` table (id, provider, eventType, payload, processedAt, error)

---

## `WebhookLog` model to add to schema (do a new migration)

```prisma
model WebhookLog {
  id          Int      @id @default(autoincrement())
  provider    String
  eventType   String
  payload     Json
  processedAt DateTime?
  error       String?
  createdAt   DateTime @default(now())
}
```

Migration name: `add_webhook_log`

---

## Tests to write

- Cannot create checkout if study not approved
- Stripe webhook with invalid signature is rejected (403)
- PayPal webhook with invalid signature is rejected (403)
- Successful webhook marks donation completed and recalculates progression
- Duplicate webhook event is idempotent (second call does nothing)
- Participant cannot see another participant's donation
