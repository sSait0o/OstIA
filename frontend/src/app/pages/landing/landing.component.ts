import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, computed, inject, signal, ViewChild } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AuthService } from '@core/services/auth.service';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

export const THREAD_PATH =
  'M317.685 1C317.685 1 407.548 149.572 497.185 208C586.823 266.428 760.198 229.771 883.685 328.5' +
  'C985.795 410.138 1070.19 606.5 1070.19 606.5C1147.74 835.471 444.685 1001.5 261.185 1222' +
  'C77.6853 1442.5 73.4998 1746.5 125.343 1910';

export const THREAD_VIEWBOX_HEIGHT = 1910;

const DOT_COUNT = 24;
const MIN_VISIBLE_DOTS = 6;

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink, NzButtonModule, NzIconModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);

  @ViewChild('demoVideo') private readonly demoVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('threadPath') private readonly threadPath?: ElementRef<SVGPathElement>;

  readonly isAuthenticated = this.authService.isAuthenticated();

  readonly threadPathData = THREAD_PATH;
  readonly threadViewBox = `0 0 1259 ${THREAD_VIEWBOX_HEIGHT}`;
  readonly dots = Array(DOT_COUNT);

  readonly scrollProgress = signal(0);
  readonly pathLength = signal(0);
  readonly pageHeight = signal(0);

  readonly pathOffset = computed(() => this.pathLength() * (1 - this.scrollProgress()));
  readonly visibleDots = computed(() =>
    Math.round(MIN_VISIBLE_DOTS + this.scrollProgress() * (DOT_COUNT - MIN_VISIBLE_DOTS)),
  );

  private resizeObserver?: ResizeObserver;

  ngAfterViewInit() {
    this.demoVideo?.nativeElement.play().catch(() => {});
    if (this.threadPath) {
      this.pathLength.set(this.threadPath.nativeElement.getTotalLength());
    }
    this.updateScrollProgress();
    this.updatePageHeight();

    this.resizeObserver = new ResizeObserver(() => this.updatePageHeight());
    this.resizeObserver.observe(document.documentElement);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    this.updateScrollProgress();
  }

  private updateScrollProgress() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    this.scrollProgress.set(scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0);
  }

  private updatePageHeight() {
    this.pageHeight.set(document.documentElement.scrollHeight);
  }

  readonly features: Feature[] = [
    {
      icon: 'project',
      title: 'Kanban de candidatures',
      description:
        'Suivez chaque candidature de l\'envoi à la réponse : 6 statuts, glisser-déposer, filtres par entreprise ou statut.',
    },
    {
      icon: 'mail',
      title: 'Sync email intelligente',
      description:
        'Connectez Gmail ou Outlook : OstIA détecte les mises à jour de statut dans vos échanges et évite les doublons entre relances.',
    },
    {
      icon: 'search',
      title: 'Matching CV / offres',
      description:
        'Les offres France Travail et Adzuna sont agrégées et notées automatiquement selon votre CV.',
    },
    {
      icon: 'bar-chart',
      title: 'Dashboard analytique',
      description:
        'Taux de réponse, entonnoir de conversion et répartition par statut, visualisés en temps réel.',
    },
    {
      icon: 'environment',
      title: 'Carte géographique',
      description:
        'Visualisez vos candidatures sur une carte, avec un géocodage assisté par IA quand l\'adresse exacte manque.',
    },
    {
      icon: 'file-text',
      title: 'CV analysé par IA',
      description:
        'Déposez votre CV en PDF : compétences, expériences et formations sont extraites automatiquement.',
    },
  ];
}
