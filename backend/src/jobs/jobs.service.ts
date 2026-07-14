import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  FindOptionsOrder,
  FindOptionsWhere,
  In,
  LessThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import axios from 'axios';
import { Job } from './entities/job.entity';
import {
  AiService,
  AI_MATCH_ERROR_SUMMARY,
  CvMatchResult,
} from '@ai/ai.service';
import { User } from '@users/entities/user.entity';
import { UsersService } from '@users/users.service';
import { JobOffer, JobSearchParams } from './types/job-search.types';
import { FranceTravailClient } from './providers/france-travail.provider';
import { searchAdzunaJobs } from './providers/adzuna.provider';

const NO_CV_MATCH_SUMMARY = 'Uploadez votre CV pour voir le score de matching';

const JOBS_SYNC_STALE_MS = 6 * 60 * 60 * 1000;
const JOBS_PURGE_AFTER_DAYS = 30;
const MAX_SYNC_SKILLS = 5;
const SYNC_PER_SKILL_PAGE_SIZE = 20;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly franceTravailClient: FranceTravailClient;

  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
  ) {
    this.franceTravailClient = new FranceTravailClient(this.configService);
  }

  private describeAxiosError(reason: unknown): string {
    if (axios.isAxiosError(reason)) {
      return `${reason.message} — ${JSON.stringify(reason.response?.data)}`;
    }
    return reason instanceof Error ? reason.message : String(reason);
  }

  async searchFranceTravail(
    params: JobSearchParams,
    perPage = 9,
  ): Promise<{ offers: JobOffer[]; total: number }> {
    return this.franceTravailClient.search(params, perPage);
  }

  async searchAdzuna(
    params: JobSearchParams,
  ): Promise<{ offers: JobOffer[]; total: number }> {
    return searchAdzunaJobs(params, this.configService);
  }

  async searchAndScore(
    userId: string,
    params: JobSearchParams,
    cvData: Record<string, unknown>,
  ): Promise<{ jobs: Job[]; total: number }> {
    const resolvedParams = { ...params };

    let ftOffers: JobOffer[] = [];
    let ftTotal = 0;
    let adzunaOffers: JobOffer[] = [];

    const hasAdzuna =
      !!this.configService.get('ADZUNA_APP_ID') &&
      !!this.configService.get('ADZUNA_APP_KEY');

    const [ftResult, adzunaResult] = await Promise.allSettled([
      this.searchFranceTravail(resolvedParams, 9),
      hasAdzuna
        ? this.searchAdzuna(resolvedParams)
        : Promise.resolve({ offers: [], total: 0 }),
    ]);

    if (ftResult.status === 'fulfilled') {
      ({ offers: ftOffers, total: ftTotal } = ftResult.value);
    } else {
      this.logger.error(
        `France Travail search failed: ${this.describeAxiosError(ftResult.reason)}`,
      );
    }
    if (adzunaResult.status === 'fulfilled') {
      ({ offers: adzunaOffers } = adzunaResult.value);
    } else if (hasAdzuna) {
      this.logger.error(
        `Adzuna search failed: ${this.describeAxiosError(adzunaResult.reason)}`,
      );
    }

    const allOffers = [...ftOffers, ...adzunaOffers];
    const total = Math.max(ftTotal, allOffers.length);

    const jobs = await this.upsertAndScoreOffers(userId, allOffers, cvData);

    return {
      jobs: jobs.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)),
      total,
    };
  }

  private async upsertAndScoreOffers(
    userId: string,
    offers: JobOffer[],
    cvData: Record<string, unknown>,
  ): Promise<Job[]> {
    const hasCv = cvData && Object.keys(cvData).length > 0;

    const externalIds = offers.map((o) => o.externalId);
    const existingJobs = externalIds.length
      ? await this.jobRepo.find({
          where: { externalId: In(externalIds), user: { id: userId } },
        })
      : [];
    const existingByExternalId = new Map(
      existingJobs.map((j) => [j.externalId, j]),
    );

    return Promise.all(
      offers.map(async (offer) => {
        const existing = existingByExternalId.get(offer.externalId);

        const alreadyScoredWithCv =
          existing?.matchScore != null &&
          (!hasCv ||
            (existing.matchDetails?.summary !== NO_CV_MATCH_SUMMARY &&
              existing.matchDetails?.summary !== AI_MATCH_ERROR_SUMMARY));
        if (existing && alreadyScoredWithCv) {
          return existing;
        }

        const match:
          | CvMatchResult
          | {
              score: number | null;
              matchedSkills: string[];
              missingSkills: string[];
              summary: string;
            } = hasCv
          ? await this.aiService
              .matchCvToJob(cvData, offer.title, offer.description || '')
              .catch(() => ({
                score: null as number | null,
                matchedSkills: [] as string[],
                missingSkills: [] as string[],
                summary: '',
              }))
          : {
              score: null as number | null,
              matchedSkills: [] as string[],
              missingSkills: [] as string[],
              summary: NO_CV_MATCH_SUMMARY,
            };

        if (existing) {
          existing.matchScore = match.score ?? 0;
          existing.matchDetails = match;
          return this.jobRepo.save(existing);
        }

        const job = this.jobRepo.create({
          ...offer,
          user: { id: userId } as User,
          matchScore: match.score ?? 0,
          matchDetails: match,
          publishedAt: offer.publishedAt
            ? new Date(offer.publishedAt)
            : undefined,
        });
        return this.jobRepo.save(job);
      }),
    );
  }

  isJobsSyncStale(lastSyncedAt: Date | null | undefined): boolean {
    return (
      !lastSyncedAt ||
      Date.now() - new Date(lastSyncedAt).getTime() > JOBS_SYNC_STALE_MS
    );
  }

  async syncJobsForUser(
    userId: string,
    cvData: Record<string, unknown>,
  ): Promise<void> {
    await this.usersService.updateJobsLastSyncedAt(userId);
    await this.purgeStaleJobsForUser(userId);

    const skills = this.topCvSkills(cvData);
    if (skills.length === 0) {
      this.logger.warn(
        `No CV skills for user ${userId}; skipping jobs sync fetch`,
      );
      return;
    }

    const location =
      typeof cvData?.['city'] === 'string' ? cvData['city'] : undefined;
    const hasAdzuna =
      !!this.configService.get('ADZUNA_APP_ID') &&
      !!this.configService.get('ADZUNA_APP_KEY');

    const tasks: Array<{
      skill: string;
      source: 'france_travail' | 'adzuna';
      promise: Promise<{ offers: JobOffer[]; total: number }>;
    }> = [];
    for (const skill of skills) {
      const params: JobSearchParams = {
        keywords: skill,
        location,
        distance: location ? 100 : undefined,
      };
      tasks.push({
        skill,
        source: 'france_travail',
        promise: this.searchFranceTravail(params, SYNC_PER_SKILL_PAGE_SIZE),
      });
      if (hasAdzuna) {
        tasks.push({
          skill,
          source: 'adzuna',
          promise: this.searchAdzuna(params),
        });
      }
    }

    const settled = await Promise.allSettled(tasks.map((t) => t.promise));
    const allOffers: JobOffer[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        allOffers.push(...result.value.offers);
      } else {
        const { skill, source } = tasks[i];
        this.logger.error(
          `${source} sync search failed for skill "${skill}" (user ${userId}): ${this.describeAxiosError(result.reason)}`,
        );
      }
    });

    const deduped = new Map<string, JobOffer>();
    for (const offer of allOffers) {
      if (!deduped.has(offer.externalId)) deduped.set(offer.externalId, offer);
    }

    await this.upsertAndScoreOffers(userId, [...deduped.values()], cvData);
  }

  private topCvSkills(cvData: Record<string, unknown>): string[] {
    const raw = Array.isArray(cvData?.['skills'])
      ? (cvData['skills'] as unknown[])
      : [];
    return raw
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim())
      .slice(0, MAX_SYNC_SKILLS);
  }

  private async purgeStaleJobsForUser(userId: string): Promise<void> {
    const cutoff = new Date(
      Date.now() - JOBS_PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.jobRepo.delete({
      user: { id: userId },
      isSaved: false,
      isApplied: false,
      createdAt: LessThan(cutoff),
    });
  }

  async getFeed(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      minScore?: number;
      sortBy?: 'matchScore' | 'date';
    },
  ): Promise<{ jobs: Job[]; total: number }> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 9;

    const where: FindOptionsWhere<Job> = { user: { id: userId } };
    if (options.minScore) where.matchScore = MoreThanOrEqual(options.minScore);

    const order: FindOptionsOrder<Job> =
      options.sortBy === 'date'
        ? { publishedAt: 'DESC' }
        : { matchScore: 'DESC' };

    const [jobs, total] = await this.jobRepo.findAndCount({
      where,
      order,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { jobs, total };
  }

  async getSavedJobs(userId: string): Promise<Job[]> {
    return this.jobRepo.find({
      where: { user: { id: userId }, isSaved: true },
      order: { matchScore: 'DESC' },
    });
  }

  async toggleSave(userId: string, jobId: string): Promise<Job> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, user: { id: userId } },
    });
    if (!job) throw new NotFoundException();
    job.isSaved = !job.isSaved;
    return this.jobRepo.save(job);
  }
}
