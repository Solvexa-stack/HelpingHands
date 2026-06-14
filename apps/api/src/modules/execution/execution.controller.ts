import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { ExecutionService } from './execution.service';
import {
  CreateStepDto, UpdateStepDto, UpdateProgressDto,
  CreatePhaseDto, UpdatePhaseDto,
  CreateTaskDto, UpdateTaskDto,
} from './dto/execution.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Execution')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator, AdminRole.employee)
@Controller({ path: 'projects/:projectId/execution', version: '1' })
export class ExecutionController {
  constructor(private executionService: ExecutionService) {}

  // ─── Steps ────────────────────────────────────────────────────────────────

  @Get('steps')
  @ApiOperation({ summary: 'List project steps' })
  findSteps(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.executionService.findSteps(projectId);
  }

  @Post('steps')
  @ApiOperation({ summary: 'Create a step' })
  createStep(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateStepDto,
  ) {
    return this.executionService.createStep(projectId, dto);
  }

  @Patch('steps/:id')
  @ApiOperation({ summary: 'Update a step' })
  updateStep(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStepDto,
  ) {
    return this.executionService.updateStep(projectId, id, dto);
  }

  @Patch('steps/:id/progress')
  @ApiOperation({ summary: 'Update step progress (0-100)' })
  updateStepProgress(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.executionService.updateStepProgress(projectId, id, dto);
  }

  @Delete('steps/:id')
  @ApiOperation({ summary: 'Delete a step' })
  removeStep(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.executionService.removeStep(projectId, id);
  }

  // ─── Phases ───────────────────────────────────────────────────────────────

  @Get('phases')
  @ApiOperation({ summary: 'List project phases' })
  findPhases(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.executionService.findPhases(projectId);
  }

  @Post('phases')
  @ApiOperation({ summary: 'Create a phase' })
  createPhase(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreatePhaseDto,
  ) {
    return this.executionService.createPhase(projectId, dto);
  }

  @Patch('phases/:id')
  @ApiOperation({ summary: 'Update a phase' })
  updatePhase(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePhaseDto,
  ) {
    return this.executionService.updatePhase(projectId, id, dto);
  }

  @Delete('phases/:id')
  @ApiOperation({ summary: 'Delete a phase' })
  removePhase(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.executionService.removePhase(projectId, id);
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  @Get('tasks')
  @ApiOperation({ summary: 'List project tasks' })
  findTasks(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('phaseId') phaseId?: string,
  ) {
    return this.executionService.findTasks(projectId, phaseId ? +phaseId : undefined);
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Create a task' })
  createTask(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateTaskDto,
  ) {
    return this.executionService.createTask(projectId, dto);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Update a task' })
  updateTask(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.executionService.updateTask(projectId, id, dto);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Delete a task' })
  removeTask(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.executionService.removeTask(projectId, id);
  }
}
