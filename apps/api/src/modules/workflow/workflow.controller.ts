import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { TenancyRepository } from '../policy/tenancy.repository';
import { WorkflowService } from './workflow.service';

/**
 * W4-E5 read surface: definitions (viewer) and per-project instance detail
 * (timeline + availableTransitions). Legacy-synced transitions are executed
 * through the owning services' endpoints; W6 adds ONE narrow write route for
 * engine-native actions that have no legacy column semantics (emergency-relief
 * stations, v2 begin_execution/send_to_board) — guards still decide.
 */
@ApiTags('Workflow')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
@Controller({ path: 'workflow', version: '1' })
export class WorkflowController {
  constructor(
    private workflowService: WorkflowService,
    private tenancy: TenancyRepository,
  ) {}

  /** Actions executable via the generic route, per definition key. Anything
   *  else carries legacy column sync and must go through its owning service. */
  private static readonly ENGINE_NATIVE_ACTIONS: Record<string, string[]> = {
    'emergency-relief': ['submit', 'approve', 'reject', 'begin_execution', 'complete'],
    'project-lifecycle': ['send_to_board', 'begin_execution'],
  };

  @Get('definitions')
  @ApiOperation({ summary: 'List workflow definitions and versions (viewer)' })
  listDefinitions() {
    return this.workflowService.listDefinitions();
  }

  @Get('definitions/:id')
  @ApiOperation({ summary: 'Definition detail: states + transitions graph' })
  definitionDetail(@Param('id', ParseIntPipe) id: number) {
    return this.workflowService.definitionDetail(id);
  }

  @Get('projects/:projectId')
  @ApiOperation({ summary: 'Project instance: state, step log, available transitions for the caller' })
  async projectInstance(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentActor() actor: ActorContext,
  ) {
    await this.tenancy.assertProjectVisible(projectId); // W2 isolation
    const subject = { subjectType: 'project', subjectId: projectId };
    const instance = await this.workflowService.instanceDetail(subject);
    const transitions = await this.workflowService.availableTransitions(actor, subject);
    return { ...instance, availableTransitions: transitions };
  }

  @Post('projects/:projectId/execute')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Execute an engine-native action (W6: emergency-relief, v2 execution)' })
  async execute(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: { action: string; note?: string },
    @CurrentActor() actor: ActorContext,
  ) {
    await this.tenancy.assertProjectVisible(projectId);
    const subject = { subjectType: 'project', subjectId: projectId };
    const instance = await this.workflowService.instanceFor(subject);
    if (!instance) throw new NotFoundException(`No workflow instance for project #${projectId}`);
    const allowed = WorkflowController.ENGINE_NATIVE_ACTIONS[instance.definition.key] ?? [];
    if (!dto.action || !allowed.includes(dto.action)) {
      throw new BadRequestException(
        `Action "${dto.action}" is not engine-native for "${instance.definition.key}" — use the owning endpoint`,
      );
    }
    const result = await this.workflowService.execute(actor, subject, dto.action, {
      note: dto.note,
      // completing an engine-native lifecycle keeps the legacy flag honest
      sync:
        dto.action === 'complete'
          ? async (tx) => {
              await tx.project.update({ where: { id: projectId }, data: { isCompleted: true } });
            }
          : undefined,
    });
    return result;
  }
}
