import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
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
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { JobsService, Job } from '../../core/services/jobs.service';
import { ApplicationsService } from '../../core/services/applications.service';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    FormsModule, RouterLink,
    NzCardModule, NzTagModule, NzButtonModule, NzIconModule,
    NzInputModule, NzProgressModule, NzSpinModule,
    NzDividerModule, NzEmptyModule, NzGridModule,
    NzAlertModule, NzToolTipModule, NzPaginationModule,
  ],
  templateUrl: './jobs.component.html',
  styleUrl: './jobs.component.scss',
})
export class JobsComponent implements OnInit {
  private readonly jobsService = inject(JobsService);
  private readonly appsService = inject(ApplicationsService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  loading = signal(false);
  jobs = signal<Job[]>([]);
  total = signal(0);
  currentPage = signal(1);
  keywords = '';
  location = '';
  searched = false;
  applyingIds = signal<Set<string>>(new Set());

  readonly pageSize = 9;

  noCvUploaded = computed(() =>
    this.jobs().length > 0 &&
    this.jobs().every((j) => !j.matchScore && j.matchDetails?.summary?.includes('CV'))
  );

  filteredJobs = computed(() =>
    [...this.jobs()].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
  );

  scoreFormat = (percent: number) => `${percent}%`;

  ngOnInit() {
    const qp = this.route.snapshot.queryParams;
    this.keywords = qp['keywords'] ?? '';
    this.location = qp['location'] ?? '';
    const page = +(qp['page'] ?? 1);

    const cached = this.jobsService.cachedState();
    if (
      cached &&
      cached.keywords === this.keywords &&
      cached.location === this.location &&
      cached.page === page
    ) {
      this.jobs.set(cached.jobs);
      this.total.set(cached.total);
      this.currentPage.set(page);
      this.searched = true;
    } else {
      this.currentPage.set(page);
      this.fetch(page);
    }
  }

  search() {
    this.currentPage.set(1);
    this.updateUrl(1);
    this.fetch(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
    this.updateUrl(page);
    this.fetch(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  getScoreColor(score: number): string {
    if (score >= 70) return '#52c41a';
    if (score >= 40) return '#ffc53d';
    return '#ff4d4f';
  }

  private fetch(page: number) {
    this.loading.set(true);
    this.searched = true;
    this.jobsService.search({ keywords: this.keywords, location: this.location, page }).subscribe({
      next: ({ jobs, total }) => {
        this.jobs.set(jobs);
        this.total.set(total);
        this.loading.set(false);
      },
      error: () => {
        this.message.error('Erreur lors de la recherche');
        this.loading.set(false);
      },
    });
  }

  private updateUrl(page: number) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { keywords: this.keywords || null, location: this.location || null, page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  }

  toggleSave(job: Job) {
    this.jobsService.toggleSave(job.id).subscribe({
      next: (updated) => {
        this.jobs.update((list) => list.map((j) => (j.id === updated.id ? updated : j)));
        this.jobsService.cachedState.update((s) =>
          s ? { ...s, jobs: s.jobs.map((j) => (j.id === updated.id ? updated : j)) } : s
        );
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
