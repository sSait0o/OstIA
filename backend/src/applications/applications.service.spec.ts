import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationsService } from './applications.service';
import { ApplicationEmailsService } from './application-emails.service';
import {
  Application,
  ApplicationSource,
  ApplicationStatus,
} from './entities/application.entity';
import { User } from '../users/entities/user.entity';

const mockUser = (): User => ({ id: 'user-1' }) as User;

const mockApp = (overrides: Partial<Application> = {}): Application =>
  ({
    id: 'app-1',
    user: mockUser(),
    company: 'Google',
    jobTitle: 'Software Engineer',
    status: ApplicationStatus.APPLIED,
    source: ApplicationSource.MANUAL,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Application;

type MockRepo = Partial<Record<keyof Repository<Application>, jest.Mock>>;

const createMockRepo = (): MockRepo => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
});

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let repo: MockRepo;

  beforeEach(async () => {
    repo = createMockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: getRepositoryToken(Application), useValue: repo },
        {
          provide: ApplicationEmailsService,
          useValue: { findForApplication: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ApplicationsService);
  });

  describe('create', () => {
    it('saves and returns a new application', async () => {
      const app = mockApp();
      repo.create!.mockReturnValue(app);
      repo.save!.mockResolvedValue(app);

      const result = await service.create(mockUser(), {
        company: 'Google',
        jobTitle: 'Software Engineer',
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result.company).toBe('Google');
    });
  });

  describe('findAllByUser', () => {
    it('returns applications for the given user', async () => {
      repo.find!.mockResolvedValue([mockApp()]);
      const result = await service.findAllByUser('user-1');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user: { id: 'user-1' } } }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('updates and returns the application', async () => {
      const app = mockApp();
      repo.findOne!.mockResolvedValue(app);
      repo.save!.mockResolvedValue({
        ...app,
        status: ApplicationStatus.INTERVIEW,
      });

      const result = await service.update('user-1', 'app-1', {
        status: ApplicationStatus.INTERVIEW,
      });
      expect(result.status).toBe(ApplicationStatus.INTERVIEW);
    });

    it('throws NotFoundException when application does not exist', async () => {
      repo.findOne!.mockResolvedValue(null);
      await expect(
        service.update('user-1', 'non-existent', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the application', async () => {
      const app = mockApp({ user: { id: 'other-user' } as User });
      repo.findOne!.mockResolvedValue(app);
      await expect(service.update('user-1', 'app-1', {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('removes the application', async () => {
      const app = mockApp();
      repo.findOne!.mockResolvedValue(app);
      repo.remove!.mockResolvedValue(app);

      await service.remove('user-1', 'app-1');
      expect(repo.remove).toHaveBeenCalledWith(app);
    });

    it('throws NotFoundException when application does not exist', async () => {
      repo.findOne!.mockResolvedValue(null);
      await expect(service.remove('user-1', 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user does not own the application', async () => {
      const app = mockApp({ user: { id: 'other-user' } as User });
      repo.findOne!.mockResolvedValue(app);
      await expect(service.remove('user-1', 'app-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getStats', () => {
    it('returns correct stats with empty array', async () => {
      repo.find!.mockResolvedValue([]);
      const stats = await service.getStats('user-1');
      expect(stats.total).toBe(0);
      expect(stats.responseRate).toBe(0);
    });

    it('calculates response rate correctly', async () => {
      const apps = [
        mockApp({ status: ApplicationStatus.APPLIED }),
        mockApp({ status: ApplicationStatus.INTERVIEW }),
        mockApp({ status: ApplicationStatus.REJECTED }),
      ];
      repo.find!.mockResolvedValue(apps);
      const stats = await service.getStats('user-1');
      expect(stats.total).toBe(3);
      expect(stats.responseRate).toBe(67);
    });
  });
});
