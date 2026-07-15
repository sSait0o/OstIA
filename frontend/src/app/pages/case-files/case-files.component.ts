import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import {
  ApplicationsService,
  CaseFile,
  CaseFileStats,
  ApplicationEmail,
} from '../../core/services/applications.service';
import { ApplicationStatus, ApplicationSource } from '../../shared/models/application.model';
import {
  getStatusTag,
  getStatusLabel as getStatusRollupLabel,
  getStatusHex,
} from '../../shared/utils/status-colors.utils';
import { sanitizeEmailBody, isEmailHtml, emailSnippet } from '../../shared/utils/email-html.utils';

const SOURCE_LABELS: Record<ApplicationSource, string> = {
  EMAIL: 'Email',
  MANUAL: 'Manuel',
  JOB_BOARD: "Offre d'emploi",
};

const TERMINAL_STATUSES: ApplicationStatus[] = ['OFFER', 'REJECTED'];

interface JourneyStep {
  status: ApplicationStatus;
  label: string;
  color: string;
  date: string;
}

@Component({
  selector: 'app-case-files',
  standalone: true,
  imports: [
    FormsModule,
    NzTagModule, NzButtonModule, NzIconModule, NzInputModule,
    NzSelectModule, NzPopconfirmModule, NzToolTipModule,
    NzSpinModule, NzCollapseModule, NzTimelineModule,
  ],
  templateUrl: './case-files.component.html',
  styleUrl: './case-files.component.scss',
})
export class CaseFilesComponent implements OnInit {
  private readonly appsService = inject(ApplicationsService);
  private readonly message = inject(NzMessageService);
  private readonly sanitizer = inject(DomSanitizer);

  loading = signal(true);
  caseFiles = signal<CaseFile[]>([]);
  stats = signal<CaseFileStats | null>(null);

  searchQuery = '';
  private readonly searchTerm = signal('');
  statusFilter = signal<ApplicationStatus[]>([]);
  sourceFilter = signal<ApplicationSource | null>(null);

  selectedId = signal<string | null>(null);
  emailsByCaseFile = signal<Map<string, ApplicationEmail[]>>(new Map());
  emailsLoadingIds = signal<Set<string>>(new Set());
  updatingStatusId = signal<string | null>(null);
  deletingId = signal<string | null>(null);
  splittingEmailId = signal<string | null>(null);

  statusOptions = (
    ['APPLIED', 'ACKNOWLEDGED', 'TECHNICAL', 'INTERVIEW', 'OFFER', 'REJECTED'] as ApplicationStatus[]
  ).map((value) => ({ value, label: getStatusRollupLabel(value) }));

  terminalStatusOptions = this.statusOptions.filter((opt) => TERMINAL_STATUSES.includes(opt.value));

  sourceOptions = (Object.keys(SOURCE_LABELS) as ApplicationSource[]).map((value) => ({
    value,
    label: SOURCE_LABELS[value],
  }));

