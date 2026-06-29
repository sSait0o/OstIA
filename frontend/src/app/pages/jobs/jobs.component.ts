import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { JobsService, Job, JobSearchParams } from '../../core/services/jobs.service';
import { ApplicationsService } from '../../core/services/applications.service';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    FormsModule, RouterLink,
    NzCardModule, NzTagModule, NzButtonModule, NzIconModule,
    NzInputModule, NzInputNumberModule, NzProgressModule, NzSpinModule,
    NzDividerModule, NzEmptyModule, NzGridModule,
    NzAlertModule, NzToolTipModule, NzPaginationModule, NzSelectModule,
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
  searched = false;
  applyingIds = signal<Set<string>>(new Set());

  keywords = '';
  location = '';
  contractTypes: string[] = [];
  experience = '';
  distance: number | null = null;
  workingTime = '';
  remote = '';
  salaryMin: number | null = null;
  sortBy = '';

  readonly pageSize = 9;

  readonly contractTypeOptions = [
    { label: 'CDI', value: 'CDI' },
    { label: 'CDD', value: 'CDD' },
    { label: 'Intérim', value: 'MIS' },
    { label: 'Alternance', value: 'APP' },
    { label: 'Professionnalisation', value: 'PRO' },
    { label: 'Saisonnier', value: 'SAI' },
  ];

  readonly experienceOptions = [
    { label: 'Débutant (< 1 an)', value: '1' },
    { label: 'Junior (1–3 ans)', value: '2' },
    { label: 'Senior (3+ ans)', value: '3' },
  ];

  readonly distanceOptions = [
    { label: '10 km', value: 10 },
    { label: '20 km', value: 20 },
    { label: '30 km', value: 30 },
    { label: '50 km', value: 50 },
    { label: '100 km', value: 100 },
  ];

  readonly remoteOptions = [
    { label: '100% télétravail', value: 'TELETRAVAIL_COMPLET' },
    { label: 'Télétravail partiel', value: 'TELETRAVAIL_PARTIEL' },
    { label: 'Présentiel', value: 'PRESENTIEL' },
  ];

  readonly sortOptions = [
    { label: 'Pertinence', value: 'pertinence' },
    { label: 'Plus récentes', value: 'date' },
  ];

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
    this.contractTypes = qp['contractTypes'] ? (qp['contractTypes'] as string).split(',') : [];
    this.experience = qp['experience'] ?? '';
    this.distance = qp['distance'] ? +qp['distance'] : null;
    this.workingTime = qp['workingTime'] ?? '';
    this.remote = qp['remote'] ?? '';
    this.salaryMin = qp['salaryMin'] ? +qp['salaryMin'] : null;
    this.sortBy = qp['sortBy'] ?? '';
    const page = +(qp['page'] ?? 1);

    const cached = this.jobsService.cachedState();
    const paramsKey = this.serializeParams(page);
    const cachedKey = cached
      ? this.serializeParams(cached.page ?? 1, cached)
      : null;

    if (cached && paramsKey === cachedKey) {
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

  private buildParams(page: number): JobSearchParams {
    return {
      keywords: this.keywords || undefined,
      location: this.location || undefined,
      contractTypes: this.contractTypes.length ? this.contractTypes : undefined,
      experience: this.experience || undefined,
      distance: this.distance ?? undefined,
      fullTime: this.workingTime === 'full' ? true : this.workingTime === 'part' ? false : null,
      remote: this.remote || undefined,
      salaryMin: this.salaryMin ?? undefined,
      sortBy: this.sortBy || undefined,
      page,
    };
  }

  private serializeParams(page: number, override?: Partial<JobSearchParams>): string {
    const p = override ?? this.buildParams(page);
    return JSON.stringify({
      keywords: p.keywords ?? '',
      location: p.location ?? '',
      contractTypes: (p.contractTypes ?? []).join(','),
      experience: p.experience ?? '',
      distance: p.distance ?? '',
      fullTime: p.fullTime ?? '',
      remote: p.remote ?? '',
      salaryMin: p.salaryMin ?? '',
      sortBy: p.sortBy ?? '',
      page,
    });
  }

  private fetch(page: number) {
    this.loading.set(true);
    this.searched = true;
    this.jobsService.search(this.buildParams(page)).subscribe({
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
      queryParams: {
        keywords: this.keywords || null,
        location: this.location || null,
        contractTypes: this.contractTypes.length ? this.contractTypes.join(',') : null,
        experience: this.experience || null,
        distance: this.distance ?? null,
        workingTime: this.workingTime || null,
        remote: this.remote || null,
        salaryMin: this.salaryMin ?? null,
        sortBy: this.sortBy || null,
        page: page > 1 ? page : null,
      },
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
