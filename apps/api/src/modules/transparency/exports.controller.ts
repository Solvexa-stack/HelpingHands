import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { Public, Roles } from '../../common/decorators/roles.decorator';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { ActorContext } from '../../events/actor-context';
import { PrismaService } from '../../prisma/prisma.service';
import { TenancyRepository } from '../policy/tenancy.repository';
import { TreasuryService } from '../treasury/treasury.service';
import { PublicationPolicyService } from './publication-policy.service';
import { TransparencyReadService } from './transparency-read.service';
import { toCsv } from './csv.util';

/**
 * W7-E4-S1 — statement exports from ledger queries. The PUBLIC fund statement
 * serves aggregate money movements (descriptions carry ids, never donor
 * identities); project statements and org summaries are workspace detail.
 * All CSVs derive from the same treasury/read-layer queries the dashboards
 * use, so exports reconcile with W5 balances by construction.
 */
@ApiTags('Transparency exports')
@Controller({ path: 'transparency/exports', version: '1' })
export class ExportsController {
  constructor(
    private prisma: PrismaService,
    private treasury: TreasuryService,
    private readService: TransparencyReadService,
    private tenancy: TenancyRepository,
    private policy: PublicationPolicyService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Get('funds/:id/statement.csv')
  @ApiOperation({ summary: 'Fund statement (public — policy fund.totals)' })
  async fundStatement(@Param('id', ParseIntPipe) fundId: number, @Res() res: Response): Promise<void> {
    if (!(await this.policy.isPublic('fund.totals'))) {
      throw new ForbiddenException('"fund.totals" is not published — Board publication policy');
    }
    const fund = await this.prisma.fund.findFirst({ where: { id: fundId, deletedAt: null } });
    if (!fund) throw new NotFoundException(`Fund #${fundId} not found`);
    const account = await this.treasury.fundAccount(fundId, fund.name);
    const statement = await this.treasury.statement(account.id);
    sendCsv(res, `fund-${fundId}-statement.csv`, statementCsv(statement.entries), 'public, max-age=60');
  }

  @Get('projects/:id/statement.csv')
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Project financial statement (workspace detail)' })
  async projectStatement(@Param('id', ParseIntPipe) projectId: number, @Res() res: Response): Promise<void> {
    await this.tenancy.assertProjectVisible(projectId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new NotFoundException(`Project #${projectId} not found`);
    const account = await this.treasury.projectAccount(projectId);
    const statement = await this.treasury.statement(account.id);
    sendCsv(res, `project-${projectId}-statement.csv`, statementCsv(statement.entries));
  }

  @Get('organizations/:id/summary.csv')
  @Roles(AdminRole.administrator, AdminRole.employee, AdminRole.financial_officer)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Organization annual summary (workspace detail)' })
  async orgSummary(
    @Param('id', ParseIntPipe) orgId: number,
    @CurrentActor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    // own workspace or platform (Board) only
    if (actor.activeOrgId != null && actor.activeOrgId !== orgId) {
      throw new ForbiddenException('You can only export your active organization');
    }
    const aggregate = await this.readService.orgPublic(orgId);
    const portfolio = aggregate.data.portfolio;
    const csv = toCsv(
      ['project_id', 'project', 'category', 'target', 'collected', 'progression_percent', 'completed'],
      portfolio.map((p) => [
        p.id,
        p.names.find((n: { languageCode: string; name: string }) => n.languageCode === 'en')?.name ?? `#${p.id}`,
        (p.category as { key?: string } | null)?.key ?? '',
        p.target,
        p.collected,
        p.progression,
        p.isCompleted ? 'yes' : 'no',
      ]),
    );
    sendCsv(res, `organization-${orgId}-summary.csv`, csv);
  }
}

interface StatementRow {
  timestamp: Date | string;
  description: string;
  direction: string;
  amount: number;
  runningBalance: number;
}

function statementCsv(entries: StatementRow[]): string {
  return toCsv(
    ['date', 'description', 'direction', 'amount', 'running_balance'],
    entries.map((e) => [new Date(e.timestamp).toISOString(), e.description, e.direction, e.amount, e.runningBalance]),
  );
}

/** CSV responses go out raw — @Res() bypasses the JSON envelope interceptor. */
function sendCsv(res: Response, filename: string, csv: string, cacheControl = 'no-store'): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', cacheControl);
  res.send(csv);
}
