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

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async create(dto: CreateLanguageDto) {
    const existing = await this.prisma.language.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Language code '${dto.code}' already exists`);
    return this.prisma.language.create({ data: dto });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async update(code: string, dto: UpdateLanguageDto) {
    await this.findByCode(code);
    return this.prisma.language.update({ where: { code }, data: dto });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async remove(code: string) {
    await this.findByCode(code);
    await this.prisma.language.delete({ where: { code } });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async toggleActive(code: string) {
    const lang = await this.findByCode(code);
    return this.prisma.language.update({
      where: { code },
      data: { isActive: !lang.isActive },
    });
  }
}
