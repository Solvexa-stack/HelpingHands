import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Public, Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { RegisterOrganizationDto } from './dto/organization.dto';
import { VerificationService } from './verification.service';

/** W6-E3 — onboarding: public registration + Board verification actions. */
@ApiTags('Organization verification')
@Controller({ path: 'organizations', version: '1' })
export class VerificationController {
  constructor(private verification: VerificationService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Self-service registration (flag-gated; pilot allowlist)' })
  register(@Body() dto: RegisterOrganizationDto, @CurrentActor() actor: ActorContext) {
    return this.verification.registerOrganization(actor, dto);
  }

  @Get(':id/verification')
  @ApiBearerAuth('JWT')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'Verification status: workflow state, documents, decisions' })
  status(@Param('id', ParseIntPipe) id: number) {
    return this.verification.status(id);
  }

  @Post(':id/verification/begin-review')
  @ApiBearerAuth('JWT')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Board: take a registration into review' })
  beginReview(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.verification.beginReview(actor, id);
  }

  @Post(':id/verification/verify')
  @ApiBearerAuth('JWT')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Board: verify (requires documents on file + approval decision)' })
  verify(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.verification.verify(actor, id);
  }

  @Post(':id/verification/reject')
  @ApiBearerAuth('JWT')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Board: reject (requires the rejected decision)' })
  reject(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.verification.reject(actor, id);
  }

  @Post(':id/verification/activate')
  @ApiBearerAuth('JWT')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Board: activate — org goes live with type-default capabilities' })
  activate(@Param('id', ParseIntPipe) id: number, @CurrentActor() actor: ActorContext) {
    return this.verification.activate(actor, id);
  }
}
