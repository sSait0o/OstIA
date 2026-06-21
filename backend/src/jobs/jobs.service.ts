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

  async searchFranceTravail(params: JobSearchParams): Promise<any[]> {
    const token = await this.getFranceTravailToken();

    const queryParams: Record<string, string> = {
      motsCles: params.keywords || 'data engineer alternance',
      typeContrat: params.contractType || 'CDI,CDD',
      range: `${((params.page || 1) - 1) * 15}-${((params.page || 1) - 1) * 15 + 14}`,
    };
    if (params.location) queryParams['commune'] = params.location;

    const response = await axios.get(
      'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search',
      { headers: { Authorization: `Bearer ${token}` }, params: queryParams },
    );

    return (response.data.resultats || []).map((offer: any) => ({
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
  }

  async searchAndScore(
    userId: string,
    params: JobSearchParams,
    cvData: Record<string, any>,
  ): Promise<Job[]> {
    let offers: any[];
    try {
      offers = await this.searchFranceTravail(params);
    } catch {
      return [];
    }
    const jobs: Job[] = [];

    const hasCv = cvData && Object.keys(cvData).length > 0;

    for (const offer of offers.slice(0, 10)) {
      let match: { score: number | null; matchedSkills: string[]; summary: string };
      try {
        match = hasCv
          ? await this.aiService.matchCvToJob(cvData, offer.title, offer.description || '')
          : { score: null, matchedSkills: [], summary: 'Uploadez votre CV pour voir le score de matching' };
      } catch {
        match = { score: null, matchedSkills: [], summary: '' };
      }

      const existing = await this.jobRepo.findOne({
        where: { externalId: offer.externalId, user: { id: userId } },
      });

      if (existing) {
        existing.matchScore = match.score ?? 0;
        existing.matchDetails = match;
        jobs.push(await this.jobRepo.save(existing));
        continue;
      }

      const job = this.jobRepo.create({
        ...offer,
        user: { id: userId } as User,
        matchScore: match.score ?? 0,
        matchDetails: match,
        publishedAt: offer.publishedAt ? new Date(offer.publishedAt) : undefined,
      });
      jobs.push((await this.jobRepo.save(job)) as unknown as Job);
    }

    return jobs.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
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
