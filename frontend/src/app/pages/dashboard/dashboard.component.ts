import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { EmailService, EmailConnection } from '../../core/services/email.service';
import type { EChartsOption } from 'echarts';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    NgxEchartsModule, NzCardModule, NzStatisticModule, NzGridModule,
    NzSpinModule, NzTagModule, NzButtonModule, NzIconModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly appsService = inject(ApplicationsService);
  private readonly emailService = inject(EmailService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  stats = signal<ApplicationStats | null>(null);
  emailConnections = signal<EmailConnection[]>([]);
  pieOptions = signal<EChartsOption>({});
  barOptions = signal<EChartsOption>({});
  funnelOptions = signal<EChartsOption>({});

  private readonly STATUS_LABELS: Record<string, string> = {
    APPLIED: 'Envoyée', ACKNOWLEDGED: 'Envoyée', INTERVIEW: 'Entretien',
    TECHNICAL: 'Test technique', OFFER: 'Offre', REJECTED: 'Refusé', WITHDRAWN: 'Retirée',
  };

  private readonly STATUS_COLORS: Record<string, string> = {
    APPLIED: '#4a9eff',
    ACKNOWLEDGED: '#4a9eff',
    INTERVIEW: '#ffc53d',
    TECHNICAL: '#b37feb',
    OFFER: '#52c41a',
    REJECTED: '#ff4d4f',
    WITHDRAWN: '#8c8c8c',
  };

  ngOnInit() {
    this.appsService.getStats().subscribe({
      next: (s) => {
        this.stats.set(s);
        this.buildPieChart(s);
        this.buildBarChart(s);
        this.buildFunnelChart(s);
        this.loading.set(false);
      },
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

  private buildBarChart(s: ApplicationStats) {
    this.barOptions.set({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(10,10,30,0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        textStyle: { color: '#e8e8e8', fontSize: 13 },
      },
      xAxis: {
        type: 'category',
        data: s.byMonth?.map((m) => m.month) ?? [],
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        axisTick: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        axisLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
      },
      series: [{
        type: 'bar',
        data: s.byMonth?.map((m) => m.count) ?? [],
        itemStyle: { color: '#4a9eff', borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: '#74b8ff' } },
        barMaxWidth: 40,
      }],
      grid: { left: '2%', right: '2%', bottom: '4%', top: '8%', containLabel: true },
    });
  }

  private buildFunnelChart(s: ApplicationStats) {
    const pipeline = [
      { name: 'Envoyées',   value: (s.byStatus['APPLIED'] ?? 0) + (s.byStatus['ACKNOWLEDGED'] ?? 0), color: '#4a9eff' },
      { name: 'Entretiens', value: s.byStatus['INTERVIEW'] ?? 0,  color: '#ffc53d' },
      { name: 'Tests',      value: s.byStatus['TECHNICAL'] ?? 0,  color: '#b37feb' },
      { name: 'Offres',     value: s.byStatus['OFFER'] ?? 0,      color: '#52c41a' },
    ];

    this.funnelOptions.set({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <b>{c}</b>',
        backgroundColor: 'rgba(10,10,30,0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        textStyle: { color: '#e8e8e8', fontSize: 13 },
      },
      series: [{
        type: 'funnel',
        left: '8%',
        width: '84%',
        top: '4%',
        bottom: '4%',
        min: 0,
        max: Math.max(...pipeline.map((d) => d.value), 1),
        minSize: '18%',
        maxSize: '100%',
        sort: 'none',
        gap: 3,
        data: pipeline.map((d) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: d.color, opacity: 0.85 },
        })),
        label: {
          position: 'inside',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          formatter: '{b}: {c}',
        },
        labelLine: { show: false },
        emphasis: { label: { fontSize: 14, fontWeight: 700 } },
      }],
    });
  }

}
