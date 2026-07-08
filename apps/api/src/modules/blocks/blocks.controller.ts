import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { BlocksService } from './blocks.service';
import { CreateBlockDto, UpdateBlockDto, BlockQueryDto } from './dto/block.dto';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { ActorContext } from '../../events/actor-context';

@ApiTags('Blocks')
@Controller({ path: 'blocks', version: '1' })
export class BlocksController {
  constructor(private blocksService: BlocksService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List content blocks with filtering' })
  findAll(@Query() query: BlockQueryDto) {
    return this.blocksService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get block by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.blocksService.findById(id);
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get block by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.blocksService.findBySlug(slug);
  }

  @Post()
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create content block' })
  create(@Body() dto: CreateBlockDto) {
    return this.blocksService.create(dto);
  }

  @Put(':id')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update content block' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBlockDto) {
    return this.blocksService.update(id, dto);
  }

  @Patch(':id/toggle')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Toggle block active status' })
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.blocksService.toggleActive(id);
  }

  @Delete(':id')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete content block' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.blocksService.remove(actor, id);
  }
}
