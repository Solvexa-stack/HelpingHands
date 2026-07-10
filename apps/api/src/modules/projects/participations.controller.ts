import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole, ParticipationRole } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { ActorContext } from '../../events/actor-context';
import { ParticipationsService } from './participations.service';

class AddParticipationDto {
  @IsInt()
  organizationId: number;

  @IsEnum(ParticipationRole)
  role: ParticipationRole;

  @IsOptional()
  @IsString()
  notes?: string;
}

class GrantProjectRoleDto {
  @IsInt()
  userId: number;

  @IsString()
  role: string;
}

/** W6-E1-S1/E5-S1 — joint-project participations + project-scope grants. */
@ApiTags('Project participations')
@ApiBearerAuth('JWT')
@Controller({ path: 'projects/:projectId/participations', version: '1' })
export class ParticipationsController {
  constructor(private participations: ParticipationsService) {}

  @Get()
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Participating organizations of a project' })
  list(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.participations.list(projectId);
  }

  @Post()
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Add a participating organization (owner org / Board)' })
  add(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: AddParticipationDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.participations.addParticipation(actor, projectId, dto);
  }

  @Post(':participationId/end')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'End a participation (history preserved)' })
  end(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('participationId', ParseIntPipe) participationId: number,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.participations.endParticipation(actor, projectId, participationId);
  }

  @Get('assignable-users')
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Assignee picker: owner-org members + project-scope grant holders' })
  assignable(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.participations.assignableUsers(projectId);
  }

  @Post('grants')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Grant a project-scope role (project_lead | contributor | financial_delegate)' })
  grant(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: GrantProjectRoleDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.participations.grantProjectRole(actor, projectId, dto);
  }

  @Delete('grants/:userId/:role')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Revoke a project-scope role' })
  revoke(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('role') role: string,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.participations.revokeProjectRole(actor, projectId, userId, role);
  }
}
