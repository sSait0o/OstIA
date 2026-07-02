import { Component, OnInit, inject, signal, computed, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { FormsModule } from '@angular/forms';
import { ApplicationsService, Application, ApplicationStatus, CreateApplicationDto } from '../../core/services/applications.service';
import { MapService } from '../../core/services/map.service';

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
    DragDropModule,
    NzCardModule, NzTagModule, NzButtonModule, NzIconModule, NzModalModule,
    NzFormModule, NzInputModule, NzSelectModule, NzDividerModule, NzPopconfirmModule, NzSpinModule, NzEmptyModule, NzToolTipModule, NzDatePickerModule, FormsModule,
  ],
  templateUrl: './kanban.component.html',
  styleUrl: './kanban.component.scss',
})
export class KanbanComponent implements OnInit {
  private readonly appsService = inject(ApplicationsService);
  private readonly message = inject(NzMessageService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly mapService = inject(MapService);

  loading = signal(true);
  saving = signal(false);
  deleting = signal(false);
  deduplicating = signal(false);
  searchQuery = '';
  private readonly searchTerm = signal('');

  filteredColumns = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    if (!q) return this.columns();
    return this.columns().map((col) => ({
      ...col,
      items: col.items.filter(
        (app) =>
          app.company.toLowerCase().includes(q) ||
          app.jobTitle.toLowerCase().includes(q),
      ),
    }));
  });

  get isDraggable(): boolean {
    return !this.searchTerm();
  }
  modalVisible = false;
  emailModalVisible = false;
  selectedApp = signal<Application | null>(null);
  emailApp = signal<Application | null>(null);

  columns = signal<Column[]>([
    { key: 'APPLIED', label: 'Envoyée', color: 'default', items: [] },
    { key: 'TECHNICAL', label: 'Test technique', color: 'purple', items: [] },
    { key: 'INTERVIEW', label: 'Entretien', color: 'orange', items: [] },
    { key: 'OFFER', label: 'Offre', color: 'green', items: [] },
    { key: 'REJECTED', label: 'Refusé', color: 'red', items: [] },
  ]);

  statusOptions = [
    { value: 'APPLIED', label: 'Envoyée' },
    { value: 'ACKNOWLEDGED', label: 'Reçue' },
    { value: 'TECHNICAL', label: 'Test technique' },
    { value: 'INTERVIEW', label: 'Entretien' },
    { value: 'OFFER', label: 'Offre' },
    { value: 'REJECTED', label: 'Refusé' },
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

  appliedAtDate: Date | null = null;

  ngOnInit() {
    this.loadKanban();
  }

  onSearch() {
    this.searchTerm.set(this.searchQuery);
  }

  loadKanban() {
    this.loading.set(true);
    this.appsService.getKanban().subscribe({
      next: (board) => {
        const acknowledged = board['ACKNOWLEDGED'] || [];
        this.columns.update((cols) =>
          cols.map((col) => ({
            ...col,
            items: col.key === 'APPLIED'
              ? [...(board['APPLIED'] || []), ...acknowledged]
              : board[col.key] || [],
          })),
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
    this.appliedAtDate = null;
    this.modalVisible = true;
  }

  get columnIds(): string[] {
    return this.columns().map((c) => 'col-' + c.key);
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  drop(event: CdkDragDrop<Application[]>, targetColKey: ApplicationStatus) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      this.columns.update((cols) => [...cols]);
      return;
    }

    const app = event.previousContainer.data[event.previousIndex];
    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    this.columns.update((cols) => [...cols]);

    this.appsService.update(app.id, { status: targetColKey }).subscribe({
      error: () => {
        transferArrayItem(event.container.data, event.previousContainer.data, event.currentIndex, event.previousIndex);
        this.columns.update((cols) => [...cols]);
        this.message.error('Erreur lors du changement de statut');
      },
    });
  }

  get safeEmailHtml(): string {
    return this.sanitizer.sanitize(SecurityContext.HTML, this.emailApp()?.emailBody ?? '') ?? '';
  }

  isHtml(body: string | null): boolean {
    return !!body && /<[a-z][\s\S]*>/i.test(body);
  }

  selectApp(app: Application) {
    if (app.source === 'EMAIL') {
      this.openEmailView(app);
      return;
    }
    this.selectedApp.set(app);
    this.form = { company: app.company, jobTitle: app.jobTitle, status: app.status, location: app.location, salary: app.salary, jobUrl: app.jobUrl, notes: app.notes };
    this.appliedAtDate = app.appliedAt ? new Date(app.appliedAt) : null;
    this.modalVisible = true;
  }

  openEmailView(app: Application, event?: MouseEvent) {
    event?.stopPropagation();
    this.emailApp.set(app);
    this.emailModalVisible = true;
  }

  getStatusLabel(status: string): string {
    return this.statusOptions.find((s) => s.value === status)?.label ?? status;
  }

  getStatusColor(status: string): string {
    const map: Record<string, string> = {
      APPLIED: 'default', ACKNOWLEDGED: 'default', TECHNICAL: 'purple', INTERVIEW: 'orange', OFFER: 'green', REJECTED: 'red',
    };
    return map[status] ?? 'default';
  }

  closeModal() {
    this.modalVisible = false;
    this.selectedApp.set(null);
  }

  deleteApp() {
    const app = this.selectedApp();
    if (!app) return;
    this.deleting.set(true);
    this.appsService.delete(app.id).subscribe({
      next: () => {
        this.message.success('Candidature supprimée');
        this.closeModal();
        this.loadKanban();
        this.deleting.set(false);
      },
      error: () => {
        this.message.error('Erreur lors de la suppression');
        this.deleting.set(false);
      },
    });
  }

  updateEmailAppStatus(app: Application, status: ApplicationStatus) {
    this.appsService.update(app.id, { status }).subscribe({
      next: (updated) => {
        this.emailApp.set({ ...app, status: updated.status });
        this.loadKanban();
      },
      error: () => this.message.error('Erreur lors de la mise à jour du statut'),
    });
  }

  deleteEmailApp() {
    const app = this.emailApp();
    if (!app) return;
    this.deleting.set(true);
    this.appsService.delete(app.id).subscribe({
      next: () => {
        this.message.success('Candidature supprimée');
        this.emailModalVisible = false;
        this.emailApp.set(null);
        this.loadKanban();
        this.deleting.set(false);
      },
      error: () => {
        this.message.error('Erreur lors de la suppression');
        this.deleting.set(false);
      },
    });
  }

  deduplicate() {
    this.deduplicating.set(true);
    this.appsService.deduplicateApplications().subscribe({
      next: ({ removed }) => {
        this.message.success(removed > 0 ? `${removed} doublon(s) supprimé(s)` : 'Aucun doublon trouvé');
        if (removed > 0) this.loadKanban();
        this.deduplicating.set(false);
      },
      error: () => {
        this.message.error('Erreur lors de la déduplication');
        this.deduplicating.set(false);
      },
    });
  }

  saveApp() {
    if (!this.form.company || !this.form.jobTitle) {
      this.message.warning('Entreprise et poste sont requis');
      return;
    }
    this.saving.set(true);
    const existing = this.selectedApp();

    const payload = existing
      ? (Object.fromEntries(
          Object.entries(this.form).map(([k, v]) => [k, v === '' ? null : v]),
        ) as unknown as CreateApplicationDto)
      : (Object.fromEntries(
          Object.entries(this.form).filter(([, v]) => v !== '' && v !== null && v !== undefined),
        ) as unknown as CreateApplicationDto);
    if (this.appliedAtDate) payload.appliedAt = this.appliedAtDate.toISOString();

    const obs = existing
      ? this.appsService.update(existing.id, payload)
      : this.appsService.create(payload);

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
