import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { CreateRecipientDto, UpdateRecipientDto } from './dto/recipient.dto';
import { RecipientsService } from './recipients.service';

/** W8 — expense payees: person/company/organization, optionally cross-referenced to a known platform Organization. */
@ApiTags('Recipients')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
@Controller({ path: 'recipients', version: '1' })
export class RecipientsController {
  constructor(private recipientsService: RecipientsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a recipient' })
  create(@Body() dto: CreateRecipientDto, @CurrentActor() actor: ActorContext) {
    return this.recipientsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List recipients' })
  list() {
    return this.recipientsService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Recipient detail' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.recipientsService.detail(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a recipient' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRecipientDto, @CurrentActor() actor: ActorContext) {
    return this.recipientsService.update(actor, id, dto);
  }
}
