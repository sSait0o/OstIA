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
  templateUrl: './jobs.component.html',
  styleUrl: './jobs.component.scss',
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
    if (score >= 70) return 'rgba(255,255,255,0.9)';
    if (score >= 40) return 'rgba(255,255,255,0.5)';
    return 'rgba(255,255,255,0.2)';
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
