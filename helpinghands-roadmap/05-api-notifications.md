# Step 05 — API: Notifications System

## Context

You are extending the existing email system in `apps/api/src/modules/email/`.
The goal is to send the right notification to the right person at every key event.
Also add an in-app notification model so users see a bell icon with unread count.

## New packages

```bash
pnpm --filter @helping-hands/api add @nestjs/bull bull
pnpm --filter @helping-hands/api add -D @types/bull
```

Bull uses Redis (already configured) for job queues — this prevents email from blocking the request cycle.

---

## New model: `Notification`

Add to Prisma schema, then migrate:

```prisma
model Notification {
  id          Int      @id @default(autoincrement())
  userId      Int
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        String   // e.g. "study_published", "voting_open", "donation_approved"
  title       String
  body        String
  isRead      Boolean  @default(false)
  readAt      DateTime?
  referenceId Int?     // ID of the related entity (studyId, donationId, etc.)
  referenceType String? // "study", "donation", "project"
  createdAt   DateTime @default(now())
}
```

Add to `User` model:
```prisma
notifications Notification[]
```

Migration name: `add_notifications`

---

## Queue setup in `app.module.ts`

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    redis: {
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
    },
  }),
  inject: [ConfigService],
}),
BullModule.registerQueue({ name: 'email' }),
BullModule.registerQueue({ name: 'notifications' }),
```

---

## Email templates to create

Create `apps/api/src/modules/email/templates/` with these HTML templates. Each template receives variables in `{{ variable }}` syntax (use Handlebars or simple string replacement):

### `study-published.html`
Sent to: all participants who have previously donated to this project
Variables: `participantName`, `projectName`, `studyUrl`, `votingStartsAt`
Content: "The study for [projectName] has been published. Your vote matters!"

### `voting-open.html`
Sent to: all registered participants + project followers
Variables: `participantName`, `projectName`, `voteUrl`, `votingEndsAt`
Content: "Voting is now open for [projectName]. Cast your vote before [date]."

### `voting-reminder.html`
Sent to: participants who have NOT voted yet, 24h before voting closes
Variables: `participantName`, `projectName`, `voteUrl`, `hoursRemaining`

### `study-approved.html`
Sent to: all participants who voted + all participants who donated to this project
Variables: `participantName`, `projectName`, `donateUrl`
Content: "Great news! [projectName] has been approved. Donations are now open."

### `donation-online-confirmed.html`
Sent to: the donor
Variables: `participantName`, `amount`, `currency`, `projectName`, `transactionId`, `date`

### `study-rejected.html`
Sent to: admin who created the study
Variables: `adminName`, `projectName`, `reason`

---

## NotificationsService

Create `apps/api/src/modules/notifications/notifications.service.ts`:

```typescript
@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private notifQueue: Queue,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  // Called internally by other services — NOT a direct endpoint
  async notify(event: NotificationEvent): Promise<void>

  // API: get my notifications
  async getMyNotifications(userId: number, page: number): Promise<PaginatedResult>

  // API: mark as read
  async markRead(notificationId: number, userId: number): Promise<void>

  // API: mark all as read
  async markAllRead(userId: number): Promise<void>

  // API: unread count (used for bell icon badge)
  async getUnreadCount(userId: number): Promise<number>
}
```

### `NotificationEvent` type:
```typescript
type NotificationEvent =
  | { type: 'study_published'; studyId: number; projectId: number }
  | { type: 'voting_open'; studyId: number; projectId: number }
  | { type: 'voting_reminder'; studyId: number }
  | { type: 'study_approved'; studyId: number; projectId: number }
  | { type: 'study_rejected'; studyId: number; adminId: number; reason: string }
  | { type: 'donation_online_confirmed'; donationId: number }
  | { type: 'donation_cash_approved'; donationId: number }
```

Each event type resolves to: which users to notify, which email template, and which in-app notification text.

---

## NotificationsController

```typescript
@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {

  @Get()
  // Any authenticated user
  getMyNotifications(@CurrentUser('sub') userId: number, @Query('page') page: number)

  @Get('unread-count')
  getUnreadCount(@CurrentUser('sub') userId: number)

  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number)

  @Patch('read-all')
  markAllRead(@CurrentUser('sub') userId: number)
}
```

---

## Integration points — where to fire events

After each of these actions, call `notificationsService.notify(event)`:

| Where | Action | Event to fire |
|-------|--------|--------------|
| `study.service.ts` | status → `published` | `study_published` |
| `study.service.ts` | status → `voting_open` | `voting_open` |
| `voting.scheduler.ts` | cron: 24h before close | `voting_reminder` |
| `study.service.ts` | status → `approved` | `study_approved` |
| `study.service.ts` | status → `rejected` | `study_rejected` |
| `payments.service.ts` | webhook: payment completed | `donation_online_confirmed` |
| `donations.service.ts` | status → `approved` | `donation_cash_approved` |

---

## Add voting reminder cron to `VotingScheduler`

```typescript
@Cron('0 * * * *') // every hour
async sendVotingReminders() {
  // find studies where votingEndsAt is between now+23h and now+25h
  // AND reminder has not been sent yet (add a reminderSentAt field to ProjectStudy)
  // fire voting_reminder event for each
}
```

Add `reminderSentAt DateTime?` to `ProjectStudy` in schema. Migration name: `add_reminder_sent_at`.

---

## ENV variables to add

```env
REDIS_HOST=localhost
REDIS_PORT=6379
```
