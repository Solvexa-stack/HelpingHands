import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto';

@Injectable()
export class LanguagesService {
  constructor(private prisma: PrismaService) {}

  async findAll(activeOnly = false) {
    return this.prisma.language.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { order: 'asc' },
    });
  }

  async findByCode(code: string) {
    const lang = await this.prisma.language.findUnique({ where: { code } });
    if (!lang) throw new NotFoundException(`Language '${code}' not found`);
    return lang;
  }

  async create(dto: CreateLanguageDto) {
    const existing = await this.prisma.language.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Language code '${dto.code}' already exists`);
    return this.prisma.language.create({ data: dto });
  }

  async update(code: string, dto: UpdateLanguageDto) {
    await this.findByCode(code);
    return this.prisma.language.update({ where: { code }, data: dto });
  }

  async remove(code: string) {
    await this.findByCode(code);
    await this.prisma.language.delete({ where: { code } });
  }

  async toggleActive(code: string) {
    const lang = await this.findByCode(code);
    return this.prisma.language.update({
      where: { code },
      data: { isActive: !lang.isActive },
    });
  }
}
