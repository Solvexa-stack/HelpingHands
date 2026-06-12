# Step 03 — API: Voting Module

## Context

You are working on `apps/api/src/modules/voting/`.
The study module from Step 02 is already built and working.
Import `StudyService` from the study module to check study state.

## Module structure to create

```
apps/api/src/modules/voting/
├── voting.module.ts
├── voting.controller.ts
├── voting.service.ts
└── dto/
    ├── cast-vote.dto.ts
    └── vote-filters.dto.ts
```

---

## DTOs

### `cast-vote.dto.ts`
```typescript
export class CastVoteDto {
  @ApiProperty() @IsInt() studyId: number
  @ApiProperty({ enum: VoteChoice }) @IsEnum(VoteChoice) choice: VoteChoice
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) comment?: string
}
```

---

## Service: `voting.service.ts`

### `castVote(dto, userId)`
1. Load study — must exist and have status `voting_open`
2. Check `votingEndsAt` — if past, throw `BadRequestException('Voting period has ended')`
3. Check if user already voted on this study (`@@unique` constraint) — throw `ConflictException` if so
4. Create `StudyVote` record
5. Return vote with user display name

### `changeVote(studyId, userId, newChoice, comment)`
User can update their vote while voting is open. Find existing vote and update.

### `getResults(studyId)`
Return detailed vote breakdown:
```typescript
{
  studyId: number,
  status: StudyStatus,
  votingEndsAt: Date | null,
  total: number,
  for: { count: number, percentage: number },
  against: { count: number, percentage: number },
  abstain: { count: number, percentage: number },
  myVote: VoteChoice | null,   // null if user hasn't voted
  recentComments: Array<{ choice, comment, createdAt }> // last 10, no names for privacy
}
```

### `listVotes(studyId, adminId)`
Admin only — full list with user details. Used for audit.

### `autoCloseExpiredVotings()`
Cron job method — called by a scheduled task every hour. Finds studies with `status = voting_open` and `votingEndsAt < now()`, transitions them to `voting_closed`.
Use `@nestjs/schedule` — add `ScheduleModule.forRoot()` to `app.module.ts`.

---

## Controller: `voting.controller.ts`

```typescript
@ApiTags('Voting')
@Controller('voting')
export class VotingController {

  @Post('cast')
  // Any authenticated user (participant or admin)
  castVote(@Body() dto: CastVoteDto, @CurrentUser('sub') userId: number)

  @Patch(':studyId/change')
  // Any authenticated user — only their own vote
  changeVote(@Param('studyId', ParseIntPipe) studyId: number, @Body() dto: ChangeVoteDto, @CurrentUser('sub') userId: number)

  @Get(':studyId/results')
  // Public endpoint — results visible to everyone once voting opens
  @Public()
  getResults(@Param('studyId', ParseIntPipe) studyId: number, @CurrentUser() user: JwtPayload | null)

  @Get(':studyId/votes')
  @Roles('administrator')
  listVotes(@Param('studyId', ParseIntPipe) studyId: number, @Query() filters: VoteFiltersDto)
}
```

---

## Scheduled task for auto-close

Create `apps/api/src/modules/voting/voting.scheduler.ts`:
```typescript
import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { VotingService } from './voting.service'

@Injectable()
export class VotingScheduler {
  constructor(private readonly votingService: VotingService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredVotings() {
    await this.votingService.autoCloseExpiredVotings()
  }
}
```

Register `VotingScheduler` as a provider in `voting.module.ts`.

---

## Module: `voting.module.ts`

Import: `PrismaModule`, `StudyModule` (for StudyService).
Add `ScheduleModule.forRoot()` to `app.module.ts` imports.

---

## Dashboard integration

Update the existing `DashboardService` to include:
- `pendingVotes`: count of studies in `voting_open` state
- `studiesByStatus`: breakdown of study statuses

---

## Vote privacy rules

- Public `getResults` endpoint NEVER returns voter names or user IDs
- Admin `listVotes` endpoint returns full details (for audit purposes only)
- Comment text is shown publicly but anonymized

---

## Tests to write

- Cannot vote on study not in `voting_open` status
- Cannot vote twice on same study (unique constraint)
- Can change vote while voting open
- Cannot change vote after voting closed
- getResults returns correct percentages (handle division by zero when total=0)
- Auto-close cron correctly transitions status
