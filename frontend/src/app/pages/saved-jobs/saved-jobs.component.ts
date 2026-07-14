import { Component, OnInit, inject, signal } from '@angular/core';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { JobsService, Job } from '@core/services/jobs.service';
import { JobCardComponent } from '@shared/components/job-card/job-card.component';

@Component({
  selector: 'app-saved-jobs',
  standalone: true,
  imports: [
    NzSpinModule, NzEmptyModule, NzGridModule,
    JobCardComponent,
  ],
  templateUrl: './saved-jobs.component.html',
  styleUrl: './saved-jobs.component.scss',
})
export class SavedJobsComponent implements OnInit {
  private readonly jobsService = inject(JobsService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  jobs = signal<Job[]>([]);

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

  onJobApplied(jobId: string) {
    this.jobs.update((list) => list.map((j) => (j.id === jobId ? { ...j, isApplied: true } : j)));
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
}
