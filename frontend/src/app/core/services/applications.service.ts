import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ApplicationStatus =
  | 'APPLIED'
  | 'ACKNOWLEDGED'
  | 'TECHNICAL'
  | 'INTERVIEW'
  | 'OFFER'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface Application {
  id: string;
  company: string;
  jobTitle: string;
  status: ApplicationStatus;
  source: 'EMAIL' | 'MANUAL' | 'JOB_BOARD';
  jobUrl?: string;
  location?: string;
  salary?: string;
  notes?: string;
  appliedAt?: string;
  emailSubject?: string;
  emailBody?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanBoard {
  APPLIED: Application[];
  ACKNOWLEDGED: Application[];
  TECHNICAL: Application[];
  INTERVIEW: Application[];
  OFFER: Application[];
  REJECTED: Application[];
  WITHDRAWN: Application[];
}

export interface ApplicationStats {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  responseRate: number;
  byMonth?: { month: string; count: number }[];
  bySource?: { EMAIL: number; MANUAL: number; JOB_BOARD: number };
}

export interface CreateApplicationDto {
  company: string;
  jobTitle: string;
  status?: ApplicationStatus;
  source?: 'EMAIL' | 'MANUAL' | 'JOB_BOARD';
  jobUrl?: string;
  location?: string;
  salary?: string;
  notes?: string;
  appliedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  private readonly base = `${environment.apiUrl}/applications`;

  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<Application[]>(this.base);
  }

  getKanban() {
    return this.http.get<KanbanBoard>(`${this.base}/kanban`);
  }

  getStats() {
    return this.http.get<ApplicationStats>(`${this.base}/stats`);
  }

  create(dto: CreateApplicationDto) {
    return this.http.post<Application>(this.base, dto);
  }

  update(id: string, dto: Partial<CreateApplicationDto> & { status?: ApplicationStatus }) {
    return this.http.patch<Application>(`${this.base}/${id}`, dto);
  }

  delete(id: string) {
    return this.http.delete(`${this.base}/${id}`);
  }

  deduplicateApplications() {
    return this.http.delete<{ removed: number }>(`${this.base}/duplicates`);
  }
}
