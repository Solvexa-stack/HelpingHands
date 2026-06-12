import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StudyStatus, VoteChoice } from '@prisma/client';
import { VotingService } from './voting.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  projectStudy: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  project: {
    updateMany: jest.fn(),
  },
  studyVote: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('VotingService', () => {
  let service: VotingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<VotingService>(VotingService);
  });

  // ─── castVote ─────────────────────────────────────────────────────────────────

  describe('castVote', () => {
    it('throws NotFoundException when study does not exist', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue(null);

      await expect(
        service.castVote({ studyId: 99, choice: VoteChoice.for }, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when study is not in voting_open status', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.published,
        votingEndsAt: null,
      });

      await expect(
        service.castVote({ studyId: 1, choice: VoteChoice.for }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when voting period has ended', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: new Date('2020-01-01'), // past date
      });

      await expect(
        service.castVote({ studyId: 1, choice: VoteChoice.for }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when user has already voted', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.studyVote.findUnique.mockResolvedValue({ id: 5, choice: VoteChoice.for });

      await expect(
        service.castVote({ studyId: 1, choice: VoteChoice.against }, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a vote record when all conditions are met', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.studyVote.findUnique.mockResolvedValue(null);
      mockPrisma.studyVote.create.mockResolvedValue({
        id: 10,
        studyId: 1,
        userId: 1,
        choice: VoteChoice.for,
        comment: null,
        createdAt: new Date(),
      });

      const result = await service.castVote({ studyId: 1, choice: VoteChoice.for }, 1);

      expect(mockPrisma.studyVote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ studyId: 1, userId: 1, choice: VoteChoice.for }),
        }),
      );
      expect(result.choice).toBe(VoteChoice.for);
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
      mockPrisma.studyVote.findUnique.mockResolvedValue({ id: 5, choice: VoteChoice.for });
      mockPrisma.studyVote.update.mockResolvedValue({ id: 5, choice: VoteChoice.against });

      const result = await service.changeVote(1, 1, { choice: VoteChoice.against });

      expect(mockPrisma.studyVote.update).toHaveBeenCalled();
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
      mockPrisma.studyVote.findUnique.mockResolvedValue(null);

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
      mockPrisma.studyVote.groupBy.mockResolvedValue([
        { choice: VoteChoice.for, _count: { choice: 6 } },
        { choice: VoteChoice.against, _count: { choice: 3 } },
        { choice: VoteChoice.abstain, _count: { choice: 1 } },
      ]);
      mockPrisma.studyVote.findMany.mockResolvedValue([]);

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
      mockPrisma.studyVote.groupBy.mockResolvedValue([]);
      mockPrisma.studyVote.findMany.mockResolvedValue([]);

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
      mockPrisma.studyVote.groupBy.mockResolvedValue([]);
      mockPrisma.studyVote.findUnique.mockResolvedValue({ choice: VoteChoice.for });
      mockPrisma.studyVote.findMany.mockResolvedValue([]);

      const result = await service.getResults(1, 42);

      expect(result.myVote).toBe(VoteChoice.for);
    });

    it('sets myVote to null when user has not voted', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue({
        id: 1,
        status: StudyStatus.voting_open,
        votingEndsAt: null,
      });
      mockPrisma.studyVote.groupBy.mockResolvedValue([]);
      mockPrisma.studyVote.findUnique.mockResolvedValue(null);
      mockPrisma.studyVote.findMany.mockResolvedValue([]);

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
