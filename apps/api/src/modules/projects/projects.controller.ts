import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { ActorContext } from '../../events/actor-context';

@ApiTags('Projects')
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all projects with filters' })
  findAll(@Query() query: ProjectQueryDto) {
    return this.projectsService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get project details' })
  findOne(@Param('id', ParseIntPipe) id: number, @Query('lang') lang?: string) {
    return this.projectsService.findById(id, lang);
  }

  @Post()
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new project' })
  create(@Body() dto: CreateProjectDto, @CurrentActor() actor: ActorContext) {
    return this.projectsService.create(actor, dto);
  }

  @Put(':id')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update project' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.projectsService.update(actor, id, dto);
  }

  @Delete(':id')
  @Roles(AdminRole.administrator)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete project (admin only)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(id);
  }

  @Patch(':id/assign-officer')
  @Roles(AdminRole.administrator)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Assign financial officer to project' })
  assignOfficer(
    @Param('id', ParseIntPipe) id: number,
    @Body('officerId', ParseIntPipe) officerId: number,
  ) {
    return this.projectsService.assignFinancialOfficer(id, officerId);
  }
}
