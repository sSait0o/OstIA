import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

@Injectable({ providedIn: 'root' })
export class JobsService {
  private readonly base = `${environment.apiUrl}/jobs`;

  constructor(private readonly http: HttpClient) {}

  search(params: { keywords?: string; location?: string; page?: number }) {
    return this.http.get<Job[]>(`${this.base}/search`, { params: params as any });
  }

  getSaved() {
    return this.http.get<Job[]>(`${this.base}/saved`);
  }

  toggleSave(id: string) {
    return this.http.patch<Job>(`${this.base}/${id}/save`, {});
  }
}
