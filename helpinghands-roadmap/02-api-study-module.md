# Step 02 — API: Project Study Module

## Context

You are working on `apps/api/src/modules/study/`.
The Prisma schema from Step 01 is already applied.
Follow the exact same patterns as the existing `projects` and `donations` modules.

## Module structure to create

```
apps/api/src/modules/study/
├── study.module.ts
├── study.controller.ts
├── study.service.ts
└── dto/
    ├── create-study.dto.ts
    ├── update-study.dto.ts
    ├── update-section.dto.ts
    ├── change-study-status.dto.ts
    └── study-filters.dto.ts
```

---

## DTOs

### `create-study.dto.ts`
```typescript
import { IsInt, IsOptional, IsString, IsDateString } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateStudyDto {
  @ApiProperty() @IsInt() projectId: number
  @ApiPropertyOptional() @IsOptional() @IsString() summary?: string
  @ApiPropertyOptional() @IsOptional() @IsDateString() votingStartsAt?: string
  @ApiPropertyOptional() @IsOptional() @IsDateString() votingEndsAt?: string
}
```

### `update-section.dto.ts`
```typescript
export class UpdateSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string
  @ApiPropertyOptional() @IsOptional() @IsEnum(SectionStatus) status?: SectionStatus
  @ApiPropertyOptional() @IsOptional() @IsInt() assignedTo?: number
}
```

### `change-study-status.dto.ts`
```typescript
export class ChangeStudyStatusDto {
  @ApiProperty({ enum: StudyStatus }) @IsEnum(StudyStatus) status: StudyStatus
  @ApiPropertyOptional() @IsOptional() @IsString() rejectionReason?: string
}
```

---

## Service: `study.service.ts`

Implement all these methods with full logic:

### `createStudy(dto, createdById)`
1. Check project exists and has no existing study
2. Look up `StudyDepartmentTemplate` by the project's category/type
3. Create `ProjectStudy` with status `draft`
4. Create all `StudySection` records from the templates (auto-populate sections)
5. Return full study with sections

### `getStudy(projectId)`
Return study with all sections, section files, vote counts (for, against, abstain), and assigned admin names.

### `listStudies(filters)`
Filters: `status`, `projectId`, `page`, `limit`. Admin/Employee see all. Financial officers see only assigned projects.

### `updateSection(sectionId, dto, requestingUserId)`
Only the assigned admin or any administrator can update. When all required sections are `completed`, automatically update study status to `in_review`.

### `uploadSectionFile(sectionId, file)`
Save file to disk, create `StudySectionFile` record. Reuse existing file upload logic.

### `deleteSectionFile(fileId)`
Delete from disk and DB.

### `changeStatus(studyId, dto, adminId)`
State machine — only allow valid transitions:
```
draft → in_review       (employee or admin)
in_review → published   (admin only)
in_review → draft       (admin only, with reason)
published → voting_open (admin only, sets votingStartsAt if not set)
voting_open → voting_closed (admin only, or auto when votingEndsAt passes)
voting_closed → approved (admin only)
voting_closed → rejected (admin only, requires rejectionReason)
approved → (triggers: update Project.studyStatus, unlock donations)
```
When status changes to `approved`, also update `Project.studyStatus = approved` in same transaction.

### `getStudyByToken(token)`
Public endpoint — used on the public website to show study details before voting.

### `deleteStudy(studyId)`
Admin only. Only deletable if status is `draft`. Cascade handled by Prisma.

---

## Controller: `study.controller.ts`

```typescript
@ApiTags('Study')
@Controller('study')
export class StudyController {

  @Post()
  @Roles('administrator', 'employee')
  create(@Body() dto: CreateStudyDto, @CurrentUser('sub') userId: number)

  @Get()
  @Roles('administrator', 'employee', 'financial_officer')
  findAll(@Query() filters: StudyFiltersDto, @CurrentUser() user: JwtPayload)

  @Get(':id')
  // Any authenticated user — service filters by role
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload)

  @Get('project/:projectId')
  @Public()
  // Public — shows published studies only
  findByProject(@Param('projectId', ParseIntPipe) projectId: number)

  @Patch(':id/status')
  @Roles('administrator')
  changeStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeStudyStatusDto, @CurrentUser('sub') adminId: number)

  @Patch('sections/:sectionId')
  @Roles('administrator', 'employee')
  updateSection(@Param('sectionId', ParseIntPipe) sectionId: number, @Body() dto: UpdateSectionDto, @CurrentUser('sub') userId: number)

  @Post('sections/:sectionId/files')
  @Roles('administrator', 'employee')
  @UseInterceptors(FilesInterceptor('files'))
  uploadSectionFiles(@Param('sectionId', ParseIntPipe) sectionId: number, @UploadedFiles() files: Express.Multer.File[])

  @Delete('sections/files/:fileId')
  @Roles('administrator', 'employee')
  deleteSectionFile(@Param('fileId', ParseIntPipe) fileId: number)

  @Delete(':id')
  @Roles('administrator')
  remove(@Param('id', ParseIntPipe) id: number)
}
```

---

## Module: `study.module.ts`

Import `PrismaModule`, `ConfigModule`. Export `StudyService` (needed by voting module).

---

## Register in `app.module.ts`

Add `StudyModule` to the imports array.

---

## API response shape

All study responses must follow the existing `ResponseInterceptor` pattern:
```json
{
  "data": {
    "id": 1,
    "projectId": 5,
    "status": "draft",
    "summary": null,
    "sections": [
      {
        "id": 1,
        "name": "Soil Study",
        "status": "pending",
        "isRequired": true,
        "order": 1,
        "assignedTo": null,
        "content": null,
        "files": []
      }
    ],
    "votesSummary": { "for": 0, "against": 0, "abstain": 0, "total": 0 },
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Tests to write (in `study.service.spec.ts`)

- Cannot create study if project already has one
- Status transition: draft → in_review works
- Status transition: draft → approved FAILS (invalid transition)
- All required sections completed triggers auto in_review
- Financial officer cannot see other projects' studies
- Public endpoint only returns published/approved studies
