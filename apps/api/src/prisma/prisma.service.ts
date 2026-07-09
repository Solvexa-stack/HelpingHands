import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createSoftDeleteMiddleware } from './soft-delete.middleware';
import { createStudyVoteFreezeMiddleware } from './study-vote-freeze.middleware';

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
