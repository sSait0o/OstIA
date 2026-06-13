import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { JobsService, Job } from '../../core/services/jobs.service';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    FormsModule, NzCardModule, NzTagModule, NzButtonModule, NzIconModule,
    NzInputModule, NzProgressModule, NzSpinModule,
    NzDividerModule, NzEmptyModule, NzGridModule,
  ],
  template: `
    <h2>Offres d'emploi</h2>
    <p style="color:#666; margin-bottom:20px">
      Les offres sont scorées en temps réel selon votre CV grâce à l'IA.
    </p>

    <div style="display:flex; gap:12px; margin-bottom:24px">
      <input nz-input placeholder="Mots-clés (ex: data engineer alternance)" [(ngModel)]="keywords" style="flex:2" />
      <input nz-input placeholder="Localisation" [(ngModel)]="location" style="flex:1" />
      <button nz-button nzType="primary" (click)="search()" [nzLoading]="loading()">
        <span nz-icon nzType="search"></span> Rechercher
      </button>
    </div>

    @if (loading()) {
      <div style="text-align:center; padding:60px"><nz-spin nzSize="large"></nz-spin></div>
    } @else if (jobs().length === 0 && searched) {
      <nz-empty nzNotFoundContent="Aucune offre trouvée"></nz-empty>
    } @else {
      <div nz-row [nzGutter]="[16, 16]">
        @for (job of jobs(); track job.id) {
          <div nz-col [nzXs]="24" [nzSm]="12" [nzLg]="8">
            <nz-card [nzBodyStyle]="{ padding: '16px' }" class="job-card">
              <div style="display:flex; justify-content:space-between; align-items:flex-start">
                <div style="flex:1; min-width:0">
                  <div style="font-weight:600; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">
                    {{ job.title }}
                  </div>
                  <div style="color:#666; font-size:13px">{{ job.company }}</div>
                </div>
                @if (job.matchScore != null) {
                  <div style="text-align:center; min-width:60px; margin-left:8px">
                    <nz-progress
                      [nzPercent]="job.matchScore"
                      nzType="circle"
                      [nzWidth]="50"
                      [nzStrokeColor]="getScoreColor(job.matchScore)"
                      [nzFormat]="scoreFormat"
                    ></nz-progress>
                  </div>
                }
              </div>

              <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap">
                @if (job.location) {
                  <nz-tag nzColor="default"><span nz-icon nzType="environment"></span> {{ job.location }}</nz-tag>
                }
                @if (job.contractType) {
                  <nz-tag nzColor="blue">{{ job.contractType }}</nz-tag>
                }
                @if (job.salary) {
                  <nz-tag nzColor="green">{{ job.salary }}</nz-tag>
                }
              </div>

              @if (job.matchDetails?.matchedSkills?.length) {
                <div style="margin-top:10px; font-size:12px; color:#1890ff">
                  ✓ {{ job.matchDetails!.matchedSkills.slice(0, 3).join(', ') }}
                </div>
              }

              @if (job.matchDetails?.summary) {
                <div style="margin-top:6px; font-size:12px; color:#666; font-style:italic">
                  {{ job.matchDetails!.summary }}
                </div>
              }

              <nz-divider style="margin: 12px 0 10px"></nz-divider>
              <div style="display:flex; gap:8px">
                @if (job.url) {
                  <a [href]="job.url" target="_blank" style="flex:1">
                    <button nz-button nzSize="small" nzBlock>Voir l'offre</button>
                  </a>
                }
                <button
                  nz-button
                  nzSize="small"
                  [nzType]="job.isSaved ? 'primary' : 'default'"
                  (click)="toggleSave(job)"
                >
                  <span nz-icon [nzType]="job.isSaved ? 'heart' : 'heart'" [nzTheme]="job.isSaved ? 'fill' : 'outline'"></span>
                </button>
              </div>
            </nz-card>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .job-card { border-radius: 8px; transition: box-shadow 0.2s; }
    .job-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  `],
})
export class JobsComponent implements OnInit {
  private readonly jobsService = inject(JobsService);
  private readonly message = inject(NzMessageService);

  loading = signal(false);
  jobs = signal<Job[]>([]);
  keywords = 'data engineer alternance';
  location = '';
  searched = false;

  scoreFormat = (percent: number) => `${percent}%`;

  ngOnInit() {
    this.search();
  }

  getScoreColor(score: number): string {
    if (score >= 70) return '#52c41a';
    if (score >= 40) return '#faad14';
    return '#ff4d4f';
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
}
