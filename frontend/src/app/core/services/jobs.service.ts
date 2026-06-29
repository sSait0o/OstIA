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

export interface JobsState {
  keywords: string;
  location: string;
  page: number;
  jobs: Job[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class JobsService {
  private readonly base = `${environment.apiUrl}/jobs`;

  readonly cachedState = signal<JobsState | null>(null);

  constructor(private readonly http: HttpClient) {}

  search(params: { keywords?: string; location?: string; page?: number }) {
    return this.http.get<JobSearchResult>(`${this.base}/search`, { params: params as any }).pipe(
      tap((result) => {
        this.cachedState.set({
          keywords: params.keywords ?? '',
          location: params.location ?? '',
          page: params.page ?? 1,
          jobs: result.jobs,
          total: result.total,
        });
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
