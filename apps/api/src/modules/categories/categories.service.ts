import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectCategoryNode } from '@prisma/client';
import { ActorContext } from '../../events/actor-context';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

export interface CategoryTreeNode extends ProjectCategoryNode {
  children: CategoryTreeNode[];
}

/**
 * W6-E2 — the civic category taxonomy (read-side). Nodes are seeded data
 * (packages/database/prisma/seeds/w6-category-taxonomy.ts); this service
 * serves the hierarchy to pickers and resolves categories for writers.
 * The legacy enums are frozen — `categoryId` is the only category truth.
 *
 * W9 — write-side (Super Admin only, see sector.manage in policy-registry.ts):
 * sectors are archived/reactivated via `isActive`, never hard-deleted — there
 * is deliberately no `delete` method on this service, so "do not allow
 * deleting a sector with financial history" holds structurally rather than
 * by a runtime check (matches the archive/status convention used everywhere
 * else in this schema — Fund, Organization, etc.).
 */
@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  /** Active taxonomy as a tree, ordered — the picker/browse payload. */
  async tree(): Promise<CategoryTreeNode[]> {
    const nodes = await this.prisma.projectCategoryNode.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
    const byId = new Map<number, CategoryTreeNode>(
      nodes.map((n) => [n.id, { ...n, children: [] as CategoryTreeNode[] }]),
    );
    const roots: CategoryTreeNode[] = [];
    for (const node of byId.values()) {
      if (node.parentId != null && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async byId(id: number): Promise<ProjectCategoryNode> {
    const node = await this.prisma.projectCategoryNode.findUnique({ where: { id } });
    if (!node || !node.isActive) throw new NotFoundException(`Category node #${id} not found`);
    return node;
  }

  async byKey(key: string): Promise<ProjectCategoryNode> {
    const node = await this.prisma.projectCategoryNode.findUnique({ where: { key } });
    if (!node || !node.isActive) throw new NotFoundException(`Category "${key}" not found`);
    return node;
  }

  /**
   * Category for a project write: `categoryId` or `categoryKey` win; the
   * legacy `category` enum value is accepted for old clients and resolved to
   * its node — the enum column itself is never written (frozen, W6-E2-S1).
   */
  async resolveForWrite(dto: {
    categoryId?: number;
    categoryKey?: string;
    category?: string;
  }): Promise<number> {
    if (dto.categoryId != null) return (await this.byId(dto.categoryId)).id;
    if (dto.categoryKey) return (await this.byKey(dto.categoryKey)).id;
    if (dto.category) {
      const node = await this.prisma.projectCategoryNode.findFirst({
        where: { legacyCategory: dto.category as never, isActive: true },
      });
      if (!node) throw new BadRequestException(`Unknown legacy category "${dto.category}"`);
      return node.id;
    }
    throw new BadRequestException('A project category is required (categoryId, categoryKey, or legacy category)');
  }

  /** The node and all its descendants — hierarchical browse/filter support. */
  async selfAndDescendantIds(nodeId: number): Promise<number[]> {
    const nodes = await this.prisma.projectCategoryNode.findMany({
      select: { id: true, parentId: true },
    });
    const childrenOf = new Map<number | null, number[]>();
    for (const n of nodes) {
      const list = childrenOf.get(n.parentId) ?? [];
      list.push(n.id);
      childrenOf.set(n.parentId, list);
    }
    const result: number[] = [];
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      queue.push(...(childrenOf.get(current) ?? []));
    }
    return result;
  }

  /**
   * Study templates for a category: the node's own set, or — child nodes
   * (e.g. infrastructure/water) inherit the nearest ancestor's set.
   */
  async templatesForCategory(nodeId: number) {
    let current: ProjectCategoryNode | null = await this.prisma.projectCategoryNode.findUnique({
      where: { id: nodeId },
    });
    while (current) {
      const templates = await this.prisma.studyDepartmentTemplate.findMany({
        where: { categoryNodeId: current.id, isActive: true },
        orderBy: { order: 'asc' },
      });
      if (templates.length > 0) return templates;
      current = current.parentId
        ? await this.prisma.projectCategoryNode.findUnique({ where: { id: current.parentId } })
        : null;
    }
    return [];
  }

  // ─── W9 — write-side (Super Admin only) ──────────────────────────────────────

  async create(actor: ActorContext, dto: CreateCategoryDto): Promise<ProjectCategoryNode> {
    if (dto.parentId != null) {
      const parent = await this.prisma.projectCategoryNode.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException(`Category node #${dto.parentId} not found`);
    }
    const existing = await this.prisma.projectCategoryNode.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException(`Category key "${dto.key}" already exists`);

    const node = await this.prisma.projectCategoryNode.create({
      data: {
        key: dto.key,
        name: dto.name,
        nameAr: dto.nameAr,
        nameFr: dto.nameFr,
        description: dto.description,
        parentId: dto.parentId,
        order: dto.order ?? 0,
      },
    });
    this.eventBus.publish({
      event: 'sector.created',
      actor,
      subject: { type: 'project_category_node', id: node.id },
      data: { key: node.key, name: node.name, parentId: node.parentId },
    });
    return node;
  }

  async update(actor: ActorContext, id: number, dto: UpdateCategoryDto): Promise<ProjectCategoryNode> {
    const node = await this.prisma.projectCategoryNode.findUnique({ where: { id } });
    if (!node) throw new NotFoundException(`Category node #${id} not found`);

    if (dto.parentId != null) {
      if (dto.parentId === id) throw new BadRequestException('A sector cannot be its own parent');
      const parent = await this.prisma.projectCategoryNode.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException(`Category node #${dto.parentId} not found`);
      const descendantIds = await this.selfAndDescendantIds(id);
      if (descendantIds.includes(dto.parentId)) {
        throw new BadRequestException('A sector cannot be parented under its own descendant');
      }
    }

    const updated = await this.prisma.projectCategoryNode.update({
      where: { id },
      data: {
        name: dto.name,
        nameAr: dto.nameAr,
        nameFr: dto.nameFr,
        description: dto.description,
        parentId: dto.parentId,
        order: dto.order,
        isActive: dto.isActive,
      },
    });
    this.eventBus.publish({
      event: 'sector.updated',
      actor,
      subject: { type: 'project_category_node', id },
      data: { changedFields: Object.keys(dto) },
    });
    return updated;
  }

  /**
   * Archive (never delete — see class comment): hides the sector from the
   * public tree and pickers. Existing Funds/Projects/history referencing it
   * are untouched — `categoryId` FKs stay valid, `Fund.status`/`Project`
   * lifecycles are unaffected by a sector going inactive.
   */
  async archive(actor: ActorContext, id: number): Promise<ProjectCategoryNode> {
    const node = await this.prisma.projectCategoryNode.findUnique({ where: { id } });
    if (!node) throw new NotFoundException(`Category node #${id} not found`);
    const updated = await this.prisma.projectCategoryNode.update({ where: { id }, data: { isActive: false } });
    this.eventBus.publish({
      event: 'sector.archived',
      actor,
      subject: { type: 'project_category_node', id },
      data: { key: node.key },
    });
    return updated;
  }

  async activate(actor: ActorContext, id: number): Promise<ProjectCategoryNode> {
    const node = await this.prisma.projectCategoryNode.findUnique({ where: { id } });
    if (!node) throw new NotFoundException(`Category node #${id} not found`);
    const updated = await this.prisma.projectCategoryNode.update({ where: { id }, data: { isActive: true } });
    this.eventBus.publish({
      event: 'sector.activated',
      actor,
      subject: { type: 'project_category_node', id },
      data: { key: node.key },
    });
    return updated;
  }

  /** Admin-only tree: includes archived (isActive:false) nodes, unlike the public `tree()`. */
  async adminTree(): Promise<CategoryTreeNode[]> {
    const nodes = await this.prisma.projectCategoryNode.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
    const byId = new Map<number, CategoryTreeNode>(
      nodes.map((n) => [n.id, { ...n, children: [] as CategoryTreeNode[] }]),
    );
    const roots: CategoryTreeNode[] = [];
    for (const node of byId.values()) {
      if (node.parentId != null && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}
