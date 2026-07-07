import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminRole, SectionStatus, StudyStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { StudyService } from './study.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockPrisma = {
  project: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  projectStudy: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  studyDepartmentTemplate: { findMany: jest.fn() },
  studySection: {
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  studySectionFile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  studyVote: { groupBy: jest.fn() },
  $transaction: jest.fn(),
};

describe('StudyService', () => {
  let service: StudyService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudyService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:4000') },
        },
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<StudyService>(StudyService);
  });

  // ─── createStudy ─────────────────────────────────────────────────────────────

  describe('createStudy', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      await expect(service.createStudy({ projectId: 99 }, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when project already has a study', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 1, category: 'agricultural' });
      mockPrisma.projectStudy.findUnique.mockResolvedValue({ id: 5 });

      await expect(service.createStudy({ projectId: 1 }, 1)).rejects.toThrow(BadRequestException);
    });

    it('creates study with sections from templates', async () => {
      const fakeProject = { id: 1, category: 'agricultural' };
      const fakeTemplates = [
        { id: 1, name: 'Soil Study', description: null, order: 1, isRequired: true },
        { id: 2, name: 'Water Access', description: null, order: 2, isRequired: true },
      ];
      const fakeStudy = {
        id: 10,
        projectId: 1,
        status: StudyStatus.draft,
        sections: [],
        createdBy: { id: 1, firstName: 'Admin', lastName: 'Test' },
      };

      mockPrisma.project.findUnique.mockResolvedValue(fakeProject);
      mockPrisma.projectStudy.findUnique.mockResolvedValue(null);
      mockPrisma.studyDepartmentTemplate.findMany.mockResolvedValue(fakeTemplates);
      mockPrisma.projectStudy.create.mockResolvedValue(fakeStudy);
      mockPrisma.project.update.mockResolvedValue({});

      const result = await service.createStudy({ projectId: 1 }, 1);

      expect(mockPrisma.projectStudy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: StudyStatus.draft, createdById: 1 }),
        }),
      );
      expect(result.votesSummary).toEqual({ for: 0, against: 0, abstain: 0, total: 0 });
    });
  });

  // ─── changeStatus ─────────────────────────────────────────────────────────────

  describe('changeStatus', () => {
    const draftStudy = { id: 1, projectId: 5, status: StudyStatus.draft };

    it('allows draft → in_review transition for an employee', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue(draftStudy);
      mockPrisma.$transaction.mockResolvedValue([
        { ...draftStudy, status: StudyStatus.in_review },
        {},
      ]);

      await service.changeStatus(1, { status: StudyStatus.in_review }, 1, AdminRole.employee);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('rejects invalid transition draft → approved', async () => {
      mockPrisma.projectStudy.findUnique.mockResolvedValue(draftStudy);

      await expect(
        service.changeStatus(1, { status: StudyStatus.approved }, 1, AdminRole.administrator),
      ).rejects.toThrow(BadRequestException);
    });

    it('forbids non-admin from doing in_review → published', async () => {
      const reviewStudy = { id: 1, projectId: 5, status: StudyStatus.in_review };
      mockPrisma.projectStudy.findUnique.mockResolvedValue(reviewStudy);

      await expect(
        service.changeStatus(
          1,
          { status: StudyStatus.published },
          2,
          AdminRole.employee,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('requires rejectionReason when rejecting', async () => {
      const closedStudy = { id: 1, projectId: 5, status: StudyStatus.voting_closed };
      mockPrisma.projectStudy.findUnique.mockResolvedValue(closedStudy);

      await expect(
        service.changeStatus(1, { status: StudyStatus.rejected }, 1, AdminRole.administrator),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateSection ────────────────────────────────────────────────────────────

  describe('updateSection', () => {
    it('auto-transitions study to in_review when all required sections are completed', async () => {
      const mockSection = {
        id: 1,
        studyId: 1,
        assignedTo: 2,
        isRequired: true,
        study: { id: 1, projectId: 5, status: StudyStatus.draft },
      };

      mockPrisma.studySection.findUnique.mockResolvedValue(mockSection);
      mockPrisma.studySection.update.mockResolvedValue({
        ...mockSection,
        status: SectionStatus.completed,
      });
      mockPrisma.studySection.count.mockResolvedValue(0); // all required are done
      mockPrisma.projectStudy.update.mockResolvedValue({});
      mockPrisma.project.update.mockResolvedValue({});

      await service.updateSection(1, { status: SectionStatus.completed }, 2, AdminRole.employee);

      expect(mockPrisma.projectStudy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: StudyStatus.in_review }),
        }),
      );
    });

    it('does NOT auto-transition when required sections are still pending', async () => {
      const mockSection = {
        id: 1,
        studyId: 1,
        assignedTo: 2,
        study: { id: 1, projectId: 5, status: StudyStatus.draft },
      };

      mockPrisma.studySection.findUnique.mockResolvedValue(mockSection);
      mockPrisma.studySection.update.mockResolvedValue({
        ...mockSection,
        status: SectionStatus.completed,
      });
      mockPrisma.studySection.count.mockResolvedValue(3); // 3 still pending

      await service.updateSection(1, { status: SectionStatus.completed }, 2, AdminRole.employee);

      expect(mockPrisma.projectStudy.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when employee is not assigned to section', async () => {
      const mockSection = {
        id: 1,
        studyId: 1,
        assignedTo: 999,
        study: { id: 1, projectId: 5, status: StudyStatus.draft },
      };

      mockPrisma.studySection.findUnique.mockResolvedValue(mockSection);

      await expect(
        service.updateSection(1, { content: 'test' }, 2, AdminRole.employee),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows administrator to update any section regardless of assignment', async () => {
      const mockSection = {
        id: 1,
        studyId: 1,
        assignedTo: 999,
        study: { id: 1, projectId: 5, status: StudyStatus.draft },
      };

      mockPrisma.studySection.findUnique.mockResolvedValue(mockSection);
      mockPrisma.studySection.update.mockResolvedValue({ ...mockSection, content: 'updated' });
      mockPrisma.studySection.count.mockResolvedValue(1);

      await expect(
        service.updateSection(1, { content: 'updated' }, 1, AdminRole.administrator),
      ).resolves.not.toThrow();
    });
  });

  // ─── getStudyByProject ────────────────────────────────────────────────────────

  describe('getStudyByProject', () => {
    it('throws NotFoundException when no published study exists', async () => {
      mockPrisma.projectStudy.findFirst.mockResolvedValue(null);

      await expect(service.getStudyByProject(1)).rejects.toThrow(NotFoundException);
    });

    it('returns study with vote summary when status is published', async () => {
      const mockStudy = {
        id: 1,
        projectId: 1,
        status: StudyStatus.published,
        sections: [],
      };
      mockPrisma.projectStudy.findFirst.mockResolvedValue(mockStudy);
      mockPrisma.studyVote.groupBy.mockResolvedValue([
        { choice: 'for', _count: { choice: 5 } },
        { choice: 'against', _count: { choice: 2 } },
      ]);

      const result = await service.getStudyByProject(1);

      expect(result.status).toBe(StudyStatus.published);
      expect(result.votesSummary).toEqual({ for: 5, against: 2, abstain: 0, total: 7 });
    });

    it('only queries for publicly-visible statuses', async () => {
      mockPrisma.projectStudy.findFirst.mockResolvedValue(null);

      await service.getStudyByProject(5).catch(() => {});

      expect(mockPrisma.projectStudy.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: expect.objectContaining({ in: expect.arrayContaining([StudyStatus.published]) }),
          }),
        }),
      );
    });
  });

  // ─── listStudies ──────────────────────────────────────────────────────────────

  describe('listStudies', () => {
    it('filters by assigned projects for financial_officer role', async () => {
      const mockUser = {
        role: AdminRole.financial_officer,
        referenceId: 3,
        sub: 5,
        email: 'fo@test.com',
        referenceType: 'admin',
      };

      mockPrisma.project.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
      mockPrisma.projectStudy.findMany.mockResolvedValue([]);
      mockPrisma.projectStudy.count.mockResolvedValue(0);

      await service.listStudies({}, mockUser as any);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { financialOfficerId: 3 } }),
      );
    });

    it('does not restrict projects for administrator role', async () => {
      const mockUser = {
        role: AdminRole.administrator,
        referenceId: 1,
        sub: 1,
        email: 'admin@test.com',
        referenceType: 'admin',
      };

      mockPrisma.projectStudy.findMany.mockResolvedValue([]);
      mockPrisma.projectStudy.count.mockResolvedValue(0);

      await service.listStudies({}, mockUser as any);

      expect(mockPrisma.project.findMany).not.toHaveBeenCalled();
    });
  });
});
