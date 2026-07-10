import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createSoftDeleteMiddleware } from './soft-delete.middleware';
import { createStudyVoteFreezeMiddleware } from './study-vote-freeze.middleware';
import { createProjectTransactionFreezeMiddleware } from './project-transaction-freeze.middleware';
import { createCategoryEnumFreezeMiddleware } from './category-enum-freeze.middleware';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
    // W0-E4-S2: soft-delete behavior for domain models, dark until
    // SOFT_DELETE_ENFORCED=true (flag read per query).
    this.$use(createSoftDeleteMiddleware());
    // W3-E3-S2: StudyVote frozen read-only after the VoteRound/Vote cutover
    this.$use(createStudyVoteFreezeMiddleware());
    // W5-E4-S3: ProjectTransaction frozen — treasury dual-write only
    this.$use(createProjectTransactionFreezeMiddleware());
    // W6-E2-S1: legacy category enum columns frozen — categoryId is the truth
    this.$use(createCategoryEnumFreezeMiddleware());
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
