import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApplicationsService, ApplicationStats } from '../../core/services/applications.service';
import { EmailService, EmailConnection } from '../../core/services/email.service';
import { AuthService } from '../../core/services/auth.service';
import type { EChartsOption } from 'echarts';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    NgxEchartsModule, NzCardModule, NzStatisticModule, NzGridModule,
    NzSpinModule, NzTagModule, NzButtonModule, NzIconModule, NzDividerModule, NzProgressModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly appsService = inject(ApplicationsService);
  private readonly emailService = inject(EmailService);
  private readonly authService = inject(AuthService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  syncingGmail = signal(false);
  syncingOutlook = signal(false);
  gmailSyncPercent = signal(0);
  stats = signal<ApplicationStats | null>(null);
  emailConnections = signal<EmailConnection[]>([]);
  pieOptions = signal<EChartsOption>({});

  hasGmail = computed(() => this.emailConnections().some((c) => c.provider === 'GMAIL'));
  hasOutlook = computed(() => this.emailConnections().some((c) => c.provider === 'OUTLOOK'));

  private readonly STATUS_LABELS: Record<string, string> = {
    APPLIED: 'Envoyée', ACKNOWLEDGED: 'Reçue', INTERVIEW: 'Entretien',
    TECHNICAL: 'Test technique', OFFER: 'Offre', REJECTED: 'Refusé', WITHDRAWN: 'Retirée',
  };

  private readonly STATUS_COLORS: Record<string, string> = {
    APPLIED: '#4a9eff',
    ACKNOWLEDGED: '#36cfc9',
    INTERVIEW: '#ffc53d',
    TECHNICAL: '#b37feb',
    OFFER: '#52c41a',
    REJECTED: '#ff4d4f',
    WITHDRAWN: '#8c8c8c',
  };

  ngOnInit() {
    this.appsService.getStats().subscribe({
      next: (s) => { this.stats.set(s); this.buildPieChart(s); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.loadConnections();
  }

  private loadConnections() {
    this.emailService.getConnections().subscribe({
      next: (conns) => this.emailConnections.set(conns),
    });
  }

  private buildPieChart(s: ApplicationStats) {
    const data = Object.entries(s.byStatus)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({
        name: this.STATUS_LABELS[k] || k,
        value: v,
        itemStyle: { color: this.STATUS_COLORS[k] },
      }));

    this.pieOptions.set({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <b>{c}</b> ({d}%)',
        backgroundColor: 'rgba(10,10,30,0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        textStyle: { color: '#e8e8e8', fontSize: 13 },
      },
      legend: {
        orient: 'horizontal',
        bottom: 0,
        textStyle: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
        icon: 'circle',
        itemWidth: 10,
        itemHeight: 10,
      },
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '45%'],
        data,
        label: {
          show: true,
          color: 'rgba(255,255,255,0.7)',
          fontSize: 12,
          formatter: '{d}%',
        },
        labelLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        emphasis: {
          itemStyle: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.6)' },
          label: { fontSize: 14, fontWeight: 'bold' },
        },
      }],
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
          const skipMsg = p.skipped ? `, ${p.skipped} doublon(s) ignoré(s)` : '';
          this.message.success(`${p.synced} emails analysés, ${p.created} candidatures créées${skipMsg}`);
          this.syncingGmail.set(false);
        }
      },
      error: () => { this.message.error('Erreur de synchronisation Gmail'); this.syncingGmail.set(false); },
    });
  }

  syncOutlook() {
    this.syncingOutlook.set(true);
    this.emailService.syncOutlook().subscribe({
      next: ({ synced, created, skipped }) => {
        const skipMsg = skipped ? `, ${skipped} doublon(s) ignoré(s)` : '';
        this.message.success(`${synced} emails analysés, ${created} candidatures créées${skipMsg}`);
        this.syncingOutlook.set(false);
      },
      error: () => { this.message.error('Erreur de synchronisation Outlook'); this.syncingOutlook.set(false); },
    });
  }

  disconnect(id: string) {
    this.emailService.disconnect(id).subscribe({
      next: () => { this.message.success('Compte déconnecté'); this.loadConnections(); },
    });
  }
}
