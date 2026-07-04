import { Component, OnInit, inject, computed, signal } from '@angular/core';
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
export class EmailComponent implements OnInit {
  readonly emailService = inject(EmailService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  emailConnections = signal<EmailConnection[]>([]);

  hasGmail = computed(() => this.emailConnections().some((c) => c.provider === 'GMAIL'));
  hasOutlook = computed(() => this.emailConnections().some((c) => c.provider === 'OUTLOOK'));

  ngOnInit() {
    this.emailService.getConnections().subscribe({
      next: (conns) => { this.emailConnections.set(conns); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
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
    this.emailService.startGmailSync();
  }

  syncOutlook() {
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
