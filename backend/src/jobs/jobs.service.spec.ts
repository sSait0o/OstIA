import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Job } from './entities/job.entity';
import { JobsService } from './jobs.service';
import { AiService } from '@ai/ai.service';
import { UsersService } from '@users/users.service';

const mockJob = (overrides: Partial<Job> = {}): Job =>
  ({
    id: 'job-1',
    externalId: 'ext-1',
    title: 'Software Engineer',
    company: 'Acme',
    source: 'france_travail',
    isSaved: false,
    isApplied: false,
    matchScore: 75,
    ...overrides,
  }) as Job;

describe('JobsService', () => {
  let service: JobsService;
  let jobRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
    upsert: jest.Mock;
  };
  let usersService: { updateJobsLastSyncedAt: jest.Mock };

  beforeEach(async () => {
    jobRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      create: jest.fn((data: Partial<Job>) => data),
      delete: jest.fn(),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    usersService = {
      updateJobsLastSyncedAt: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getRepositoryToken(Job), useValue: jobRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const vals: Record<string, string> = {
                FRANCE_TRAVAIL_CLIENT_ID: 'ft-id',
                FRANCE_TRAVAIL_CLIENT_SECRET: 'ft-secret',
              };
              return vals[key] ?? def;
            }),
          },
        },
        {
          provide: AiService,
          useValue: {
            matchCvToJob: jest.fn().mockResolvedValue({
              score: 80,
              matchedSkills: ['TypeScript'],
              missingSkills: [],
              summary: 'Good match',
            }),
          },
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(JobsService);
  });

  describe('toggleSave', () => {
    it('toggles isSaved to true', async () => {
      const job = mockJob({ isSaved: false });
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockResolvedValue({ ...job, isSaved: true });

      const result = await service.toggleSave('user-1', 'job-1');
      expect(result.isSaved).toBe(true);
      expect(jobRepo.save).toHaveBeenCalled();
    });

    it('toggles isSaved to false', async () => {
      const job = mockJob({ isSaved: true });
      jobRepo.findOne.mockResolvedValue(job);
      jobRepo.save.mockResolvedValue({ ...job, isSaved: false });

      const result = await service.toggleSave('user-1', 'job-1');
      expect(result.isSaved).toBe(false);
    });

    it('throws NotFoundException when job does not belong to user', async () => {
      jobRepo.findOne.mockResolvedValue(null);
      await expect(service.toggleSave('user-1', 'unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSavedJobs', () => {
    it('returns saved jobs for user sorted by matchScore', async () => {
      const jobs = [
        mockJob({ isSaved: true, matchScore: 50 }),
        mockJob({ id: 'job-2', isSaved: true, matchScore: 90 }),
      ];
      jobRepo.find.mockResolvedValue(jobs);

      const result = await service.getSavedJobs('user-1');
      expect(jobRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { id: 'user-1' }, isSaved: true },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  const mockOffer = (overrides: Partial<any> = {}) => ({
    title: 'Backend Developer',
    company: 'Acme',
    description: 'Node.js role',
    url: 'https://example.com/job',
    source: 'france_travail',
    externalId: 'ext-1',
    ...overrides,
  });

  describe('searchAndScore (upsertAndScoreOffers)', () => {
    beforeEach(() => {
      jest
        .spyOn(service, 'searchFranceTravail')
        .mockResolvedValue({ offers: [mockOffer()], total: 1 });
      jest
        .spyOn(service, 'searchAdzuna')
        .mockResolvedValue({ offers: [], total: 0 });
    });

    it('creates a new job and calls the AI matcher when no existing job', async () => {
      jobRepo.find.mockResolvedValue([]);
      jobRepo.save.mockImplementation((j) => Promise.resolve(j));

      const result = await service.searchAndScore(
        'user-1',
        {},
        { skills: ['Node.js'] },
      );

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].matchScore).toBe(80);
      expect(jobRepo.upsert).toHaveBeenCalled();
    });

    it('reuses an existing valid score without calling the AI matcher again', async () => {
      const existing = mockJob({
        externalId: 'ext-1',
        matchScore: 55,
        matchDetails: { summary: 'Already scored' },
      });
      jobRepo.find.mockResolvedValue([existing]);

      const aiService = (
        service as unknown as { aiService: { matchCvToJob: jest.Mock } }
      ).aiService;
      aiService.matchCvToJob.mockClear();

      const result = await service.searchAndScore(
        'user-1',
        {},
        { skills: ['Node.js'] },
      );

      expect(result.jobs[0]).toBe(existing);
      expect(aiService.matchCvToJob).not.toHaveBeenCalled();
    });

    it('does not call the AI matcher when cvData is empty', async () => {
      jobRepo.find.mockResolvedValue([]);
      jobRepo.save.mockImplementation((j) => Promise.resolve(j));

      const aiService = (
        service as unknown as { aiService: { matchCvToJob: jest.Mock } }
      ).aiService;
      aiService.matchCvToJob.mockClear();

      const result = await service.searchAndScore('user-1', {}, {});

      expect(aiService.matchCvToJob).not.toHaveBeenCalled();
      expect(result.jobs[0].matchScore).toBe(0);
    });
  });

  describe('syncJobsForUser', () => {
    let ftSpy: jest.SpyInstance;
    let adzunaSpy: jest.SpyInstance;

    beforeEach(() => {
      ftSpy = jest
        .spyOn(service, 'searchFranceTravail')
        .mockResolvedValue({ offers: [mockOffer()], total: 1 });
      adzunaSpy = jest
        .spyOn(service, 'searchAdzuna')
        .mockResolvedValue({ offers: [], total: 0 });
      jobRepo.find.mockResolvedValue([]);
      jobRepo.save.mockImplementation((j) => Promise.resolve(j));
    });

    it('stamps jobsLastSyncedAt before doing any work', async () => {
      await service.syncJobsForUser('user-1', { skills: ['Node.js'] });

      expect(usersService.updateJobsLastSyncedAt).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('purges stale unsaved/unapplied jobs for the user', async () => {
      await service.syncJobsForUser('user-1', { skills: ['Node.js'] });

      expect(jobRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { id: 'user-1' },
          isSaved: false,
          isApplied: false,
        }),
      );
    });

    it('queries at most 5 skills', async () => {
      await service.syncJobsForUser('user-1', {
        skills: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      });

      expect(ftSpy).toHaveBeenCalledTimes(5);
    });

    it('dedupes offers sharing the same externalId across skills', async () => {
      ftSpy.mockResolvedValue({
        offers: [mockOffer({ externalId: 'same-id' })],
        total: 1,
      });

      await service.syncJobsForUser('user-1', {
        skills: ['Node.js', 'TypeScript'],
      });

      expect(jobRepo.upsert).toHaveBeenCalledTimes(1);
      const [toWrite] = jobRepo.upsert.mock.calls[0] as [unknown[]];
      expect(toWrite).toHaveLength(1);
    });

    it('does nothing (no fetch) when the CV has no skills', async () => {
      await service.syncJobsForUser('user-1', {});

      expect(ftSpy).not.toHaveBeenCalled();
      expect(adzunaSpy).not.toHaveBeenCalled();
      expect(usersService.updateJobsLastSyncedAt).toHaveBeenCalled();
    });

    it('continues processing other skills when one search fails', async () => {
      ftSpy.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({
        offers: [mockOffer({ externalId: 'ok' })],
        total: 1,
      });

      await expect(
        service.syncJobsForUser('user-1', { skills: ['Bad', 'Good'] }),
      ).resolves.not.toThrow();
      expect(jobRepo.upsert).toHaveBeenCalled();
    });
  });

  describe('getFeed', () => {
    it('uses default paging and sorts by matchScore desc', async () => {
      await service.getFeed('user-1', {});

      expect(jobRepo.findAndCount).toHaveBeenCalledWith({
        where: { user: { id: 'user-1' } },
        order: { matchScore: 'DESC' },
        skip: 0,
        take: 9,
      });
    });

    it('adds a minScore filter when provided', async () => {
      await service.getFeed('user-1', { minScore: 70 });

      const calls = jobRepo.findAndCount.mock.calls as unknown as Array<
        [{ where: { matchScore?: unknown } }]
      >;
      expect(calls[0][0].where.matchScore).toBeDefined();
    });

    it('sorts by publishedAt when sortBy is date', async () => {
      await service.getFeed('user-1', { sortBy: 'date' });

      expect(jobRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { publishedAt: 'DESC' } }),
      );
    });

    it('computes skip/take from page and pageSize', async () => {
      await service.getFeed('user-1', { page: 3, pageSize: 20 });

      expect(jobRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });
  });

  describe('isJobsSyncStale', () => {
    it('returns true when never synced', () => {
      expect(service.isJobsSyncStale(null)).toBe(true);
    });

    it('returns false when synced recently', () => {
      expect(service.isJobsSyncStale(new Date())).toBe(false);
    });

    it('returns true when synced more than 6 hours ago', () => {
      const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
      expect(service.isJobsSyncStale(sevenHoursAgo)).toBe(true);
    });
  });
});