  filteredCaseFiles = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    const statuses = this.statusFilter();
    const source = this.sourceFilter();
    return this.caseFiles().filter((c) => {
      if (!TERMINAL_STATUSES.includes(c.status)) return false;
      if (statuses.length > 0 && !statuses.includes(c.status)) return false;
      if (source && c.source !== source) return false;
      if (q && !c.company.toLowerCase().includes(q) && !c.jobTitle.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  selectedCaseFile = computed(() => {
    const id = this.selectedId();
    return this.caseFiles().find((c) => c.id === id) ?? null;
  });

  selectedEmails = computed(() => this.emailsFor(this.selectedId() ?? ''));

  journeySteps = computed<JourneyStep[]>(() => {
    return this.selectedEmails()
      .filter((mail): mail is ApplicationEmail & { statusDetected: ApplicationStatus } => !!mail.statusDetected)
      .map((mail) => ({
        status: mail.statusDetected,
        label: getStatusRollupLabel(mail.statusDetected),
        color: getStatusHex(mail.statusDetected),
        date: this.formatDate(mail.receivedAt),
      }));
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.appsService.getCaseFiles().subscribe({
      next: (caseFiles) => {
        this.caseFiles.set(caseFiles);
        this.loading.set(false);
        const visible = this.filteredCaseFiles();
        if (!this.selectedId() && visible.length > 0) {
          this.select(visible[0]);
        }
      },
      error: () => {
        this.message.error('Erreur lors du chargement des dossiers');
        this.loading.set(false);
      },
    });
    this.appsService.getCaseFileStats().subscribe({
      next: (stats) => this.stats.set(stats),
    });
  }

  onSearch() {
    this.searchTerm.set(this.searchQuery);
  }

  emailsFor(caseFileId: string): ApplicationEmail[] {
    return this.emailsByCaseFile().get(caseFileId) ?? [];
  }

  isEmailsLoading(caseFileId: string): boolean {
    return this.emailsLoadingIds().has(caseFileId);
  }

  select(caseFile: CaseFile) {
    this.selectedId.set(caseFile.id);
    this.loadEmailsFor(caseFile.id);
  }

  backToList() {
    this.selectedId.set(null);
  }

  private loadEmailsFor(caseFileId: string) {
    if (this.emailsByCaseFile().has(caseFileId)) return;

    this.emailsLoadingIds.update((ids) => new Set(ids).add(caseFileId));
    this.appsService.getEmails(caseFileId).subscribe({
      next: (emails) => {
        const map = new Map(this.emailsByCaseFile());
        map.set(caseFileId, emails);
        this.emailsByCaseFile.set(map);
        this.emailsLoadingIds.update((ids) => {
          const next = new Set(ids);
          next.delete(caseFileId);
          return next;
        });
      },
      error: () => {
        this.emailsLoadingIds.update((ids) => {
          const next = new Set(ids);
          next.delete(caseFileId);
          return next;
        });
      },
    });
  }

  updateStatus(caseFile: CaseFile, status: ApplicationStatus) {
    this.updatingStatusId.set(caseFile.id);
    this.appsService.update(caseFile.id, { status }).subscribe({
      next: (updated) => {
        this.caseFiles.update((list) =>
          list.map((c) => (c.id === caseFile.id ? { ...c, status: updated.status } : c)),
        );
        this.updatingStatusId.set(null);
      },
      error: () => {
        this.message.error('Erreur lors de la mise à jour du statut');
        this.updatingStatusId.set(null);
      },
    });
  }

  deleteCaseFile(caseFile: CaseFile) {
    this.deletingId.set(caseFile.id);
    this.appsService.delete(caseFile.id).subscribe({
      next: () => {
        this.message.success('Dossier supprimé');
        const remaining = this.caseFiles().filter((c) => c.id !== caseFile.id);
        this.caseFiles.set(remaining);
        if (this.selectedId() === caseFile.id) {
          this.selectedId.set(null);
          if (remaining.length > 0) this.select(remaining[0]);
        }
        this.deletingId.set(null);
      },
      error: () => {
        this.message.error('Erreur lors de la suppression');
        this.deletingId.set(null);
      },
    });
  }

  splitEmail(caseFile: CaseFile, email: ApplicationEmail) {
    this.splittingEmailId.set(email.id);
    this.appsService.splitEmail(caseFile.id, email.id).subscribe({
      next: () => {
        this.message.success('Email détaché dans un nouveau dossier');
        this.splittingEmailId.set(null);
        this.emailsByCaseFile.update((map) => {
          const next = new Map(map);
          next.delete(caseFile.id);
          return next;
        });
        this.load();
      },
      error: () => {
        this.message.error('Erreur lors de la division du dossier');
        this.splittingEmailId.set(null);
      },
    });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  sanitizeHtml(body: string | null | undefined): string {
    return sanitizeEmailBody(this.sanitizer, body);
  }

  isHtml(body: string | null): boolean {
    return isEmailHtml(body);
  }

  getSnippet(caseFile: CaseFile): string {
    return emailSnippet(caseFile.emailBody);
  }

  getStatusLabel = getStatusRollupLabel;

  getStatusColor = getStatusTag;

  getSourceLabel(source: ApplicationSource): string {
    return SOURCE_LABELS[source] ?? source;
  }
}
