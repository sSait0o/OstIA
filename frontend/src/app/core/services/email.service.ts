import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { environment } from '@environments/environment';
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
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  error?: boolean;
  labelMissing?: boolean;
}

export interface SyncStatus {
  gmail: SyncProgress | null;
  outlook: SyncProgress | null;
}

export interface EmailConnection {
  id: string;
  provider: 'GMAIL' | 'OUTLOOK';
  email: string;
  isActive: boolean;
  createdAt: string;
  nextSyncAvailableAt: string | null;
  syncAttemptsRemaining: number;
}

@Injectable({ providedIn: 'root' })
export class EmailService {
  private readonly base = `${environment.apiUrl}/email`;

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
  ) {
    this.resumeActiveSyncs();
  }

  getConnections() {
    return this.http.get<EmailConnection[]>(`${this.base}/connections`);
  }

  getSyncStatus() {
    return this.http.get<SyncStatus>(`${this.base}/sync/status`);
  }

  private resumeActiveSyncs() {
    if (!this.authService.getToken()) return;
    this.getSyncStatus().subscribe({
      next: (status) => {
        if (status.gmail && !status.gmail.done) {
          this.syncingGmail.set(true);
          this.applyGmailStatus(status.gmail);
          this.pollGmailSync();
        }
        if (status.outlook && !status.outlook.done) {
          this.syncingOutlook.set(true);
          this.applyOutlookStatus(status.outlook);
          this.pollOutlookSync();
        }
      },
    });
  }

  private applyGmailStatus(p: SyncProgress) {
    this.gmailSyncPercent.set(p.percent);
    if (p.current) this.gmailSyncCurrent.set(p.current);
    if (p.total) this.gmailSyncTotal.set(p.total);
    this.gmailSyncEtaSeconds.set(p.done ? 0 : (p.estimatedSecondsRemaining ?? 0));
  }

  private applyOutlookStatus(p: SyncProgress) {
    this.outlookSyncPercent.set(p.percent);
    if (p.current) this.outlookSyncCurrent.set(p.current);
    if (p.total) this.outlookSyncTotal.set(p.total);
    this.outlookSyncEtaSeconds.set(p.done ? 0 : (p.estimatedSecondsRemaining ?? 0));
  }

  private pollGmailSync() {
    const tick = () => {
      if (!this.syncingGmail()) return;
      this.getSyncStatus().subscribe({
        next: (status) => {
          if (!status.gmail) { this.syncingGmail.set(false); return; }
          this.applyGmailStatus(status.gmail);
          if (status.gmail.done) {
            this.reportSyncResult(status.gmail, 'Gmail');
            this.syncingGmail.set(false);
            return;
          }
          setTimeout(tick, 1000);
        },
        error: () => { this.message.error('Erreur de synchronisation Gmail'); this.syncingGmail.set(false); },
      });
    };
    setTimeout(tick, 1000);
  }

  private pollOutlookSync() {
    const tick = () => {
      if (!this.syncingOutlook()) return;
      this.getSyncStatus().subscribe({
        next: (status) => {
          if (!status.outlook) { this.syncingOutlook.set(false); return; }
          this.applyOutlookStatus(status.outlook);
          if (status.outlook.done) {
            this.reportSyncResult(status.outlook, 'Outlook');
            this.syncingOutlook.set(false);
            return;
          }
          setTimeout(tick, 1000);
        },
        error: () => { this.message.error('Erreur de synchronisation Outlook'); this.syncingOutlook.set(false); },
      });
    };
    setTimeout(tick, 1000);
  }

  private reportSyncResult(p: SyncProgress, providerLabel: string) {
    if (p.error) {
      this.message.error(`Erreur de synchronisation ${providerLabel}`);
      return;
    }
    if (p.rateLimited) {
      this.message.warning(
        `Limite de synchronisation atteinte (3 essais). Réessayez dans ${this.formatRetryDelay(p.retryAfterSeconds ?? 0)}.`,
      );
      return;
    }
    if (p.labelMissing) {
      const noun = providerLabel === 'Outlook' ? 'dossier' : 'libellé';
      this.message.warning(
        `Aucun ${noun} "OstIA" trouvé dans ${providerLabel}. Créez-le vous-même et déplacez-y vos emails de candidature, puis relancez la synchronisation.`,
      );
      return;
    }
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
        this.applyGmailStatus(p);
        if (p.done) {
          this.reportSyncResult(p, 'Gmail');
          this.syncingGmail.set(false);
        }
      },
      error: () => { this.message.error('Erreur de synchronisation Gmail'); this.syncingGmail.set(false); },
    });
  }

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
        this.applyOutlookStatus(p);
        if (p.done) {
          this.reportSyncResult(p, 'Outlook');
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

  private formatRetryDelay(seconds: number): string {
    const totalMinutes = Math.ceil(seconds / 60);
    if (totalMinutes < 60) return totalMinutes <= 1 ? '1 minute' : `${totalMinutes} minutes`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${hours}h`;
  }
}
