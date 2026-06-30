import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Job } from './entities/job.entity';
import { JobsService } from './jobs.service';
import { AiService } from '../ai/ai.service';

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
  } as Job);

describe('JobsService', () => {
  let service: JobsService;
  let jobRepo: { findOne: jest.Mock; save: jest.Mock; find: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    jobRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
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
      await expect(service.toggleSave('user-1', 'unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSavedJobs', () => {
    it('returns saved jobs for user sorted by matchScore', async () => {
      const jobs = [mockJob({ isSaved: true, matchScore: 50 }), mockJob({ id: 'job-2', isSaved: true, matchScore: 90 })];
      jobRepo.find.mockResolvedValue(jobs);

      const result = await service.getSavedJobs('user-1');
      expect(jobRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user: { id: 'user-1' }, isSaved: true } }),
      );
      expect(result).toHaveLength(2);
    });
  });
});
