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
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApplicationsService, ApplicationStats } from '../../core/services/applications.service';
import { EmailService, EmailConnection } from '../../core/services/email.service';
import type { EChartsOption } from 'echarts';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    NgxEchartsModule, NzCardModule, NzStatisticModule, NzGridModule,
    NzSpinModule, NzTagModule, NzButtonModule, NzIconModule, NzDividerModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly appsService = inject(ApplicationsService);
  private readonly emailService = inject(EmailService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  syncingGmail = signal(false);
  syncingOutlook = signal(false);
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
    APPLIED: '#8c8c8c', ACKNOWLEDGED: '#1890ff', INTERVIEW: '#faad14',
    TECHNICAL: '#722ed1', OFFER: '#52c41a', REJECTED: '#ff4d4f', WITHDRAWN: '#d9d9d9',
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
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 'left' },
      series: [{
        type: 'pie', radius: ['40%', '70%'], data,
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
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
    this.syncingGmail.set(true);
    this.emailService.syncGmail().subscribe({
      next: ({ synced, created }) => {
        this.message.success(`${synced} emails analysés, ${created} candidatures créées`);
        this.syncingGmail.set(false);
      },
      error: () => { this.message.error('Erreur de synchronisation Gmail'); this.syncingGmail.set(false); },
    });
  }

  syncOutlook() {
    this.syncingOutlook.set(true);
    this.emailService.syncOutlook().subscribe({
      next: ({ synced, created }) => {
        this.message.success(`${synced} emails analysés, ${created} candidatures créées`);
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
