import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole, FundingAgreementStatus } from '@prisma/client';
import { IsEnum, IsInt, IsISO8601, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { AgreementsService } from './agreements.service';

class CreateAgreementBody {
  @IsInt()
  organizationId: number;

  @IsString()
  @MinLength(3)
  title: string;

  @IsOptional()
  @IsObject()
  terms?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  reportingSchedule?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

class AgreementStatusBody {
  @IsEnum(FundingAgreementStatus)
  status: FundingAgreementStatus;
}

/**
 * W6-E1-S2 — funding agreements (fund ↔ organization). NOTE: this controller
 * must register BEFORE FundsController so `funds/agreements/:agreementId`
 * is not swallowed by `funds/:id`.
 */
@ApiTags('Funding agreements')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator)
@Controller({ path: 'funds', version: '1' })
export class AgreementsController {
  constructor(private agreements: AgreementsService) {}

  @Get('agreements/:agreementId')
  @ApiOperation({ summary: 'Agreement detail incl. obligations and overdue flags' })
  detail(@Param('agreementId', ParseIntPipe) agreementId: number) {
    return this.agreements.detail(agreementId);
  }

  @Post('agreements/:agreementId/sign')
  @ApiOperation({ summary: 'Sign a draft agreement — activates it, obligations accrue' })
  sign(@Param('agreementId', ParseIntPipe) agreementId: number, @CurrentActor() actor: ActorContext) {
    return this.agreements.sign(actor, agreementId);
  }

  @Patch('agreements/:agreementId/status')
  @ApiOperation({ summary: 'Suspend / resume / complete / terminate an agreement' })
  setStatus(
    @Param('agreementId', ParseIntPipe) agreementId: number,
    @Body() dto: AgreementStatusBody,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.agreements.setStatus(actor, agreementId, dto.status);
  }

  @Post(':id/agreements')
  @ApiOperation({ summary: 'Create a funding agreement with an organization (Board)' })
  create(
    @Param('id', ParseIntPipe) fundId: number,
    @Body() dto: CreateAgreementBody,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.agreements.createAgreement(actor, fundId, dto);
  }

  @Get(':id/agreements')
  @ApiOperation({ summary: 'Agreements of a fund' })
  list(@Param('id', ParseIntPipe) fundId: number) {
    return this.agreements.listForFund(fundId);
  }
}

/** Org-side read: the counterpart org sees its own agreements. */
@ApiTags('Funding agreements')
@ApiBearerAuth('JWT')
@Controller({ path: 'organizations/:id/agreements', version: '1' })
export class OrgAgreementsController {
  constructor(private agreements: AgreementsService) {}

  @Get()
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiOperation({ summary: 'Agreements of an organization (own workspace or Board)' })
  list(@Param('id', ParseIntPipe) organizationId: number) {
    return this.agreements.listForOrg(organizationId);
  }
}
