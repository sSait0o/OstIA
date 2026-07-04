import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface SyncProgress {
  percent: number;
  done?: boolean;
  current?: number;
  total?: number;
  estimatedSecondsRemaining?: number;
  synced?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  aiUnavailable?: number;
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

  // Shared state so sync progress stays visible even if the user navigates away.
  syncingGmail = signal(false);
  gmailSyncPercent = signal(0);
  gmailSyncCurrent = signal(0);
  gmailSyncTotal = signal(0);
  gmailSyncEtaSeconds = signal(0);
  syncingOutlook = signal(false);
  outlookSyncPercent = signal(0);
  outlookSyncCurrent = signal(0);
  outlookSyncTotal = signal(0);
  outlookSyncEtaSeconds = signal(0);

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly message: NzMessageService,
  ) {}

  getConnections() {
    return this.http.get<EmailConnection[]>(`${this.base}/connections`);
  }

  getGoogleAuthUrl() {
    return this.http.get<{ url: string }>(`${this.base}/google/auth`);
  }

  getMicrosoftAuthUrl() {
    return this.http.get<{ url: string }>(`${this.base}/microsoft/auth`);
  }

  syncGmailStream(token: string): Observable<SyncProgress> {
    return this.streamSync(`${this.base}/sync/gmail/stream`, token);
  }

  syncOutlookStream(token: string): Observable<SyncProgress> {
    return this.streamSync(`${this.base}/sync/outlook/stream`, token);
  }

  private streamSync(url: string, token: string): Observable<SyncProgress> {
    return new Observable((subscriber) => {
      const es = new EventSource(`${url}?token=${encodeURIComponent(token)}`);
      es.onmessage = (e) => {
        const data: SyncProgress = JSON.parse(e.data);
        subscriber.next(data);
        if (data.done) { es.close(); subscriber.complete(); }
      };
      es.onerror = () => { subscriber.error(new Error('Erreur SSE')); es.close(); };
      return () => es.close();
    });
  }

  /** Starts Gmail sync in the background; state stays accessible from any page. */
  startGmailSync() {
    const token = this.authService.getToken();
    if (!token || this.syncingGmail()) return;
    this.syncingGmail.set(true);
    this.gmailSyncPercent.set(0);
    this.gmailSyncCurrent.set(0);
    this.gmailSyncTotal.set(0);
    this.gmailSyncEtaSeconds.set(0);
    this.syncGmailStream(token).subscribe({
      next: (p) => {
        this.gmailSyncPercent.set(p.percent);
        if (p.current) this.gmailSyncCurrent.set(p.current);
        if (p.total) this.gmailSyncTotal.set(p.total);
        this.gmailSyncEtaSeconds.set(p.done ? 0 : (p.estimatedSecondsRemaining ?? 0));
        if (p.done) {
          const parts: string[] = [`${p.synced} emails analysés`, `${p.created} candidature(s) créée(s)`];
          if (p.updated) parts.push(`${p.updated} mise(s) à jour`);
          if (p.skipped) parts.push(`${p.skipped} doublon(s) ignoré(s)`);
          if (p.failed) parts.push(`${p.failed} non reconnu(s) par l'IA`);
          this.message.success(parts.join(', '));
          if (p.aiUnavailable) {
            this.message.warning(
              `${p.aiUnavailable} email(s) non traité(s) : service IA indisponible (limite de débit atteinte). Relancez la synchronisation dans quelques minutes pour les récupérer.`,
            );
          }
          this.syncingGmail.set(false);
        }
      },
      error: () => { this.message.error('Erreur de synchronisation Gmail'); this.syncingGmail.set(false); },
    });
  }

  /** Starts Outlook sync in the background; state stays accessible from any page. */
  startOutlookSync() {
    const token = this.authService.getToken();
    if (!token || this.syncingOutlook()) return;
    this.syncingOutlook.set(true);
    this.outlookSyncPercent.set(0);
    this.outlookSyncCurrent.set(0);
    this.outlookSyncTotal.set(0);
    this.outlookSyncEtaSeconds.set(0);
    this.syncOutlookStream(token).subscribe({
      next: (p) => {
        this.outlookSyncPercent.set(p.percent);
        if (p.current) this.outlookSyncCurrent.set(p.current);
        if (p.total) this.outlookSyncTotal.set(p.total);
        this.outlookSyncEtaSeconds.set(p.done ? 0 : (p.estimatedSecondsRemaining ?? 0));
        if (p.done) {
          const parts: string[] = [`${p.synced} emails analysés`, `${p.created} candidature(s) créée(s)`];
          if (p.updated) parts.push(`${p.updated} mise(s) à jour`);
          if (p.skipped) parts.push(`${p.skipped} doublon(s) ignoré(s)`);
          if (p.failed) parts.push(`${p.failed} non reconnu(s) par l'IA`);
          this.message.success(parts.join(', '));
          if (p.aiUnavailable) {
            this.message.warning(
              `${p.aiUnavailable} email(s) non traité(s) : service IA indisponible (limite de débit atteinte). Relancez la synchronisation dans quelques minutes pour les récupérer.`,
            );
          }
          this.syncingOutlook.set(false);
        }
      },
      error: () => { this.message.error('Erreur de synchronisation Outlook'); this.syncingOutlook.set(false); },
    });
  }

  disconnect(id: string) {
    return this.http.delete(`${this.base}/connections/${id}`);
  }

  resetGmailData() {
    return this.http.delete<{
      applicationsRemoved: number;
      syncRecordsRemoved: number;
      labelsStripped: number;
      labelsRemaining: number;
    }>(`${this.base}/gmail/data`);
  }

  resetOutlookData() {
    return this.http.delete<{ applicationsRemoved: number; syncRecordsRemoved: number }>(`${this.base}/outlook/data`);
  }
}
