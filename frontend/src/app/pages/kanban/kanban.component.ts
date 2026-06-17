import { Component, OnInit, inject, signal } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { FormsModule } from '@angular/forms';
import { ApplicationsService, Application, ApplicationStatus, CreateApplicationDto } from '../../core/services/applications.service';

interface Column {
  key: ApplicationStatus;
  label: string;
  color: string;
  items: Application[];
}

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [
    NzCardModule, NzTagModule, NzButtonModule, NzIconModule, NzModalModule,
    NzFormModule, NzInputModule, NzSelectModule, NzSpinModule, NzEmptyModule, FormsModule,
  ],
  templateUrl: './kanban.component.html',
  styleUrl: './kanban.component.scss',
})
export class KanbanComponent implements OnInit {
  private readonly appsService = inject(ApplicationsService);
  private readonly message = inject(NzMessageService);

  loading = signal(true);
  saving = signal(false);
  modalVisible = false;
  selectedApp = signal<Application | null>(null);

  columns = signal<Column[]>([
    { key: 'APPLIED', label: 'Envoyée', color: 'default', items: [] },
    { key: 'ACKNOWLEDGED', label: 'Reçue', color: 'blue', items: [] },
    { key: 'INTERVIEW', label: 'Entretien', color: 'orange', items: [] },
    { key: 'TECHNICAL', label: 'Test technique', color: 'purple', items: [] },
    { key: 'OFFER', label: 'Offre', color: 'green', items: [] },
    { key: 'REJECTED', label: 'Refusé', color: 'red', items: [] },
  ]);

  statusOptions = [
    { value: 'APPLIED', label: 'Envoyée' },
    { value: 'ACKNOWLEDGED', label: 'Reçue' },
    { value: 'INTERVIEW', label: 'Entretien' },
    { value: 'TECHNICAL', label: 'Test technique' },
    { value: 'OFFER', label: 'Offre' },
    { value: 'REJECTED', label: 'Refusé' },
    { value: 'WITHDRAWN', label: 'Retirée' },
  ];

  form: Partial<CreateApplicationDto> & { status?: ApplicationStatus } = {
    company: '',
    jobTitle: '',
    status: 'APPLIED',
    location: '',
    salary: '',
    jobUrl: '',
    notes: '',
  };

  ngOnInit() {
    this.loadKanban();
  }

  loadKanban() {
    this.loading.set(true);
    this.appsService.getKanban().subscribe({
      next: (board) => {
        this.columns.update((cols) =>
          cols.map((col) => ({ ...col, items: board[col.key] || [] })),
        );
        this.loading.set(false);
      },
      error: () => {
        this.message.error('Erreur lors du chargement des candidatures');
        this.loading.set(false);
      },
    });
  }

  openModal() {
    this.selectedApp.set(null);
    this.form = { company: '', jobTitle: '', status: 'APPLIED', location: '', salary: '', jobUrl: '', notes: '' };
    this.modalVisible = true;
  }

  selectApp(app: Application) {
    this.selectedApp.set(app);
    this.form = { company: app.company, jobTitle: app.jobTitle, status: app.status, location: app.location, salary: app.salary, jobUrl: app.jobUrl, notes: app.notes };
    this.modalVisible = true;
  }

  closeModal() {
    this.modalVisible = false;
    this.selectedApp.set(null);
  }

  saveApp() {
    if (!this.form.company || !this.form.jobTitle) {
      this.message.warning('Entreprise et poste sont requis');
      return;
    }
    this.saving.set(true);
    const existing = this.selectedApp();

    const obs = existing
      ? this.appsService.update(existing.id, this.form)
      : this.appsService.create(this.form as CreateApplicationDto);

    obs.subscribe({
      next: () => {
        this.message.success(existing ? 'Candidature mise à jour' : 'Candidature ajoutée');
        this.closeModal();
        this.loadKanban();
        this.saving.set(false);
      },
      error: () => {
        this.message.error('Erreur lors de la sauvegarde');
        this.saving.set(false);
      },
    });
  }
}
