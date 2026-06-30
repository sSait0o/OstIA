import { Component, OnInit, DestroyRef, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzAutocompleteModule } from 'ng-zorro-antd/auto-complete';
import { JobsService, Job, JobSearchParams } from '../../core/services/jobs.service';
import { JobCardComponent } from '../../shared/components/job-card/job-card.component';

interface CityOption { name: string; dept: string }
interface GeoCommune { nom: string; codeDepartement: string }

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    FormsModule, RouterLink,
    NzButtonModule, NzIconModule,
    NzInputModule, NzInputNumberModule, NzSpinModule,
    NzEmptyModule, NzGridModule,
    NzAlertModule, NzPaginationModule, NzSelectModule,
    NzAutocompleteModule,
    JobCardComponent,
  ],
  templateUrl: './jobs.component.html',
  styleUrl: './jobs.component.scss',
})
export class JobsComponent implements OnInit {
  private readonly jobsService = inject(JobsService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locationInput$ = new Subject<string>();

  citySuggestions = signal<CityOption[]>([]);

  loading = signal(false);
  jobs = signal<Job[]>([]);
  total = signal(0);
  currentPage = signal(1);
  searched = false;

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

  readonly scoreFilterOptions = [
    { label: 'Tous', value: 'all' },
    { label: 'Bon match (≥ 70%)', value: 'good' },
    { label: 'Moyen (≥ 40%)', value: 'medium' },
  ];

  private readonly _scoreFilter = signal('all');
  get scoreFilter(): string { return this._scoreFilter(); }
  set scoreFilter(v: string) { this._scoreFilter.set(v); }

  noCvUploaded = computed(() =>
    this.jobs().length > 0 &&
    this.jobs().every((j) => !j.matchScore && j.matchDetails?.summary?.includes('CV'))
  );

  filteredJobs = computed(() => {
    const filter = this._scoreFilter();
    const threshold = filter === 'good' ? 70 : filter === 'medium' ? 40 : 0;
    return [...this.jobs()]
      .filter((j) => (j.matchScore ?? 0) >= threshold)
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  });

  ngOnInit() {
    this.locationInput$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(q =>
        q.length < 2
          ? of([])
          : this.http.get<GeoCommune[]>('https://geo.api.gouv.fr/communes', {
              params: { nom: q, fields: 'nom,codeDepartement', boost: 'population', limit: '6' },
            }).pipe(catchError(() => of([])))
      ),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(results => this.citySuggestions.set(results.map(r => ({ name: r.nom, dept: r.codeDepartement }))));

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

  onLocationInput(value: string) {
    this.locationInput$.next(value);
  }

  onCitySelect(city: CityOption) {
    this.location = city.name;
    this.citySuggestions.set([]);
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

  onJobApplied(jobId: string) {
    this.jobs.update((list) => list.map((j) => (j.id === jobId ? { ...j, isApplied: true } : j)));
    this.jobsService.cachedState.update((s) =>
      s ? { ...s, jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, isApplied: true } : j)) } : s
    );
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
}
