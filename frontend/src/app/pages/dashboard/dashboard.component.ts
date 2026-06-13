import { Component, OnInit, inject, signal } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApplicationsService, ApplicationStats } from '../../core/services/applications.service';
import { EmailService } from '../../core/services/email.service';
import type { EChartsOption } from 'echarts';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    NgxEchartsModule, NzCardModule, NzStatisticModule, NzGridModule,
    NzSpinModule, NzTagModule, NzButtonModule, NzIconModule,
  ],
  template: `
    <h2>Dashboard</h2>

    @if (loading()) {
      <div style="text-align:center; padding:60px"><nz-spin nzSize="large"></nz-spin></div>
    } @else {
      <div nz-row [nzGutter]="[16, 16]" style="margin-bottom:24px">
        <div nz-col [nzXs]="12" [nzSm]="6">
          <nz-card>
            <nz-statistic
              nzTitle="Total candidatures"
              [nzValue]="stats()?.total ?? 0"
              [nzValueStyle]="{ color: '#1890ff' }"
            ></nz-statistic>
          </nz-card>
        </div>
        <div nz-col [nzXs]="12" [nzSm]="6">
          <nz-card>
            <nz-statistic
              nzTitle="Taux de réponse"
              [nzValue]="stats()?.responseRate ?? 0"
              nzSuffix="%"
              [nzValueStyle]="{ color: '#52c41a' }"
            ></nz-statistic>
          </nz-card>
        </div>
        <div nz-col [nzXs]="12" [nzSm]="6">
          <nz-card>
            <nz-statistic
              nzTitle="Entretiens"
              [nzValue]="stats()?.byStatus?.['INTERVIEW'] ?? 0"
              [nzValueStyle]="{ color: '#faad14' }"
            ></nz-statistic>
          </nz-card>
        </div>
        <div nz-col [nzXs]="12" [nzSm]="6">
          <nz-card>
            <nz-statistic
              nzTitle="Offres reçues"
              [nzValue]="stats()?.byStatus?.['OFFER'] ?? 0"
              [nzValueStyle]="{ color: '#52c41a' }"
            ></nz-statistic>
          </nz-card>
        </div>
      </div>

      <div nz-row [nzGutter]="[16, 16]">
        <div nz-col [nzXs]="24" [nzSm]="12">
          <nz-card nzTitle="Répartition par statut">
            <div echarts [options]="pieOptions()" style="height:300px"></div>
          </nz-card>
        </div>
        <div nz-col [nzXs]="24" [nzSm]="12">
          <nz-card nzTitle="Connexions email">
            <div style="padding:8px 0">
              @for (conn of emailConnections(); track conn.id) {
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f0f0f0">
                  <div>
                    <span nz-icon [nzType]="conn.provider === 'GMAIL' ? 'google' : 'windows'"></span>
                    <span style="margin-left:8px">{{ conn.email }}</span>
                  </div>
                  <nz-tag nzColor="green">Actif</nz-tag>
                </div>
              } @empty {
                <div style="color:#999; text-align:center; padding:20px">
                  Aucun compte email connecté
                </div>
              }
              <div style="margin-top:16px; display:flex; gap:8px">
                <button nz-button nzSize="small" (click)="connectGmail()">
                  <span nz-icon nzType="mail"></span> Connecter Gmail
                </button>
                <button nz-button nzSize="small" (click)="syncGmail()" [nzLoading]="syncing()">
                  <span nz-icon nzType="sync"></span> Synchroniser
                </button>
              </div>
            </div>
          </nz-card>
        </div>
      </div>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly appsService = inject(ApplicationsService);
  private readonly emailService = inject(EmailService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  syncing = signal(false);
  stats = signal<ApplicationStats | null>(null);
  emailConnections = signal<any[]>([]);

  pieOptions = signal<EChartsOption>({});

  private readonly STATUS_LABELS: Record<string, string> = {
    APPLIED: 'Envoyée',
    ACKNOWLEDGED: 'Reçue',
    INTERVIEW: 'Entretien',
    TECHNICAL: 'Test technique',
    OFFER: 'Offre',
    REJECTED: 'Refusé',
    WITHDRAWN: 'Retirée',
  };

  private readonly STATUS_COLORS: Record<string, string> = {
    APPLIED: '#8c8c8c',
    ACKNOWLEDGED: '#1890ff',
    INTERVIEW: '#faad14',
    TECHNICAL: '#722ed1',
    OFFER: '#52c41a',
    REJECTED: '#ff4d4f',
    WITHDRAWN: '#d9d9d9',
  };

  ngOnInit() {
    this.appsService.getStats().subscribe({
      next: (s) => {
        this.stats.set(s);
        this.buildPieChart(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

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
        type: 'pie',
        radius: ['40%', '70%'],
        data,
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
      }],
    });
  }

  connectGmail() {
    this.emailService.getGoogleAuthUrl().subscribe({
      next: ({ url }) => window.open(url, '_blank'),
    });
  }

  syncGmail() {
    this.syncing.set(true);
    this.emailService.syncGmail().subscribe({
      next: ({ synced, created }) => {
        this.message.success(`${synced} emails analysés, ${created} candidatures créées`);
        this.syncing.set(false);
      },
      error: () => {
        this.message.error('Erreur de synchronisation');
        this.syncing.set(false);
      },
    });
  }
}
