import {
  Controller,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  Query,
  Get,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AdminRole, FileType } from '@prisma/client';
import { FilesService } from './files.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { ConfigService } from '@nestjs/config';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4'];

@ApiTags('Files')
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(
    private filesService: FilesService,
    private config: ConfigService,
  ) {}

  @Post('upload')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        referenceId: { type: 'number' },
        referenceType: { type: 'string' },
        fileType: { type: 'string', enum: ['image', 'video', 'pdf'] },
        isCover: { type: 'boolean' },
        description: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = process.env.UPLOAD_DIR || './uploads';
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException(`File type ${file.mimetype} not allowed`), false);
      },
      limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('referenceId', ParseIntPipe) referenceId: number,
    @Body('referenceType') referenceType: string,
    @Body('fileType') fileType: FileType,
    @Body('isCover') isCover?: string,
    @Body('description') description?: string,
  ) {
    return this.filesService.uploadFile(
      file,
      referenceId,
      referenceType,
      fileType,
      isCover === 'true',
      description,
    );
  }

  @Get()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List files for a reference' })
  getFiles(
    @Query('referenceId', ParseIntPipe) referenceId: number,
    @Query('referenceType') referenceType: string,
  ) {
    return this.filesService.getFiles(referenceId, referenceType);
  }

  @Patch(':id/cover')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Set file as cover' })
  setCover(@Param('id', ParseIntPipe) id: number) {
    return this.filesService.setCover(id);
  }

  @Delete(':id')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a file' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.filesService.deleteFile(id);
  }
}
