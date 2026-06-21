import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SyncProgress {
  percent: number;
  done?: boolean;
  synced?: number;
  created?: number;
  skipped?: number;
}

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
    return this.http.post<{ synced: number; created: number; skipped: number }>(`${this.base}/sync/gmail`, {});
  }

  syncGmailStream(token: string): Observable<SyncProgress> {
    return new Observable((subscriber) => {
      const es = new EventSource(`${this.base}/sync/gmail/stream?token=${encodeURIComponent(token)}`);
      es.onmessage = (e) => {
        const data: SyncProgress = JSON.parse(e.data);
        subscriber.next(data);
        if (data.done) { es.close(); subscriber.complete(); }
      };
      es.onerror = () => { subscriber.error(new Error('Erreur SSE')); es.close(); };
      return () => es.close();
    });
  }

  syncOutlook() {
    return this.http.post<{ synced: number; created: number; skipped: number }>(`${this.base}/sync/outlook`, {});
  }

  disconnect(id: string) {
    return this.http.delete(`${this.base}/connections/${id}`);
  }
}
