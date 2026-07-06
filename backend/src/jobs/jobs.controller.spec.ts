import { Test, TestingModule } from '@nestjs/testing';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { UsersService } from '../users/users.service';

describe('JobsController', () => {
  let controller: JobsController;
  let jobsService: {
    isJobsSyncStale: jest.Mock;
    syncJobsForUser: jest.Mock;
    getFeed: jest.Mock;
  };
  let usersService: { findById: jest.Mock };

  beforeEach(async () => {
    jobsService = {
      isJobsSyncStale: jest.fn(),
      syncJobsForUser: jest.fn().mockResolvedValue(undefined),
      getFeed: jest.fn().mockResolvedValue({ jobs: [], total: 0 }),
    };
    usersService = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        { provide: JobsService, useValue: jobsService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    controller = module.get(JobsController);
  });

  const req = { user: { id: 'user-1' } };

  describe('feed', () => {
    it('awaits the sync when the user has never synced before', async () => {
      usersService.findById.mockResolvedValue({
        cvData: {},
        jobsLastSyncedAt: null,
      });
      jobsService.isJobsSyncStale.mockReturnValue(true);

      let syncResolved = false;
      jobsService.syncJobsForUser.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              syncResolved = true;
              resolve(undefined);
            }, 10),
          ),
      );

      const result = await controller.feed(req);

      expect(syncResolved).toBe(true);
      expect(result.syncing).toBe(false);
      expect(jobsService.getFeed).toHaveBeenCalled();
    });

    it('does not await the sync when data is stale but already exists (fire-and-forget)', async () => {
      usersService.findById.mockResolvedValue({
        cvData: {},
        jobsLastSyncedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
      });
      jobsService.isJobsSyncStale.mockReturnValue(true);

      jobsService.syncJobsForUser.mockReturnValue(new Promise(() => {}));

      const result = await controller.feed(req);

      expect(result.syncing).toBe(true);
      expect(jobsService.getFeed).toHaveBeenCalled();
    });

    it('does not trigger a sync when data is fresh', async () => {
      usersService.findById.mockResolvedValue({
        cvData: {},
        jobsLastSyncedAt: new Date(),
      });
      jobsService.isJobsSyncStale.mockReturnValue(false);

      const result = await controller.feed(req);

      expect(jobsService.syncJobsForUser).not.toHaveBeenCalled();
      expect(result.syncing).toBe(false);
    });

    it('passes parsed pagination/filter params to getFeed', async () => {
      usersService.findById.mockResolvedValue({
        cvData: {},
        jobsLastSyncedAt: new Date(),
      });
      jobsService.isJobsSyncStale.mockReturnValue(false);

      await controller.feed(req, '2', '20', '70', 'date');

      expect(jobsService.getFeed).toHaveBeenCalledWith('user-1', {
        page: 2,
        pageSize: 20,
        minScore: 70,
        sortBy: 'date',
      });
    });
  });
});
