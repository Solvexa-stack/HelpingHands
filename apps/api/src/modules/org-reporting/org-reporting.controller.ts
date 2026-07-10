import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole, OrgReportStatus, OrgReportType } from '@prisma/client';
import { IsEnum, IsInt, IsISO8601, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { ActorContext } from '../../events/actor-context';
import { OrgReportingService } from './org-reporting.service';

class SubmitReportBody {
  @IsEnum(OrgReportType)
  type: OrgReportType;

  @IsString()
  @MinLength(3)
  title: string;

  @IsOptional()
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsInt()
  fundingAgreementId?: number;

  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @IsOptional()
  @IsISO8601()
  periodEnd?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

class ResubmitBody {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @IsOptional()
  @IsISO8601()
  periodEnd?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

class ReviewBody {
  @IsOptional()
  @IsString()
  note?: string;
}

/** W6-E6 — org side: compose/submit reports, track statuses. */
@ApiTags('Organization reporting')
@ApiBearerAuth('JWT')
@Controller({ path: 'organizations/:id/reports', version: '1' })
export class OrgReportsController {
  constructor(private reporting: OrgReportingService) {}

  @Post()
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Submit a progress or financial report' })
  submit(
    @Param('id', ParseIntPipe) organizationId: number,
    @Body() dto: SubmitReportBody,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.reporting.submitReport(actor, organizationId, dto);
  }

  @Get()
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Reports of an organization' })
  list(
    @Param('id', ParseIntPipe) organizationId: number,
    @Query('status') status?: OrgReportStatus,
  ) {
    return this.reporting.listForOrg(organizationId, status);
  }
}

/** W6-E6 — review side: Board queue + accept/return lifecycle. */
@ApiTags('Organization reporting')
@ApiBearerAuth('JWT')
@Controller({ path: 'org-reports', version: '1' })
export class ReportReviewController {
  constructor(private reporting: OrgReportingService) {}

  @Get('queue')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Board inbox: submitted reports + overdue obligations' })
  queue() {
    return this.reporting.queue();
  }

  @Post(':id/begin-review')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Take a submitted report into review' })
  beginReview(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.reporting.beginReview(actor, id);
  }

  @Post(':id/accept')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Accept a report' })
  accept(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewBody,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.reporting.accept(actor, id, dto.note);
  }

  @Post(':id/return')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Return a report with comments' })
  return(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewBody,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.reporting.returnWithComments(actor, id, dto.note ?? '');
  }

  @Post(':id/resubmit')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Resubmit a returned report after corrections' })
  resubmit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResubmitBody,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.reporting.resubmit(actor, id, dto);
  }
}
