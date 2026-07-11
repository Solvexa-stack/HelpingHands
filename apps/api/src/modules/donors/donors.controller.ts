import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { CreateDonorDto, UpdateDonorDto } from './dto/donor.dto';
import { DonorsService } from './donors.service';

/**
 * W8 — donor master data. Legacy fallback administrator-only; with the
 * policy engine (default-on, see policy-registry.ts) fund officers and the
 * Board are the actual enforcers via `donor.manage` / `donor.read`.
 */
@ApiTags('Donors')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator)
@Controller({ path: 'donors', version: '1' })
export class DonorsController {
  constructor(private donorsService: DonorsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a donor' })
  create(@Body() dto: CreateDonorDto, @CurrentActor() actor: ActorContext) {
    return this.donorsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List donors' })
  list() {
    return this.donorsService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Donor detail' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.donorsService.detail(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a donor' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDonorDto, @CurrentActor() actor: ActorContext) {
    return this.donorsService.update(actor, id, dto);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Donor report: donations made, projects funded, spending details' })
  report(@Param('id', ParseIntPipe) id: number) {
    return this.donorsService.report(id);
  }
}
