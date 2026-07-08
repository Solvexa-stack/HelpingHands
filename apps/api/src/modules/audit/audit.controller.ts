import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { AuditFiltersDto } from './dto/audit-filters.dto';

@ApiTags('Audit')
@ApiBearerAuth('JWT')
@Roles(AdminRole.administrator)
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit trail (administrator only)' })
  findAll(@Query() filters: AuditFiltersDto) {
    return this.auditService.listLogs(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Audit entry detail with before/after snapshots' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.auditService.getLog(id);
  }
}
