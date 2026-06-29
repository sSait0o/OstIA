import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { JobsService, Job } from '../../core/services/jobs.service';
import { ApplicationsService } from '../../core/services/applications.service';

type ScoreFilter = 'all' | 'good' | 'medium';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    FormsModule, RouterLink,
    NzCardModule, NzTagModule, NzButtonModule, NzIconModule,
    NzInputModule, NzProgressModule, NzSpinModule,
    NzDividerModule, NzEmptyModule, NzGridModule,
    NzAlertModule, NzToolTipModule,
  ],
  templateUrl: './jobs.component.html',
  styleUrl: './jobs.component.scss',
})
export class JobsComponent implements OnInit {
  private readonly jobsService = inject(JobsService);
  private readonly appsService = inject(ApplicationsService);
  private readonly message = inject(NzMessageService);

  loading = signal(false);
  jobs = signal<Job[]>([]);
  keywords = 'data engineer alternance';
  location = '';
  searched = false;
  scoreFilter = signal<ScoreFilter>('all');
  applyingIds = signal<Set<string>>(new Set());

  noCvUploaded = computed(() =>
    this.jobs().length > 0 &&
    this.jobs().every((j) => !j.matchScore && j.matchDetails?.summary?.includes('CV'))
  );

  filteredJobs = computed(() => {
    const filter = this.scoreFilter();
    return this.jobs().filter((j) => {
      if (filter === 'good') return (j.matchScore ?? 0) >= 70;
      if (filter === 'medium') return (j.matchScore ?? 0) >= 40;
      return true;
    });
  });

  scoreFormat = (percent: number) => `${percent}%`;

  ngOnInit() {
    this.search();
  }

  getScoreColor(score: number): string {
    if (score >= 70) return '#52c41a';
    if (score >= 40) return '#ffc53d';
    return '#ff4d4f';
  }

  setFilter(f: ScoreFilter) {
    this.scoreFilter.set(f);
  }

  search() {
    this.loading.set(true);
    this.searched = true;
    this.jobsService.search({ keywords: this.keywords, location: this.location }).subscribe({
      next: (jobs) => {
        this.jobs.set(jobs);
        this.loading.set(false);
      },
      error: () => {
        this.message.error('Erreur lors de la recherche');
        this.loading.set(false);
      },
    });
  }

  toggleSave(job: Job) {
    this.jobsService.toggleSave(job.id).subscribe({
      next: (updated) => {
        this.jobs.update((list) => list.map((j) => (j.id === updated.id ? updated : j)));
      },
    });
  }

  applyFromJob(job: Job) {
    if (job.isApplied) return;
    this.applyingIds.update((s) => new Set([...s, job.id]));
    this.appsService.create({
      company: job.company,
      jobTitle: job.title,
      status: 'APPLIED',
      source: 'JOB_BOARD',
      jobUrl: job.url,
      location: job.location,
      salary: job.salary,
      appliedAt: new Date().toISOString(),
    }).subscribe({
      next: () => {
        this.jobs.update((list) =>
          list.map((j) => (j.id === job.id ? { ...j, isApplied: true } : j))
        );
        this.applyingIds.update((s) => { const n = new Set(s); n.delete(job.id); return n; });
        this.message.success(`Candidature créée pour ${job.company}`);
      },
      error: () => {
        this.applyingIds.update((s) => { const n = new Set(s); n.delete(job.id); return n; });
        this.message.error('Erreur lors de la création de la candidature');
      },
    });
  }
}
