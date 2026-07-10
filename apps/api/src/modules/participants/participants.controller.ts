import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AdminRole } from '@prisma/client';
import { ParticipantsService, UpdateParticipantDto } from './participants.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Participants')
@Controller({ path: 'participants', version: '1' })
@ApiBearerAuth('JWT')
export class ParticipantsController {
  constructor(private participantsService: ParticipantsService) {}

  @Get()
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'List all participants' })
  findAll(@Query() query: PaginationDto) {
    return this.participantsService.findAll(query);
  }

  @Get(':id')
  @Roles(AdminRole.administrator, AdminRole.employee, 'participant')
  @ApiOperation({ summary: 'Get participant by ID (participants: self only)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    // BUG-11 fix (pilot consolidation): participants read only themselves —
    // foreign profiles carried donation history (names + amounts).
    return this.participantsService.findById(id, user.role, user.referenceId);
  }

  @Put(':id')
  @Roles(AdminRole.administrator, 'participant')
  @ApiOperation({ summary: 'Update participant profile' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateParticipantDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.participantsService.update(id, dto, user.sub, user.role);
  }

  @Patch(':id/toggle-active')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Toggle participant active status' })
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.participantsService.toggleActive(id);
  }

  @Patch(':id/avatar')
  @Roles('participant')
  @ApiOperation({ summary: 'Update participant avatar' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = process.env.UPLOAD_DIR || './uploads';
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          cb(null, `avatar-${Date.now()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new BadRequestException('Only images allowed'), false);
      },
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async updateAvatar(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.role === 'participant' && user.referenceId !== id) {
      throw new BadRequestException('You can only update your own avatar');
    }
    const appUrl = process.env.APP_URL || 'http://localhost:4000';
    const avatarUrl = `${appUrl}/uploads/${file.filename}`;
    return this.participantsService.updateAvatar(id, avatarUrl);
  }
}
