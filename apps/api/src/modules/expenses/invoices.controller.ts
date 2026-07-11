import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { InvoicesService } from './invoices.service';

// Matches FilesController's allow-list plus common office/spreadsheet types
// invoices are typically issued in.
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * W8 — invoice uploads. Stored to local disk (UPLOAD_DIR), same as
 * FilesController — deliberately NOT modeled through the polymorphic File
 * table, whose referenceId carries a real FK to Block (expenses/invoices
 * are not blocks).
 */
@ApiTags('Invoices')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
@Controller({ path: 'invoices', version: '1' })
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Post()
  @ApiOperation({ summary: 'Upload an invoice document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        invoiceNumber: { type: 'string' },
        invoiceDate: { type: 'string', format: 'date' },
        recipientId: { type: 'number' },
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
          cb(null, `invoice-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException(`File type ${file.mimetype} not allowed`), false);
      },
      limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
    }),
  )
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body('invoiceNumber') invoiceNumber: string,
    @Body('invoiceDate') invoiceDate: string,
    @Body('recipientId') recipientId: string | undefined,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.invoicesService.create(actor, file, {
      invoiceNumber,
      invoiceDate,
      recipientId: recipientId != null ? Number(recipientId) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Invoice detail' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.detail(id);
  }
}
