import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Job } from './entities/job.entity';
import { AiService } from '../ai/ai.service';
import { User } from '../users/entities/user.entity';

interface FranceTravailToken {
  access_token: string;
  expires_in: number;
}

interface JobSearchParams {
  keywords?: string;
  location?: string;
  contractType?: string;
  page?: number;
}

interface FranceTravailOffer {
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

@Injectable()
export class JobsService {
  private franceTravailToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
  ) {}

  private async getFranceTravailToken(): Promise<string> {
    if (this.franceTravailToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.franceTravailToken;
    }

    const clientId = this.configService.get('FRANCE_TRAVAIL_CLIENT_ID');
    const clientSecret = this.configService.get('FRANCE_TRAVAIL_CLIENT_SECRET');

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
    this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 60) * 1000);
    return this.franceTravailToken;
  }

  private extractKeywordsFromCv(cvData: Record<string, any>): string {
    const experience = cvData.experience as Array<{ title?: string }> | undefined;
    if (experience?.length && experience[0].title) return experience[0].title;
    const skills = cvData.skills as string[] | undefined;
    if (skills?.length) return skills[0];
    return '';
  }

  async searchFranceTravail(params: JobSearchParams): Promise<{ offers: FranceTravailOffer[]; total: number }> {
    const token = await this.getFranceTravailToken();
    const page = params.page || 1;

    const queryParams: Record<string, string> = {
      motsCles: params.keywords || '',
      typeContrat: params.contractType || 'CDI,CDD',
      range: `${(page - 1) * 9}-${(page - 1) * 9 + 8}`,
    };
    if (params.location) queryParams['commune'] = params.location;

    const response = await axios.get(
      'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search',
      { headers: { Authorization: `Bearer ${token}` }, params: queryParams },
    );

    const contentRange =
      (response.headers as Record<string, string>)['content-range'] ?? '';
    const total = parseInt(contentRange.split('/')[1] ?? '0', 10) || 0;

    const resultats =
      ((response.data as Record<string, unknown>)['resultats'] as any[]) || [];
    const offers = resultats.map((offer: any) => ({
      title: offer.intitule,
      company: offer.entreprise?.nom || 'Non précisé',
      description: offer.description,
      location: offer.lieuTravail?.libelle,
      salary: offer.salaire?.libelle,
      contractType: offer.typeContratLibelle,
      url: offer.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${offer.id}`,
      source: 'france_travail',
      externalId: offer.id,
      publishedAt: offer.dateCreation,
    }));

    return { offers, total };
  }

  async searchAndScore(
    userId: string,
    params: JobSearchParams,
    cvData: Record<string, any>,
  ): Promise<{ jobs: Job[]; total: number }> {
    const hasCv = cvData && Object.keys(cvData).length > 0;

    const resolvedParams = { ...params };
    if (!resolvedParams.keywords && hasCv) {
      resolvedParams.keywords = this.extractKeywordsFromCv(cvData);
    }

    let offers: FranceTravailOffer[];
    let total: number;
    try {
      ({ offers, total } = await this.searchFranceTravail(resolvedParams));
      if (offers.length === 0 && resolvedParams.keywords) {
        const fallback = resolvedParams.keywords.split(' ')[0];
        ({ offers, total } = await this.searchFranceTravail({
          ...resolvedParams,
          keywords: fallback,
        }));
      }
      if (offers.length === 0) {
        ({ offers, total } = await this.searchFranceTravail({
          ...resolvedParams,
          keywords: '',
        }));
      }
    } catch {
      return { jobs: [], total: 0 };
    }

    const jobs = await Promise.all(
      offers.map(async (offer) => {
        const existing = await this.jobRepo.findOne({
          where: { externalId: offer.externalId, user: { id: userId } },
        });

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
          publishedAt: offer.publishedAt ? new Date(offer.publishedAt) : undefined,
        });
        return this.jobRepo.save(job);
      }),
    );

    console.log('[Jobs] saved', jobs.length, 'jobs, returning sorted list');

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
    const job = await this.jobRepo.findOne({ where: { id: jobId, user: { id: userId } } });
    if (!job) throw new Error('Offre non trouvée');
    job.isSaved = !job.isSaved;
    return this.jobRepo.save(job);
  }
}
