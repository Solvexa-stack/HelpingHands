import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { StudyService } from './study.service';
import { CreateStudyDto } from './dto/create-study.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { ChangeStudyStatusDto } from './dto/change-study-status.dto';
import { StudyFiltersDto } from './dto/study-filters.dto';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
];

const sectionFileStorage = diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_DIR || './uploads';
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

@ApiTags('Study')
@Controller({ path: 'study', version: '1' })
export class StudyController {
  constructor(private studyService: StudyService) {}

  @Post()
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a study for a project (auto-populates sections from templates)' })
  create(@Body() dto: CreateStudyDto, @CurrentUser() user: JwtPayload) {
    return this.studyService.createStudy(dto, user.referenceId);
  }

  // ── Static routes before :id ─────────────────────────────────────────────────

  @Get('project/:projectId')
  @Public()
  @ApiOperation({ summary: 'Get published study for a project (public)' })
  findByProject(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.studyService.getStudyByProject(projectId);
  }

  @Get()
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List studies with filters' })
  findAll(@Query() filters: StudyFiltersDto, @CurrentUser() user: JwtPayload) {
    return this.studyService.listStudies(filters, user);
  }

  @Get(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get study details by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.studyService.getStudy(id);
  }

  // ── Section file routes before :id/status to avoid route conflicts ────────────

  @Post('sections/:sectionId/files')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload files to a study section' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: sectionFileStorage,
      fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException(`File type "${file.mimetype}" not allowed`), false);
      },
      limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
    }),
  )
  uploadSectionFiles(
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.studyService.uploadSectionFiles(sectionId, files);
  }

  @Patch('sections/:sectionId')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update a study section content/status/assignment' })
  updateSection(
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: UpdateSectionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyService.updateSection(sectionId, dto, user.referenceId, user.role);
  }

  @Delete('sections/files/:fileId')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a section file' })
  deleteSectionFile(@Param('fileId', ParseIntPipe) fileId: number) {
    return this.studyService.deleteSectionFile(fileId);
  }

  // ── Study-level mutations ─────────────────────────────────────────────────────

  @Patch(':id/status')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Change study status (state machine)' })
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStudyStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyService.changeStatus(id, dto, user.referenceId, user.role);
  }

  @Delete(':id')
  @Roles(AdminRole.administrator)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a draft study (admin only)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.studyService.deleteStudy(id);
  }
}
