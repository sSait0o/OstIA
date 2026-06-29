import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { EmailService, EmailConnection } from '../../core/services/email.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-email',
  standalone: true,
  imports: [
    NzCardModule, NzButtonModule, NzIconModule, NzTagModule,
    NzDividerModule, NzProgressModule, NzSpinModule,
  ],
  templateUrl: './email.component.html',
  styleUrl: './email.component.scss',
})
export class EmailComponent implements OnInit {
  private readonly emailService = inject(EmailService);
  private readonly authService = inject(AuthService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  syncingGmail = signal(false);
  syncingOutlook = signal(false);
  gmailSyncPercent = signal(0);
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
    const token = this.authService.getToken();
    if (!token) return;
    this.syncingGmail.set(true);
    this.gmailSyncPercent.set(0);
    this.emailService.syncGmailStream(token).subscribe({
      next: (p) => {
        this.gmailSyncPercent.set(p.percent);
        if (p.done) {
          const parts: string[] = [`${p.synced} emails analysés`, `${p.created} candidature(s) créée(s)`];
          if (p.skipped) parts.push(`${p.skipped} doublon(s) ignoré(s)`);
          if (p.failed) parts.push(`${p.failed} non reconnu(s) par l'IA`);
          this.message.success(parts.join(', '));
          this.syncingGmail.set(false);
        }
      },
      error: () => { this.message.error('Erreur de synchronisation Gmail'); this.syncingGmail.set(false); },
    });
  }

  syncOutlook() {
    this.syncingOutlook.set(true);
    this.emailService.syncOutlook().subscribe({
      next: ({ synced, created, skipped, failed }) => {
        const parts: string[] = [`${synced} emails analysés`, `${created} candidature(s) créée(s)`];
        if (skipped) parts.push(`${skipped} doublon(s) ignoré(s)`);
        if (failed) parts.push(`${failed} non reconnu(s) par l'IA`);
        this.message.success(parts.join(', '));
        this.syncingOutlook.set(false);
      },
      error: () => { this.message.error('Erreur de synchronisation Outlook'); this.syncingOutlook.set(false); },
    });
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
