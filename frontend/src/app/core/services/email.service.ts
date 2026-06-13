import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface EmailConnection {
  id: string;
  provider: 'GMAIL' | 'OUTLOOK';
  email: string;
  isActive: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class EmailService {
  private readonly base = `${environment.apiUrl}/email`;

  constructor(private readonly http: HttpClient) {}

  getConnections() {
    return this.http.get<EmailConnection[]>(`${this.base}/connections`);
  }

  getGoogleAuthUrl() {
    return this.http.get<{ url: string }>(`${this.base}/google/auth`);
  }

  getMicrosoftAuthUrl() {
    return this.http.get<{ url: string }>(`${this.base}/microsoft/auth`);
  }

  syncGmail() {
    return this.http.post<{ synced: number; created: number }>(`${this.base}/sync/gmail`, {});
  }

  disconnect(id: string) {
    return this.http.delete(`${this.base}/connections/${id}`);
  }
}
