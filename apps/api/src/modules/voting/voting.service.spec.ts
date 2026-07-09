import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StudyStatus, VoteChoice } from '@prisma/client';
import { VotingService } from './voting.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { TenancyRepository } from '../policy/tenancy.repository';
import { GovernanceService } from '../governance/governance.service';

const mockPrisma = {
  projectStudy: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn().mockReturnValue({ op: 'projectStudy.updateMany' }),
  },
  project: {
    updateMany: jest.fn().mockReturnValue({ op: 'project.updateMany' }),
  },
  vote: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  voteRound: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockEventBus = { publish: jest.fn() };

// flag-off default: tenancy scoping is a no-op in unit tests
// W3: the study's current voting cycle
const OPEN_ROUND = { id: 77, subjectType: 'project_study', subjectId: 1, status: 'open' };
const mockGovernance = {
  latestRoundForStudy: jest.fn(),
  closeRound: jest.fn().mockResolvedValue(undefined),
};

const mockTenancy = {
  assertProjectVisible: jest.fn().mockResolvedValue(undefined),
  enforcedOrgId: jest.fn().mockResolvedValue(null),
  enforcedProjectWhere: jest.fn(async (w: any = {}) => w),
  enforcedProjectRelationWhere: jest.fn(async (w: any = {}) => w),
};

const actor = { userId: 1, referenceType: 'participant', requestId: 'unit-test', ip: null };

describe('VotingService', () => {
  let service: VotingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventBusService, useValue: mockEventBus },
        { provide: TenancyRepository, useValue: mockTenancy },
        { provide: GovernanceService, useValue: mockGovernance },
      ],
    }).compile();

    service = module.get<VotingService>(VotingService);
    mockPrisma.voteRound.findFirst.mockResolvedValue(OPEN_ROUND);
    mockGovernance.latestRoundForStudy.mockResolvedValue(OPEN_ROUND);
  });

  // ─── castVote ─────────────────────────────────────────────────────────────────

  describe('castVote', () => {
    it('throws NotFoundException when study does not exist', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue(null);

      await expect(
        service.castVote(actor, { studyId: 99, choice: VoteChoice.for }, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when study is not in voting_open status', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.published,
        votingEndsAt: null,
      });

      await expect(
        service.castVote(actor, { studyId: 1, choice: VoteChoice.for }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when voting period has ended', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: new Date('2020-01-01'), // past date
      });

      await expect(
        service.castVote(actor, { studyId: 1, choice: VoteChoice.for }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when user has already voted', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.vote.findUnique.mockResolvedValue({ id: 5, choice: VoteChoice.for });

      await expect(
        service.castVote(actor, { studyId: 1, choice: VoteChoice.against }, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a vote record when all conditions are met', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.vote.findUnique.mockResolvedValue(null);
      mockPrisma.vote.create.mockResolvedValue({
        id: 10,
        studyId: 1,
        userId: 1,
        choice: VoteChoice.for,
        comment: null,
        createdAt: new Date(),
      });

      const result = await service.castVote(actor, { studyId: 1, choice: VoteChoice.for }, 1);

      expect(mockPrisma.vote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ voteRoundId: OPEN_ROUND.id, userId: 1, choice: VoteChoice.for }),
        }),
      );
      expect(result.choice).toBe(VoteChoice.for);
      expect(result.studyId).toBe(1); // legacy contract: vote rows carry studyId
    });
  });

  // ─── changeVote ───────────────────────────────────────────────────────────────

  describe('changeVote', () => {
    it('allows changing vote while voting is open', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.vote.findUnique.mockResolvedValue({ id: 5, choice: VoteChoice.for });
      mockPrisma.vote.update.mockResolvedValue({ id: 5, choice: VoteChoice.against });

      const result = await service.changeVote(1, 1, { choice: VoteChoice.against });

      expect(mockPrisma.vote.update).toHaveBeenCalled();
      expect(result.choice).toBe(VoteChoice.against);
    });

    it('throws BadRequestException when trying to change vote after voting closed', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_closed,
        votingEndsAt: null,
      });

      await expect(
        service.changeVote(1, 1, { choice: VoteChoice.abstain }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when user has not voted yet', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.vote.findUnique.mockResolvedValue(null);

      await expect(
        service.changeVote(1, 1, { choice: VoteChoice.abstain }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getResults ───────────────────────────────────────────────────────────────

  describe('getResults', () => {
    it('returns correct percentages with votes', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.vote.groupBy.mockResolvedValue([
        { choice: VoteChoice.for, _count: { choice: 6 } },
        { choice: VoteChoice.against, _count: { choice: 3 } },
        { choice: VoteChoice.abstain, _count: { choice: 1 } },
      ]);
      mockPrisma.vote.findMany.mockResolvedValue([]);

      const result = await service.getResults(1);

      expect(result.total).toBe(10);
      expect(result.for.count).toBe(6);
      expect(result.for.percentage).toBe(60);
      expect(result.against.count).toBe(3);
      expect(result.against.percentage).toBe(30);
      expect(result.abstain.count).toBe(1);
      expect(result.abstain.percentage).toBe(10);
    });

    it('handles division by zero when no votes cast', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.vote.groupBy.mockResolvedValue([]);
      mockPrisma.vote.findMany.mockResolvedValue([]);

      const result = await service.getResults(1);

      expect(result.total).toBe(0);
      expect(result.for.percentage).toBe(0);
      expect(result.against.percentage).toBe(0);
      expect(result.abstain.percentage).toBe(0);
    });

    it('sets myVote when authenticated user has voted', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.vote.groupBy.mockResolvedValue([]);
      mockPrisma.vote.findUnique.mockResolvedValue({ choice: VoteChoice.for });
      mockPrisma.vote.findMany.mockResolvedValue([]);

      const result = await service.getResults(1, 42);

      expect(result.myVote).toBe(VoteChoice.for);
    });

    it('sets myVote to null when user has not voted', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.vote.groupBy.mockResolvedValue([]);
      mockPrisma.vote.findUnique.mockResolvedValue(null);
      mockPrisma.vote.findMany.mockResolvedValue([]);

      const result = await service.getResults(1, 42);

      expect(result.myVote).toBeNull();
    });
  });

  // ─── autoCloseExpiredVotings ──────────────────────────────────────────────────

  describe('autoCloseExpiredVotings', () => {
    it('closes expired voting_open studies', async () => {
      const expired = [
        { id: 1, projectId: 10 },
        { id: 2, projectId: 11 },
      ];
      mockPrisma.projectStudy.findMany.mockResolvedValue(expired);
      mockPrisma.$transaction.mockResolvedValue([{ count: 2 }, { count: 2 }]);

      const result = await service.autoCloseExpiredVotings();

      expect(result.closed).toBe(2);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.anything(),
          expect.anything(),
        ]),
      );
    });

    it('does nothing when no studies have expired', async () => {
      mockPrisma.projectStudy.findMany.mockResolvedValue([]);

      const result = await service.autoCloseExpiredVotings();

      expect(result.closed).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('queries studies with voting_open status and past votingEndsAt', async () => {
      mockPrisma.projectStudy.findMany.mockResolvedValue([]);

      await service.autoCloseExpiredVotings();

      expect(mockPrisma.projectStudy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: StudyStatus.voting_open,
            votingEndsAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });
  });
});
