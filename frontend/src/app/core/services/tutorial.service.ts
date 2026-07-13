import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

export interface TutorialStep {
  id: string;
  target: string;
  title: string;
  description: string;
  requiresClick: boolean;
  requiresSidebar: boolean;
}

@Injectable({ providedIn: 'root' })
export class TutorialService {
  private readonly auth = inject(AuthService);
  private readonly storagePrefix = 'ostia_tutorial_seen_';

  readonly steps: TutorialStep[] = [
    {
      id: 'logo',
      target: '[data-tutorial="logo"]',
      title: 'Bienvenue sur OstIA 👋',
      description: 'Ce petit tour rapide vous présente les fonctionnalités principales de l\'application. Cliquez sur "Suivant" pour continuer.',
      requiresClick: false,
      requiresSidebar: false,
    },
    {
      id: 'sync-btn',
      target: '[data-tutorial="sync-btn"]',
      title: 'Synchronisez vos emails',
      description: 'Cliquez sur "Sync email" pour accéder à la page de connexion de votre boîte mail.',
      requiresClick: true,
      requiresSidebar: false,
    },
    {
      id: 'email-page',
      target: '[data-tutorial="email-page"]',
      title: 'Connectez votre boîte mail',
      description: 'Connectez votre compte Gmail ou Outlook, puis créez vous-même le libellé "OstIA" dans Gmail (ou un dossier "OstIA" dans Outlook) et déplacez-y vos emails de candidature. OstIA les analysera et créera automatiquement les sous-libellés (Envoyé, Entretien, Test Technique, Offre, Refusé) pour classer chaque candidature dans votre Kanban.',
      requiresClick: false,
      requiresSidebar: false,
    },
    {
      id: 'nav-kanban',
      target: '[data-tutorial="nav-kanban"]',
      title: 'Suivez vos candidatures',
      description: 'Cliquez ici pour retrouver toutes vos candidatures organisées par étape, comme un tableau Kanban.',
      requiresClick: true,
      requiresSidebar: true,
    },
    {
      id: 'nav-dashboard',
      target: '[data-tutorial="nav-dashboard"]',
      title: 'Analysez vos statistiques',
      description: 'Cliquez ici pour visualiser votre taux de réponse, vos relances à faire et votre progression globale.',
      requiresClick: true,
      requiresSidebar: true,
    },
    {
      id: 'nav-map',
      target: '[data-tutorial="nav-map"]',
      title: 'Explorez la carte',
      description: 'Cliquez ici pour visualiser géographiquement vos candidatures et les offres disponibles autour de vous.',
      requiresClick: true,
      requiresSidebar: true,
    },
    {
      id: 'nav-jobs',
      target: '[data-tutorial="nav-jobs"]',
      title: 'Découvrez des offres',
      description: "Cliquez ici pour parcourir les offres d'emploi qui correspondent à votre profil.",
      requiresClick: true,
      requiresSidebar: true,
    },
    {
      id: 'nav-saved-jobs',
      target: '[data-tutorial="nav-saved-jobs"]',
      title: 'Vos favoris',
      description: 'Cliquez ici pour retrouver les offres que vous avez mises de côté pour plus tard.',
      requiresClick: true,
      requiresSidebar: true,
    },
    {
      id: 'nav-cv',
      target: '[data-tutorial="nav-cv"]',
      title: 'Gérez votre CV',
      description: 'Cliquez ici pour mettre à jour vos informations et votre CV.',
      requiresClick: true,
      requiresSidebar: true,
    },
    {
      id: 'user-menu',
      target: '[data-tutorial="user-menu"]',
      title: 'Votre profil',
      description: 'Cliquez ici pour retrouver vos informations de compte et vous déconnecter. Vous pourrez revoir ce tutoriel à tout moment via le bouton "?".',
      requiresClick: true,
      requiresSidebar: false,
    },
  ];

  readonly active = signal(false);
  readonly stepIndex = signal(0);

  readonly currentStep = computed<TutorialStep | null>(() => this.steps[this.stepIndex()] ?? null);
  readonly isFirstStep = computed(() => this.stepIndex() === 0);
  readonly isLastStep = computed(() => this.stepIndex() === this.steps.length - 1);

  start() {
    this.stepIndex.set(0);
    this.active.set(true);
  }

  next() {
    if (this.isLastStep()) {
      this.finish();
      return;
    }
    this.stepIndex.update((i) => i + 1);
  }

  prev() {
    if (this.stepIndex() > 0) {
      this.stepIndex.update((i) => i - 1);
    }
  }

  skip() {
    this.finish();
  }

  autoStartIfNeeded() {
    const userId = this.auth.currentUser()?.id;
    if (userId && localStorage.getItem(this.storagePrefix + userId) !== '1') {
      this.markSeen();
      this.start();
    }
  }

  private finish() {
    this.active.set(false);
  }

  private markSeen() {
    const userId = this.auth.currentUser()?.id;
    if (userId) {
      localStorage.setItem(this.storagePrefix + userId, '1');
    }
  }
}
