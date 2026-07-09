import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorContext } from '../../events/actor-context';
import { OrganizationsService } from './organizations.service';
import {
  AddMemberDto,
  CapabilitiesDto,
  CreateOrganizationDto,
  OrganizationQueryDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';

/** Platform-internal this wave (W1-E2): administrators only. */
@ApiTags('Organizations')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator)
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an organization (platform-internal)' })
  create(@Body() dto: CreateOrganizationDto, @CurrentActor() actor: ActorContext) {
    return this.organizationsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations' })
  findAll(@Query() query: OrganizationQueryDto) {
    return this.organizationsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Organization detail with members' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.organizationsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an organization' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.organizationsService.update(actor, id, dto);
  }

  @Patch(':id/capabilities')
  @ApiOperation({ summary: 'Set organization capabilities (audited with snapshots)' })
  setCapabilities(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CapabilitiesDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.organizationsService.setCapabilities(actor, id, dto);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List organization members' })
  listMembers(@Param('id', ParseIntPipe) id: number) {
    return this.organizationsService.listMembers(id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member' })
  addMember(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddMemberDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.organizationsService.addMember(actor, id, dto);
  }

  @Post(':id/invite-admin')
  @ApiOperation({ summary: 'Invite the first org_admin (account + membership + grant, audited)' })
  inviteFirstAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { email: string; firstName: string; lastName: string },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.organizationsService.inviteFirstAdmin(actor, id, dto);
  }

  @Post(':id/members/:userId/roles')
  @ApiOperation({ summary: 'Grant an org-scoped role (audited)' })
  grantRole(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body('role') role: string,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.organizationsService.grantRole(actor, id, userId, role);
  }

  @Delete(':id/members/:userId/roles/:role')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an org-scoped role (audited)' })
  revokeRole(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('role') role: string,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.organizationsService.revokeRole(actor, id, userId, role);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member' })
  removeMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.organizationsService.removeMember(actor, id, userId);
  }
}
