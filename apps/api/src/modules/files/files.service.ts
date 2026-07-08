import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { FileType } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async uploadFile(
    file: Express.Multer.File,
    referenceId: number,
    referenceType: string,
    fileType: FileType,
    isCover = false,
    description?: string,
  ) {
    const appUrl = this.config.get('app.url', 'http://localhost:4000');
    const url = `${appUrl}/uploads/${file.filename}`;

    if (isCover) {
      await this.prisma.file.updateMany({
        where: { referenceId, referenceType, isCover: true },
        data: { isCover: false },
      });
    }

    return this.prisma.file.create({
      data: {
        referenceId,
        referenceType,
        name: file.originalname,
        url,
        fileType,
        isCover,
        description,
      },
    });
  }

  async getFiles(referenceId: number, referenceType: string) {
    return this.prisma.file.findMany({
      where: { referenceId, referenceType, isActive: true },
      orderBy: [{ isCover: 'desc' }, { orderId: 'asc' }],
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async deleteFile(id: number) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException(`File #${id} not found`);

    // Try to delete physical file
    try {
      const uploadDir = this.config.get('app.uploadDir', './uploads');
      const filename = file.url.split('/uploads/').pop();
      if (filename) {
        const filePath = path.join(process.cwd(), uploadDir.replace('./', ''), filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch (e) {
      // Non-critical: log but continue
    }

    await this.prisma.file.delete({ where: { id } });
  }

  async setCover(id: number) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException(`File #${id} not found`);

    await this.prisma.file.updateMany({
      where: { referenceId: file.referenceId, referenceType: file.referenceType, isCover: true },
      data: { isCover: false },
    });

    return this.prisma.file.update({ where: { id }, data: { isCover: true } });
  }

  async reorder(ids: number[]) {
    const updates = ids.map((id, index) =>
      this.prisma.file.update({ where: { id }, data: { orderId: index } }),
    );
    return Promise.all(updates);
  }

  getMulterConfig() {
    const uploadDir = this.config.get('app.uploadDir', './uploads');
    const maxSize = this.config.get('app.maxFileSize', 10485760);
    return { uploadDir, maxSize };
  }
}
