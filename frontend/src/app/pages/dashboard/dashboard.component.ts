import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgxEchartsModule } from 'ngx-echarts';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApplicationsService, ApplicationStats } from '@core/services/applications.service';
import { JobsService, Job } from '@core/services/jobs.service';
import { UserService } from '@core/services/user.service';
import { getScoreColor, scoreFormat } from '@shared/utils/score.utils';
import { getStatusHex, getStatusLabel } from '@shared/utils/status-colors.utils';
import { echartsTooltipTheme, chartAccentColor, chartAccentColorHover } from '@shared/utils/echarts-theme.utils';
import type { EChartsOption } from 'echarts';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    NgxEchartsModule, NzCardModule, NzStatisticModule, NzGridModule,
    NzSpinModule, NzButtonModule, NzIconModule, NzProgressModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly appsService = inject(ApplicationsService);
  private readonly jobsService = inject(JobsService);
  private readonly userService = inject(UserService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  stats = signal<ApplicationStats | null>(null);
  topJobs = signal<Job[]>([]);
  pieOptions = signal<EChartsOption>({});
  barOptions = signal<EChartsOption>({});
  funnelOptions = signal<EChartsOption>({});
  exportingData = signal(false);

  ngOnInit() {
    this.appsService.getStats().subscribe({
      next: (s) => {
        this.stats.set(s);
        this.buildPieChart(s);
        this.buildBarChart(s);
        this.buildFunnelChart(s);
        this.loading.set(false);
      },
      error: () => {
        this.message.error('Erreur lors du chargement des statistiques');
        this.loading.set(false);
      },
    });
    this.loadTopJobs();
  }

  exportMyData() {
    if (this.exportingData()) return;
    this.exportingData.set(true);
    this.userService.exportData().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ostia-candidatures-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        this.exportingData.set(false);
      },
      error: () => {
        this.message.error("Erreur lors de l'export des données");
        this.exportingData.set(false);
      },
    });
  }

  private loadTopJobs() {
    this.jobsService.getSaved().subscribe({
      next: (jobs) => {
        const withScore = jobs
          .filter((j) => j.matchScore != null && j.matchScore > 0)
          .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
          .slice(0, 4);
        this.topJobs.set(withScore);
      },
      error: () => this.message.error('Erreur lors du chargement des offres sauvegardées'),
    });
  }

  readonly scoreFormat = scoreFormat;
  readonly getScoreColor = getScoreColor;

  private buildPieChart(s: ApplicationStats) {
    const byStatus = { ...s.byStatus };
    byStatus['APPLIED'] = (byStatus['APPLIED'] ?? 0) + (byStatus['ACKNOWLEDGED'] ?? 0);
    delete (byStatus as Partial<typeof byStatus>)['ACKNOWLEDGED'];

    const data = Object.entries(byStatus)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({
        name: getStatusLabel(k),
        value: v,
        itemStyle: { color: getStatusHex(k) },
      }));

    this.pieOptions.set({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <b>{c}</b> ({d}%)',
        ...echartsTooltipTheme,
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
        ...echartsTooltipTheme,
      },
      xAxis: {
        type: 'category',
        data: s.byDay?.map((d) => d.day) ?? [],
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        axisTick: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 12, interval: 'auto', hideOverlap: true },
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
        data: s.byDay?.map((d) => d.count) ?? [],
        itemStyle: { color: chartAccentColor, borderRadius: [3, 3, 0, 0] },
        emphasis: { itemStyle: { color: chartAccentColorHover } },
        barMaxWidth: 16,
      }],
      grid: { left: '2%', right: '2%', bottom: '4%', top: '8%', containLabel: true },
    });
  }

  private buildFunnelChart(s: ApplicationStats) {
    const pipeline = [
      { name: 'Envoyées',   value: (s.byStatus['APPLIED'] ?? 0) + (s.byStatus['ACKNOWLEDGED'] ?? 0), color: getStatusHex('APPLIED') },
      { name: 'Tests',      value: s.byStatus['TECHNICAL'] ?? 0,  color: getStatusHex('TECHNICAL') },
      { name: 'Entretiens', value: s.byStatus['INTERVIEW'] ?? 0,  color: getStatusHex('INTERVIEW') },
      { name: 'Offres',     value: s.byStatus['OFFER'] ?? 0,      color: getStatusHex('OFFER') },
    ];

    this.funnelOptions.set({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: '{b}: <b>{c}</b>',
        ...echartsTooltipTheme,
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
