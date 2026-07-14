import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@environments/environment';
import { ApplicationStatus, ApplicationSource } from '@shared/models/application.model';

export interface Application {
  id: string;
  company: string;
  jobTitle: string;
  status: ApplicationStatus;
  source: ApplicationSource;
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

export interface ApplicationEmail {
  id: string;
  subject: string | null;
  body: string | null;
  statusDetected: ApplicationStatus | null;
  receivedAt: string | null;
}

export interface KanbanBoard {
  APPLIED: Application[];
  ACKNOWLEDGED: Application[];
  TECHNICAL: Application[];
  INTERVIEW: Application[];
  OFFER: Application[];
  REJECTED: Application[];
}

export interface ApplicationStats {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  responseRate: number;
  byMonth?: { month: string; count: number }[];
}

export interface CreateApplicationDto {
  company: string;
  jobTitle: string;
  status?: ApplicationStatus;
  source?: ApplicationSource;
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

  getAll(page = 1, limit = 20) {
    return this.http.get<{ data: Application[]; total: number; page: number; limit: number }>(
      `${this.base}?page=${page}&limit=${limit}`,
    );
  }

  getKanban() {
    return this.http.get<KanbanBoard>(`${this.base}/kanban`);
  }

  getStats() {
    return this.http.get<ApplicationStats>(`${this.base}/stats`);
  }

  getEmails(id: string) {
    return this.http.get<ApplicationEmail[]>(`${this.base}/${id}/emails`);
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
