import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Job } from '../../../core/services/jobs.service';
import { ApplicationsService } from '../../../core/services/applications.service';
import { getScoreColor, scoreFormat } from '../../../core/helpers/score.helper';

@Component({
  selector: 'app-job-card',
  standalone: true,
  imports: [
    NzCardModule, NzTagModule, NzButtonModule, NzIconModule,
    NzProgressModule, NzDividerModule, NzToolTipModule,
  ],
  templateUrl: './job-card.component.html',
  styleUrl: './job-card.component.scss',
})
export class JobCardComponent {
  private readonly appsService = inject(ApplicationsService);
  private readonly message = inject(NzMessageService);

  @Input({ required: true }) job!: Job;
  @Input() showSummary = true;
  @Input() savedPage = false;

  @Output() jobApplied = new EventEmitter<string>();
  @Output() toggleSave = new EventEmitter<Job>();

  applying = signal(false);

  readonly getScoreColor = getScoreColor;
  readonly scoreFormat = scoreFormat;

  apply() {
    if (this.job.isApplied) return;
    this.applying.set(true);
    this.appsService.create({
      company: this.job.company,
      jobTitle: this.job.title,
      status: 'APPLIED',
      source: 'JOB_BOARD',
      jobUrl: this.job.url,
      location: this.job.location,
      salary: this.job.salary,
      appliedAt: new Date().toISOString(),
    }).subscribe({
      next: () => {
        this.applying.set(false);
        this.message.success(`Candidature créée pour ${this.job.company}`);
        this.jobApplied.emit(this.job.id);
      },
      error: () => {
        this.applying.set(false);
        this.message.error('Erreur lors de la création de la candidature');
      },
    });
  }

  onToggleSave() {
    this.toggleSave.emit(this.job);
  }
}
