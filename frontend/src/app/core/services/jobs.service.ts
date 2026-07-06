import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Job {
  id: string;
  title: string;
  company: string;
  description?: string;
  location?: string;
  salary?: string;
  contractType?: string;
  url?: string;
  source: string;
  matchScore?: number;
  matchDetails?: {
    score: number;
    matchedSkills: string[];
    missingSkills: string[];
    summary: string;
  };
  isSaved: boolean;
  isApplied: boolean;
  publishedAt?: string;
}

export interface JobSearchResult {
  jobs: Job[];
  total: number;
}

export interface JobSearchParams {
  keywords?: string;
  location?: string;
  contractTypes?: string[];
  experience?: string;
  distance?: number;
  fullTime?: boolean | null;
  remote?: string;
  salaryMin?: number | null;
  sortBy?: string;
  page?: number;
}

export interface JobFeedParams {
  page?: number;
  pageSize?: number;
  minScore?: number;
  sortBy?: string;
}

export interface JobFeedResult extends JobSearchResult {
  syncing: boolean;
}

@Injectable({ providedIn: 'root' })
export class JobsService {
  private readonly base = `${environment.apiUrl}/jobs`;
  private readonly pagesCache = new Map<string, JobSearchResult>();

  constructor(private readonly http: HttpClient) {}

  search(params: JobSearchParams) {
    const cacheKey = this.cacheKey(params);
    const cached = this.pagesCache.get(cacheKey);
    if (cached) return of(cached);

    const httpParams: Record<string, string | number | boolean> = {};

    if (params.keywords) httpParams['keywords'] = params.keywords;
    if (params.location) httpParams['location'] = params.location;
    if (params.contractTypes?.length) httpParams['contractTypes'] = params.contractTypes.join(',');
    if (params.experience) httpParams['experience'] = params.experience;
    if (params.distance) httpParams['distance'] = params.distance;
    if (params.fullTime != null) httpParams['fullTime'] = params.fullTime;
    if (params.remote) httpParams['remote'] = params.remote;
    if (params.salaryMin) httpParams['salaryMin'] = params.salaryMin;
    if (params.sortBy) httpParams['sortBy'] = params.sortBy;
    if (params.page && params.page > 1) httpParams['page'] = params.page;

    return this.http.get<JobSearchResult>(`${this.base}/search`, { params: httpParams }).pipe(
      tap((result) => this.pagesCache.set(cacheKey, result)),
    );
  }

  getFeed(params: JobFeedParams) {
    const httpParams: Record<string, string | number> = {};
    if (params.page && params.page > 1) httpParams['page'] = params.page;
    if (params.pageSize) httpParams['pageSize'] = params.pageSize;
    if (params.minScore) httpParams['minScore'] = params.minScore;
    if (params.sortBy) httpParams['sortBy'] = params.sortBy;

    return this.http.get<JobFeedResult>(`${this.base}/feed`, { params: httpParams });
  }

  patchJob(id: string, patch: Partial<Job>) {
    for (const [key, result] of this.pagesCache) {
      if (result.jobs.some((j) => j.id === id)) {
        this.pagesCache.set(key, {
          ...result,
          jobs: result.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
        });
      }
    }
  }

  getSaved() {
    return this.http.get<Job[]>(`${this.base}/saved`);
  }

  toggleSave(id: string) {
    return this.http.patch<Job>(`${this.base}/${id}/save`, {});
  }

  private cacheKey(params: JobSearchParams): string {
    return JSON.stringify({
      keywords: params.keywords ?? '',
      location: params.location ?? '',
      contractTypes: (params.contractTypes ?? []).join(','),
      experience: params.experience ?? '',
      distance: params.distance ?? '',
      fullTime: params.fullTime ?? '',
      remote: params.remote ?? '',
      salaryMin: params.salaryMin ?? '',
      sortBy: params.sortBy ?? '',
      page: params.page ?? 1,
    });
  }
}
