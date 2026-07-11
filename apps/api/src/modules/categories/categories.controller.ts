import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Public, Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

// Deliberately NO class-level @Roles() here (unlike FundsController etc.):
// this controller mixes a genuinely public route (`tree`) with Super-Admin-
// only write routes. RolesGuard's legacy fallback has no concept of
// `@Public()` — it only ever inspects `@Roles()` metadata — so a class-level
// requirement would apply to EVERY method, `tree()` included, and break
// public sector browsing whenever PolicyGuard is dormant (POLICY_ENFORCED
// flipped off, the documented one-flag rollback path). Each write method
// below carries its own `@Roles(AdminRole.administrator)` as that same
// legacy fallback instead; real enforcement is the `sector.manage` policy
// action (Super Admin only, see policy-registry.ts).
@ApiTags('Categories')
@ApiBearerAuth('JWT')
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Civic category taxonomy (tree, locale names inline)' })
  tree() {
    return this.categories.tree();
  }

  @Roles(AdminRole.administrator)
  @Get('admin-tree')
  @ApiOperation({ summary: 'Sector tree including archived nodes (Super Admin)' })
  adminTree() {
    return this.categories.adminTree();
  }

  @Roles(AdminRole.administrator)
  @Post()
  @ApiOperation({ summary: 'Create a sector (Super Admin)' })
  create(@Body() dto: CreateCategoryDto, @CurrentActor() actor: ActorContext) {
    return this.categories.create(actor, dto);
  }

  @Roles(AdminRole.administrator)
  @Patch(':id')
  @ApiOperation({ summary: 'Edit a sector (Super Admin)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.categories.update(actor, id, dto);
  }

  @Roles(AdminRole.administrator)
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a sector — hides it from public browsing; history is untouched (Super Admin)' })
  archive(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.categories.archive(actor, id);
  }

  @Roles(AdminRole.administrator)
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate an archived sector (Super Admin)' })
  activate(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.categories.activate(actor, id);
  }
}
