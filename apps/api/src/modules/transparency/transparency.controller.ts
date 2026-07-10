import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/roles.decorator';
import { PublicationPolicyService } from './publication-policy.service';
import { TransparencyReadService } from './transparency-read.service';

/**
 * W7-E1-S4 — the PUBLIC transparency surface: read-only, rate-limited
 * (ThrottlerGuard: 20/s burst, 200/min sustained per IP), cacheable, and
 * served exclusively from the read layer. Every response section traces to a
 * publication-policy field class; closed classes are omitted or refused.
 */
@ApiTags('Transparency (public)')
@Public()
@UseGuards(ThrottlerGuard)
@Controller({ path: 'transparency', version: '1' })
export class TransparencyController {
  constructor(
    private readService: TransparencyReadService,
    private policy: PublicationPolicyService,
  ) {}

  private async assertPublished(fieldClass: string): Promise<void> {
    if (!(await this.policy.isPublic(fieldClass))) {
      throw new ForbiddenException(`"${fieldClass}" is not published — Board publication policy`);
    }
  }

  @Get('stats')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Platform statistics (public read layer)' })
  async stats() {
    await this.assertPublished('platform.stats');
    return this.readService.platformStats();
  }

  @Get('funds')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Funds overview: balances and flows' })
  async funds() {
    await this.assertPublished('fund.totals');
    return this.readService.fundsOverview();
  }

  @Get('funds/:id')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Fund page: intake, allocations, spend by category' })
  async fund(@Param('id', ParseIntPipe) id: number) {
    await this.assertPublished('fund.totals');
    const aggregate = await this.readService.fundPublic(id);
    if (!(await this.policy.isPublic('fund.allocations'))) {
      const { allocations, spendByCategory, ...rest } = aggregate.data as Record<string, unknown>;
      return { ...aggregate, data: rest };
    }
    return aggregate;
  }

  @Get('projects/:id')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Project transparency: funding sources, progress, decisions, money trail' })
  async project(@Param('id', ParseIntPipe) id: number) {
    await this.assertPublished('project.funding');
    const aggregate = await this.readService.projectPublic(id);
    const data = { ...(aggregate.data as Record<string, unknown>) };
    if (!(await this.policy.isPublic('project.spend'))) delete data.moneyTrail;
    if (!(await this.policy.isPublic('project.decisions'))) delete data.decisions;
    return { ...aggregate, data };
  }

  @Get('organizations')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Active organizations directory' })
  async organizations() {
    await this.assertPublished('org.portfolio');
    return this.readService.organizationsDirectory();
  }

  @Get('organizations/:id')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Organization public page: profile, verified badge, portfolio' })
  async organization(@Param('id', ParseIntPipe) id: number) {
    await this.assertPublished('org.portfolio');
    return this.readService.orgPublic(id);
  }

  @Get('decisions')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Board decision registry (no member identities)' })
  async decisions(@Query('limit') limit?: string) {
    await this.assertPublished('project.decisions');
    return this.readService.decisionRegistry(Math.min(Number(limit) || 100, 200));
  }
}
