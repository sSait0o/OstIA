import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import axios from 'axios';
import { Job } from './entities/job.entity';
import { AiService } from '../ai/ai.service';
import { User } from '../users/entities/user.entity';

interface FranceTravailToken {
  access_token: string;
  expires_in: number;
}

export interface JobSearchParams {
  keywords?: string;
  location?: string;
  contractTypes?: string[];
  experience?: string;
  distance?: number;
  fullTime?: boolean;
  remote?: string;
  salaryMin?: number;
  sortBy?: 'date' | 'pertinence';
  page?: number;
}

interface JobOffer {
  title: string;
  company: string;
  description: string;
  location?: string;
  salary?: string;
  contractType?: string;
  url: string;
  source: string;
  externalId: string;
  publishedAt?: string;
}

interface AdzunaResult {
  id: string;
  title: string;
  company: { display_name: string };
  description: string;
  location: { display_name: string };
  salary_min?: number;
  salary_max?: number;
  contract_type?: string;
  redirect_url: string;
  created: string;
}

interface AdzunaResponse {
  results: AdzunaResult[];
  count: number;
}

interface FranceTravailOffer {
  id: string;
  intitule: string;
  description: string;
  typeContratLibelle?: string;
  dateCreation?: string;
  entreprise?: { nom?: string };
  lieuTravail?: { libelle?: string };
  salaire?: { libelle?: string };
  origineOffre?: { urlOrigine?: string };
}

interface FranceTravailSearchResponse {
  resultats?: FranceTravailOffer[];
}

// "APP"/"PRO" aren't valid typeContrat codes on France Travail's side;
// apprenticeship/professionalization are exposed via the natureContrat param instead.
const FT_NATURE_CONTRAT_MAP: Record<string, string> = {
  APP: 'E2',
  PRO: 'FS',
};

// Adzuna only supports "permanent"/"contract"; these types have no equivalent there.
const ADZUNA_UNSUPPORTED_CONTRACT_TYPES = new Set(['APP', 'PRO', 'SAI']);

