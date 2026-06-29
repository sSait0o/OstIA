import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
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

export interface JobsState extends JobSearchParams {
  jobs: Job[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class JobsService {
  private readonly base = `${environment.apiUrl}/jobs`;

  readonly cachedState = signal<JobsState | null>(null);

  constructor(private readonly http: HttpClient) {}

  search(params: JobSearchParams) {
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
      tap((result) => {
        this.cachedState.set({ ...params, jobs: result.jobs, total: result.total });
      }),
    );
  }

  getSaved() {
    return this.http.get<Job[]>(`${this.base}/saved`);
  }

  toggleSave(id: string) {
    return this.http.patch<Job>(`${this.base}/${id}/save`, {});
  }
}
