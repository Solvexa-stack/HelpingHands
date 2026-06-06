import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBlockDto, UpdateBlockDto, BlockQueryDto } from './dto/block.dto';
import { BlockCategory } from '@prisma/client';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class BlocksService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: BlockQueryDto) {
    const { page = 1, limit = 15, category, lang, search, activeOnly = true } = query;
    const { skip, take } = paginate(page, limit);

    const where: any = {};
    if (category) where.category = category;
    if (activeOnly) where.isActive = true;
    if (search) {
      where.translations = {
        some: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { brief: { contains: search, mode: 'insensitive' } },
          ],
        },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.block.findMany({
        where,
        skip,
        take,
        orderBy: [{ orderId: 'asc' }, { createdAt: 'desc' }],
        include: {
          translations: lang
            ? { where: { languageCode: lang } }
            : true,
          files: { where: { isActive: true }, orderBy: { orderId: 'asc' } },
        },
      }),
      this.prisma.block.count({ where }),
    ]);

    return paginatedResponse(data, total, page, limit);
  }

  async findBySlug(slug: string) {
    const translation = await this.prisma.blockTranslation.findUnique({
      where: { slug },
      include: {
        block: {
          include: {
            translations: true,
            files: { where: { isActive: true }, orderBy: { orderId: 'asc' } },
          },
        },
      },
    });
    if (!translation) throw new NotFoundException(`Content with slug '${slug}' not found`);
    return translation.block;
  }

  async findById(id: number) {
    const block = await this.prisma.block.findUnique({
      where: { id },
      include: {
        translations: true,
        files: { where: { isActive: true }, orderBy: { orderId: 'asc' } },
        project: true,
      },
    });
    if (!block) throw new NotFoundException(`Block #${id} not found`);
    return block;
  }

  async create(dto: CreateBlockDto) {
    const { translations, ...blockData } = dto;

    // Check slug uniqueness
    for (const t of translations) {
      const existing = await this.prisma.blockTranslation.findUnique({ where: { slug: t.slug } });
      if (existing) throw new ConflictException(`Slug '${t.slug}' already exists`);
    }

    return this.prisma.block.create({
      data: {
        ...blockData,
        translations: { create: translations },
      },
      include: { translations: true },
    });
  }

  async update(id: number, dto: UpdateBlockDto) {
    await this.findById(id);
    const { translations, ...blockData } = dto;

    if (translations?.length) {
      for (const t of translations) {
        const existing = await this.prisma.blockTranslation.findUnique({ where: { slug: t.slug } });
        if (existing && existing.blockId !== id) throw new ConflictException(`Slug '${t.slug}' already exists`);
      }

      await this.prisma.blockTranslation.deleteMany({ where: { blockId: id } });
    }

    return this.prisma.block.update({
      where: { id },
      data: {
        ...blockData,
        ...(translations && { translations: { create: translations } }),
      },
      include: { translations: true },
    });
  }

  async remove(id: number) {
    await this.findById(id);
    await this.prisma.block.delete({ where: { id } });
  }

  async toggleActive(id: number) {
    const block = await this.findById(id);
    return this.prisma.block.update({
      where: { id },
      data: { isActive: !block.isActive },
    });
  }

  async findByCategory(category: BlockCategory, lang?: string, limit = 10) {
    return this.prisma.block.findMany({
      where: { category, isActive: true },
      take: limit,
      orderBy: [{ orderId: 'asc' }, { createdAt: 'desc' }],
      include: {
        translations: lang ? { where: { languageCode: lang } } : true,
        files: { where: { isActive: true, isCover: true }, take: 1 },
      },
    });
  }
}