// France Travail rejects the "whole city" commune code from geo.api.gouv.fr for
// Paris/Lyon/Marseille (split into arrondissements in FT's own reference data).
const FT_ARRONDISSEMENT_CITY_DEPARTEMENTS: Record<string, string> = {
  '75056': '75',
  '69123': '69',
  '13055': '13',
};

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private franceTravailToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
  ) {}

  private describeAxiosError(reason: unknown): string {
    if (axios.isAxiosError(reason)) {
      return `${reason.message} — ${JSON.stringify(reason.response?.data)}`;
    }
    return reason instanceof Error ? reason.message : String(reason);
  }

  private async getFranceTravailToken(): Promise<string> {
    if (
      this.franceTravailToken &&
      this.tokenExpiry &&
      this.tokenExpiry > new Date()
    ) {
      return this.franceTravailToken;
    }

    const clientId = this.configService.get<string>(
      'FRANCE_TRAVAIL_CLIENT_ID',
    )!;
    const clientSecret = this.configService.get<string>(
      'FRANCE_TRAVAIL_CLIENT_SECRET',
    )!;

    const response = await axios.post<FranceTravailToken>(
      'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'api_offresdemploiv2 o2dsoffre',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    this.franceTravailToken = response.data.access_token;
    this.tokenExpiry = new Date(
      Date.now() + (response.data.expires_in - 60) * 1000,
    );
    return this.franceTravailToken;
  }

  private extractKeywordsFromCv(cvData: Record<string, unknown>): string {
    const experience = cvData.experience as
      | Array<{ title?: string }>
      | undefined;
    if (experience?.length && experience[0].title) return experience[0].title;
    const skills = cvData.skills as string[] | undefined;
    if (skills?.length) return skills[0];
    return '';
  }

  private async resolveToInseeCode(cityName: string): Promise<string | null> {
    try {
      const response = await axios.get<Array<{ code: string }>>(
        'https://geo.api.gouv.fr/communes',
        {
          params: {
            nom: cityName,
            fields: 'code',
            boost: 'population',
            limit: 1,
          },
          timeout: 3000,
        },
      );
      return response.data[0]?.code ?? null;
    } catch {
      return null;
    }
  }

  async searchFranceTravail(
    params: JobSearchParams,
    perPage = 9,
  ): Promise<{ offers: JobOffer[]; total: number }> {
    const token = await this.getFranceTravailToken();
    const page = params.page || 1;
    const start = (page - 1) * perPage;

    const toFranceTravailDate = (date: Date) =>
      `${date.toISOString().split('.')[0]}Z`;
    const minCreationDate = toFranceTravailDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    );
    const maxCreationDate = toFranceTravailDate(new Date());

    const queryParams: Record<string, string> = {
      motsCles: params.keywords || '',
      range: `${start}-${start + perPage - 1}`,
      minCreationDate,
      maxCreationDate,
    };

    if (params.location) {
      const isDeptCode = /^\d{1,3}$/.test(params.location.trim());
      if (isDeptCode) {
        queryParams['departement'] = params.location;
      } else {
        const inseeCode = await this.resolveToInseeCode(params.location);
        const fallbackDept = inseeCode
          ? FT_ARRONDISSEMENT_CITY_DEPARTEMENTS[inseeCode]
          : undefined;
        if (fallbackDept) {
          queryParams['departement'] = fallbackDept;
        } else if (inseeCode) {
          queryParams['commune'] = inseeCode;
        }
      }
    }
    if (params.contractTypes?.length) {
      const typeContratValues = params.contractTypes.filter(
        (c) => !FT_NATURE_CONTRAT_MAP[c],
      );
      const natureContratValues = params.contractTypes
        .map((c) => FT_NATURE_CONTRAT_MAP[c])
        .filter((v): v is string => !!v);
      if (typeContratValues.length)
        queryParams['typeContrat'] = typeContratValues.join(',');
      if (natureContratValues.length)
        queryParams['natureContrat'] = natureContratValues.join(',');
    }
    if (params.experience) queryParams['experience'] = params.experience;
    if (params.distance) queryParams['distance'] = String(params.distance);
    if (params.fullTime === true) queryParams['tempsPlein'] = 'true';
    if (params.remote) queryParams['modesTravail'] = params.remote;
    if (params.sortBy === 'date') queryParams['tri'] = '1';

    const response = await axios.get<FranceTravailSearchResponse>(
      'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search',
      { headers: { Authorization: `Bearer ${token}` }, params: queryParams },
    );

    const contentRange =
      (response.headers as Record<string, string>)['content-range'] ?? '';
    const total = parseInt(contentRange.split('/')[1] ?? '0', 10) || 0;

    const resultats = response.data.resultats ?? [];
    const offers: JobOffer[] = resultats.map((offer) => ({
      title: offer.intitule,
      company: offer.entreprise?.nom || 'Non précisé',
      description: offer.description,
      location: offer.lieuTravail?.libelle,
      salary: offer.salaire?.libelle,
      contractType: offer.typeContratLibelle,
      url:
        offer.origineOffre?.urlOrigine ||
        `https://candidat.francetravail.fr/offres/recherche/detail/${offer.id}`,
      source: 'france_travail',
      externalId: offer.id,
      publishedAt: offer.dateCreation,
    }));

    return { offers, total };
  }

  async searchAdzuna(
    params: JobSearchParams,
  ): Promise<{ offers: JobOffer[]; total: number }> {
    const appId = this.configService.get<string>('ADZUNA_APP_ID');
    const appKey = this.configService.get<string>('ADZUNA_APP_KEY');

    if (!appId || !appKey) return { offers: [], total: 0 };

    const page = params.page || 1;
    const queryParams: Record<string, string | number> = {
      app_id: appId,
      app_key: appKey,
      results_per_page: 3,
      max_days_old: 30,
    };

    if (params.keywords) queryParams['what'] = params.keywords;
    if (params.location) queryParams['where'] = params.location;
    if (params.distance) queryParams['distance'] = params.distance;
    if (params.salaryMin) queryParams['salary_min'] = params.salaryMin;
    if (params.fullTime === true) queryParams['full_time'] = 1;
    if (params.fullTime === false) queryParams['part_time'] = 1;
    if (params.sortBy === 'date') queryParams['sort_by'] = 'date';
    else if (params.sortBy === 'pertinence')
      queryParams['sort_by'] = 'relevance';

    if (params.contractTypes?.length) {
      const isExpressible = params.contractTypes.some(
        (c) => !ADZUNA_UNSUPPORTED_CONTRACT_TYPES.has(c),
      );
      // No Adzuna equivalent for apprenticeship/professionalization/seasonal work;
      // better to return nothing than unfiltered offers.
      if (!isExpressible) return { offers: [], total: 0 };

      const hasPermanent = params.contractTypes.includes('CDI');
      const hasContract = params.contractTypes.some((c) =>
        ['CDD', 'MIS'].includes(c),
      );
      if (hasPermanent && !hasContract)
        queryParams['contract_type'] = 'permanent';
      else if (hasContract && !hasPermanent)
        queryParams['contract_type'] = 'contract';
    }

    const response = await axios.get<AdzunaResponse>(
      `https://api.adzuna.com/v1/api/jobs/fr/search/${page}`,
      { params: queryParams, timeout: 5000 },
    );

    const { results, count } = response.data;

    const offers: JobOffer[] = results.map((r) => {
      const salaryMin = r.salary_min ? Math.round(r.salary_min / 1000) : null;
      const salaryMax = r.salary_max ? Math.round(r.salary_max / 1000) : null;
      const salary =
        salaryMin && salaryMax
          ? `${salaryMin}k - ${salaryMax}k €/an`
          : salaryMin
            ? `${salaryMin}k+ €/an`
            : undefined;

      const contractType =
        r.contract_type === 'permanent'
          ? 'CDI'
          : r.contract_type === 'contract'
            ? 'CDD'
            : r.contract_type;

      return {
        title: r.title,
        company: r.company?.display_name || 'Non précisé',
        description: r.description,
        location: r.location?.display_name,
        salary,
        contractType,
        url: r.redirect_url,
        source: 'adzuna',
        externalId: `adzuna_${r.id}`,
        publishedAt: r.created,
      };
    });

    return { offers, total: count };
  }

  async searchAndScore(
    userId: string,
    params: JobSearchParams,
    cvData: Record<string, unknown>,
  ): Promise<{ jobs: Job[]; total: number }> {
    const hasCv = cvData && Object.keys(cvData).length > 0;

    const resolvedParams = { ...params };
    if (!resolvedParams.keywords && hasCv) {
      resolvedParams.keywords = this.extractKeywordsFromCv(cvData);
    }

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

    const externalIds = allOffers.map((o) => o.externalId);
    const existingJobs = await this.jobRepo.find({
      where: { externalId: In(externalIds), user: { id: userId } },
    });
    const existingByExternalId = new Map(
      existingJobs.map((j) => [j.externalId, j]),
    );

    const jobs = await Promise.all(
      allOffers.map(async (offer) => {
        const existing = existingByExternalId.get(offer.externalId);

        if (existing && existing.matchScore != null) {
          return existing;
        }

        const match = hasCv
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
              summary: 'Uploadez votre CV pour voir le score de matching',
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

    return {
      jobs: jobs.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)),
      total,
    };
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
