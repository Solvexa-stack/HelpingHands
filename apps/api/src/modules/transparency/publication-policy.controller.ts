import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole, PublicationVisibility } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { ActorContext } from '../../events/actor-context';
import { PublicationPolicyService } from './publication-policy.service';

class ChangeVisibilityBody {
  @IsEnum(PublicationVisibility)
  visibility: PublicationVisibility;
}

/** W7-E1-S2 — Board-controlled publication policy (changes audited). */
@ApiTags('Publication policy')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator)
@Controller({ path: 'transparency-policy', version: '1' })
export class PublicationPolicyController {
  constructor(private policy: PublicationPolicyService) {}

  @Get()
  @ApiOperation({ summary: 'Publication policy entries (Board view)' })
  list() {
    return this.policy.list();
  }

  @Patch(':fieldClass')
  @ApiOperation({ summary: 'Open or close a field class (Board; never_public is immutable)' })
  change(
    @Param('fieldClass') fieldClass: string,
    @Body() dto: ChangeVisibilityBody,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.policy.changeVisibility(actor, fieldClass, dto.visibility);
  }
}
