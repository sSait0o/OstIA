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
  template: `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h2 style="margin:0">Mes candidatures</h2>
      <button nz-button nzType="primary" (click)="openModal()">
        <span nz-icon nzType="plus"></span> Ajouter
      </button>
    </div>

    @if (loading()) {
      <div style="text-align:center; padding:60px"><nz-spin nzSize="large"></nz-spin></div>
    } @else {
      <div class="kanban-board">
        @for (col of columns(); track col.key) {
          <div class="kanban-column">
            <div class="column-header">
              <span>{{ col.label }}</span>
              <nz-tag [nzColor]="col.color">{{ col.items.length }}</nz-tag>
            </div>
            <div class="column-body">
              @for (app of col.items; track app.id) {
                <nz-card
                  [nzBodyStyle]="{ padding: '12px' }"
                  class="kanban-card"
                  (click)="selectApp(app)"
                >
                  <div style="font-weight:600; font-size:14px">{{ app.company }}</div>
                  <div style="color:#666; font-size:13px; margin-top:2px">{{ app.jobTitle }}</div>
                  @if (app.location) {
                    <div style="color:#999; font-size:12px; margin-top:4px">
                      <span nz-icon nzType="environment"></span> {{ app.location }}
                    </div>
                  }
                  @if (app.source === 'EMAIL') {
                    <nz-tag nzColor="blue" style="margin-top:8px; font-size:11px">
                      <span nz-icon nzType="mail"></span> Email
                    </nz-tag>
                  }
                </nz-card>
              } @empty {
                <div style="color:#ccc; text-align:center; padding:20px; font-size:13px">Aucune</div>
              }
            </div>
          </div>
        }
      </div>
    }

    <nz-modal
      [(nzVisible)]="modalVisible"
      [nzTitle]="selectedApp() ? 'Modifier la candidature' : 'Nouvelle candidature'"
      (nzOnOk)="saveApp()"
      (nzOnCancel)="closeModal()"
      [nzOkLoading]="saving()"
      nzOkText="Enregistrer"
      nzCancelText="Annuler"
    >
      <ng-container *nzModalContent>
        <div style="display:flex; flex-direction:column; gap:12px">
          <input nz-input placeholder="Entreprise *" [(ngModel)]="form.company" />
          <input nz-input placeholder="Poste *" [(ngModel)]="form.jobTitle" />
          <nz-select [(ngModel)]="form.status" style="width:100%">
            @for (s of statusOptions; track s.value) {
              <nz-option [nzValue]="s.value" [nzLabel]="s.label"></nz-option>
            }
          </nz-select>
          <input nz-input placeholder="Localisation" [(ngModel)]="form.location" />
          <input nz-input placeholder="Salaire" [(ngModel)]="form.salary" />
          <input nz-input placeholder="URL de l'offre" [(ngModel)]="form.jobUrl" />
          <textarea nz-input placeholder="Notes" [(ngModel)]="form.notes" [nzAutosize]="{ minRows: 2 }"></textarea>
        </div>
      </ng-container>
    </nz-modal>
  `,
  styles: [`
    .kanban-board { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 16px; min-height: 60vh; }
    .kanban-column { min-width: 240px; flex: 1; background: #f5f5f5; border-radius: 8px; padding: 12px; }
    .column-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 12px; }
    .column-body { display: flex; flex-direction: column; gap: 8px; min-height: 100px; }
    .kanban-card { cursor: pointer; border-radius: 6px; transition: box-shadow 0.2s; }
    .kanban-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  `],
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
