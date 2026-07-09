import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { TenancyRepository } from '../policy/tenancy.repository';
import { WorkflowService } from './workflow.service';

/**
 * W4-E5 read surface: definitions (viewer) and per-project instance detail
 * (timeline + availableTransitions). Transitions themselves are executed
 * through the owning services' existing endpoints — the engine has no public
 * write route this wave.
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
}
