import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectCategoryNode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CategoryTreeNode extends ProjectCategoryNode {
  children: CategoryTreeNode[];
}

/**
 * W6-E2 — the civic category taxonomy (read-side). Nodes are seeded data
 * (packages/database/prisma/seeds/w6-category-taxonomy.ts); this service
 * serves the hierarchy to pickers and resolves categories for writers.
 * The legacy enums are frozen — `categoryId` is the only category truth.
 */
@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

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
}
