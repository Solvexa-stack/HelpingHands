import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { LanguagesService } from './languages.service';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto';
import { Roles, Public } from '../../common/decorators/roles.decorator';

@ApiTags('Languages')
@Controller({ path: 'languages', version: '1' })
export class LanguagesController {
  constructor(private languagesService: LanguagesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all active languages' })
  findAll(@Query('all') all?: string) {
    return this.languagesService.findAll(all !== 'true');
  }

  @Public()
  @Get(':code')
  @ApiOperation({ summary: 'Get language by code' })
  findOne(@Param('code') code: string) {
    return this.languagesService.findByCode(code);
  }

  @Post()
  @Roles(AdminRole.administrator)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new language (admin only)' })
  create(@Body() dto: CreateLanguageDto) {
    return this.languagesService.create(dto);
  }

  @Put(':code')
  @Roles(AdminRole.administrator)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update language' })
  update(@Param('code') code: string, @Body() dto: UpdateLanguageDto) {
    return this.languagesService.update(code, dto);
  }

  @Patch(':code/toggle')
  @Roles(AdminRole.administrator)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Toggle language active status' })
  toggleActive(@Param('code') code: string) {
    return this.languagesService.toggleActive(code);
  }

  @Delete(':code')
  @Roles(AdminRole.administrator)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a language' })
  remove(@Param('code') code: string) {
    return this.languagesService.remove(code);
  }
}
