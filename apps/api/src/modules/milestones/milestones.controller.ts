import {
  Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { MilestonesService } from './milestones.service';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/milestone.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Milestones')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator, AdminRole.employee)
@Controller({ path: 'projects/:projectId/milestones', version: '1' })
export class MilestonesController {
  constructor(private milestonesService: MilestonesService) {}

  @Get()
  @ApiOperation({ summary: 'List project milestones' })
  findAll(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.milestonesService.findAll(projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a milestone' })
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.milestonesService.create(projectId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a milestone' })
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.milestonesService.update(projectId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a milestone' })
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.milestonesService.remove(projectId, id);
  }
}
