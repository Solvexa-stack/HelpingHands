import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBlockDto, UpdateBlockDto, BlockQueryDto } from './dto/block.dto';
import { BlockCategory } from '@prisma/client';
import { paginate, paginatedResponse } from '../../common/dto/pagination.dto';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';

@Injectable()
export class BlocksService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

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
    // A soft-deleted block (e.g. a deleted project's content) must read as
    // nonexistent — nested includes bypass the soft-delete middleware.
    if (!translation || translation.block.deletedAt) {
      throw new NotFoundException(`Content with slug '${slug}' not found`);
    }
    return translation.block;
  }

  /**
   * Slugs are globally unique on block_translations. A slug still held by a
   * SOFT-DELETED block is logically free: release it (rename the stale row so
   * the DB unique constraint is satisfied) so the caller can reuse the slug.
   * `ownBlockId` lets a block keep its own slugs while being updated.
   */
  private async ensureSlugAvailable(slug: string, ownBlockId?: number) {
    const existing = await this.prisma.blockTranslation.findUnique({
      where: { slug },
      include: { block: { select: { id: true, deletedAt: true } } },
    });
    if (!existing) return;
    if (ownBlockId != null && existing.blockId === ownBlockId) return;
    if (existing.block.deletedAt) {
      const freed = `del-${existing.id}:${existing.slug}`.slice(0, 500);
      await this.prisma.blockTranslation.update({ where: { id: existing.id }, data: { slug: freed } });
      return;
    }
    throw new ConflictException(`Slug '${slug}' already exists`);
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

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async create(dto: CreateBlockDto) {
    const { translations, ...blockData } = dto;

    // Check slug uniqueness (soft-deleted blocks release their slugs)
    for (const t of translations) {
      await this.ensureSlugAvailable(t.slug);
    }

    return this.prisma.block.create({
      data: {
        ...blockData,
        translations: { create: translations },
      },
      include: { translations: true },
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
  async update(id: number, dto: UpdateBlockDto) {
    await this.findById(id);
    const { translations, ...blockData } = dto;

    if (translations?.length) {
      for (const t of translations) {
        await this.ensureSlugAvailable(t.slug, id);
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

  async remove(actor: ActorContext, id: number) {
    await this.findById(id);
    await this.prisma.block.delete({ where: { id } });

    this.eventBus.publish({
      event: 'block.deleted',
      actor,
      subject: { type: 'block', id },
      data: {},
    });
  }

  // eslint-disable-next-line require-actor-context -- legacy (pre-W0-E2): thread ActorContext when this method is next touched
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
