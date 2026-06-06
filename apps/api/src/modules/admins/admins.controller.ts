import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { AdminsService } from './admins.service';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Admins')
@Controller({ path: 'admins', version: '1' })
@ApiBearerAuth('JWT')
export class AdminsController {
  constructor(private adminsService: AdminsService) {}

  @Get()
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'List all admins' })
  @ApiQuery({ name: 'role', enum: AdminRole, required: false })
  findAll(@Query() query: PaginationDto, @Query('role') role?: AdminRole) {
    return this.adminsService.findAll(query, role);
  }

  @Get('financial-officers')
  @Roles(AdminRole.administrator, AdminRole.employee)
  @ApiOperation({ summary: 'List all financial officers' })
  findFinancialOfficers() {
    return this.adminsService.findFinancialOfficers();
  }

  @Get(':id')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Get admin by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.adminsService.findById(id);
  }

  @Post()
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Create new admin/employee/financial officer' })
  create(@Body() dto: CreateAdminDto, @CurrentUser('role') role: AdminRole) {
    return this.adminsService.create(dto, role);
  }

  @Put(':id')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Update admin account' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminDto,
    @CurrentUser('role') role: AdminRole,
  ) {
    return this.adminsService.update(id, dto, role);
  }

  @Patch(':id/toggle-active')
  @Roles(AdminRole.administrator)
  @ApiOperation({ summary: 'Toggle admin active status' })
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.adminsService.toggleActive(id);
  }
}
