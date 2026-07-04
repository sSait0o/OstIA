import { Component, OnInit, OnDestroy, inject, computed, effect, signal } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { EmailService, EmailConnection } from '../../core/services/email.service';

@Component({
  selector: 'app-email',
  standalone: true,
  imports: [
    NzCardModule, NzButtonModule, NzIconModule, NzTagModule,
    NzDividerModule, NzProgressModule, NzSpinModule, NzPopconfirmModule,
    NzAlertModule,
  ],
  templateUrl: './email.component.html',
  styleUrl: './email.component.scss',
})
export class EmailComponent implements OnInit, OnDestroy {
  readonly emailService = inject(EmailService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  emailConnections = signal<EmailConnection[]>([]);
  now = signal(Date.now());

  private tickInterval?: ReturnType<typeof setInterval>;
  private wasSyncingGmail = false;
  private wasSyncingOutlook = false;

  hasGmail = computed(() => this.emailConnections().some((c) => c.provider === 'GMAIL'));
  hasOutlook = computed(() => this.emailConnections().some((c) => c.provider === 'OUTLOOK'));

  gmailSyncRemainingMs = computed(() =>
    this.remainingMs(this.emailConnections().find((c) => c.provider === 'GMAIL')?.nextSyncAvailableAt),
  );
  outlookSyncRemainingMs = computed(() =>
    this.remainingMs(this.emailConnections().find((c) => c.provider === 'OUTLOOK')?.nextSyncAvailableAt),
  );

  constructor() {
    effect(() => {
      const syncing = this.emailService.syncingGmail();
      if (this.wasSyncingGmail && !syncing) this.refreshConnections();
      this.wasSyncingGmail = syncing;
    });
    effect(() => {
      const syncing = this.emailService.syncingOutlook();
      if (this.wasSyncingOutlook && !syncing) this.refreshConnections();
      this.wasSyncingOutlook = syncing;
    });
  }

  ngOnInit() {
    this.tickInterval = setInterval(() => this.now.set(Date.now()), 1000);
    this.emailService.getConnections().subscribe({
      next: (conns) => { this.emailConnections.set(conns); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  ngOnDestroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  private refreshConnections() {
    this.emailService.getConnections().subscribe({
      next: (conns) => this.emailConnections.set(conns),
    });
  }

  private remainingMs(nextSyncAvailableAt: string | null | undefined): number {
    if (!nextSyncAvailableAt) return 0;
    return Math.max(0, new Date(nextSyncAvailableAt).getTime() - this.now());
  }

  formatCountdown(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
    if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  connectGmail() {
    this.emailService.getGoogleAuthUrl().subscribe({
      next: ({ url }) => window.open(url, '_blank'),
    });
  }

  connectOutlook() {
    this.emailService.getMicrosoftAuthUrl().subscribe({
      next: ({ url }) => window.open(url, '_blank'),
    });
  }

  syncGmail() {
    if (this.gmailSyncRemainingMs() > 0) return;
    this.emailService.startGmailSync();
  }

  syncOutlook() {
    if (this.outlookSyncRemainingMs() > 0) return;
    this.emailService.startOutlookSync();
  }

  resetGmailData() {
    this.emailService.resetGmailData().subscribe({
      next: ({ applicationsRemoved, syncRecordsRemoved, labelsStripped, labelsRemaining }) => {
        this.message.success(
          `${applicationsRemoved} candidature(s) et ${syncRecordsRemoved} entrée(s) de sync supprimées, ${labelsStripped} email(s) repassé(s) en libellé OstIA seul`,
        );
        if (labelsRemaining > 0) {
          this.message.warning(
            `${labelsRemaining} email(s) gardent encore un sous-libellé malgré la vérification. Relancez "Tout supprimer" pour réessayer.`,
          );
        }
      },
      error: () => this.message.error('Erreur lors de la suppression des données Gmail'),
    });
  }

  resetOutlookData() {
    this.emailService.resetOutlookData().subscribe({
      next: ({ applicationsRemoved, syncRecordsRemoved }) => {
        this.message.success(
          `${applicationsRemoved} candidature(s) et ${syncRecordsRemoved} entrée(s) de sync supprimées`,
        );
      },
      error: () => this.message.error('Erreur lors de la suppression des données Outlook'),
    });
  }

  formatEta(seconds: number): string {
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  }

  disconnect(id: string) {
    this.emailService.disconnect(id).subscribe({
      next: () => {
        this.message.success('Compte déconnecté');
        this.emailService.getConnections().subscribe({ next: (c) => this.emailConnections.set(c) });
      },
    });
  }
}
