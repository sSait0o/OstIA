import { Component, OnInit, inject, signal } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { JobsService, Job } from '../../core/services/jobs.service';
import { ApplicationsService } from '../../core/services/applications.service';

@Component({
  selector: 'app-saved-jobs',
  standalone: true,
  imports: [
    NzCardModule, NzTagModule, NzButtonModule, NzIconModule,
    NzProgressModule, NzSpinModule, NzDividerModule,
    NzEmptyModule, NzGridModule, NzToolTipModule,
  ],
  templateUrl: './saved-jobs.component.html',
  styleUrl: './saved-jobs.component.scss',
})
export class SavedJobsComponent implements OnInit {
  private readonly jobsService = inject(JobsService);
  private readonly appsService = inject(ApplicationsService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  jobs = signal<Job[]>([]);
  applyingIds = signal<Set<string>>(new Set());

  scoreFormat = (percent: number) => `${percent}%`;

  ngOnInit() {
    this.jobsService.getSaved().subscribe({
      next: (jobs) => {
        this.jobs.set(jobs);
        this.loading.set(false);
      },
      error: () => {
        this.message.error('Erreur lors du chargement des favoris');
        this.loading.set(false);
      },
    });
  }

  getScoreColor(score: number): string {
    if (score >= 70) return '#52c41a';
    if (score >= 40) return '#ffc53d';
    return '#ff4d4f';
  }

  toggleSave(job: Job) {
    this.jobsService.toggleSave(job.id).subscribe({
      next: () => {
        this.jobs.update((list) => list.filter((j) => j.id !== job.id));
        this.message.success('Offre retirée des favoris');
      },
      error: () => this.message.error('Erreur lors de la mise à jour'),
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
