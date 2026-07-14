import { Component, OnInit, effect, inject, signal, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '@core/services/auth.service';
import { MapService } from '@core/services/map.service';
import { EmailService, EmailConnection } from '@core/services/email.service';
import { TutorialService } from '@core/services/tutorial.service';
import { UserService } from '@core/services/user.service';
import { TutorialOverlayComponent } from '@shared/components/tutorial-overlay/tutorial-overlay.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    NzLayoutModule, NzMenuModule, NzAvatarModule, NzDropDownModule, NzIconModule, NzModalModule, NzButtonModule,
    TutorialOverlayComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent implements OnInit {
  auth = inject(AuthService);
  mapService = inject(MapService);
  emailService = inject(EmailService);
  tutorialService = inject(TutorialService);
  private userService = inject(UserService);
  private router = inject(Router);
  private breakpointObserver = inject(BreakpointObserver);
  readonly dots = Array(24);
  isCollapsed = signal(false);
  emailConnections = signal<EmailConnection[]>([]);

  private readonly message = inject(NzMessageService);
  deleteAccountModalVisible = signal(false);
  deletingAccount = signal(false);

  private readonly isMobileNav = toSignal(
    this.breakpointObserver.observe('(max-width: 767.98px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  private readonly syncSidebarForTutorial = effect(() => {
    const active = this.tutorialService.active();
    const step = this.tutorialService.currentStep();
    if (!active || !step) return;

    if (step.requiresSidebar) {
      this.isCollapsed.set(false);
    } else if (this.isMobileNav()) {
      this.isCollapsed.set(true);
    }
  });

  isSyncing = computed(() => this.emailService.syncingGmail() || this.emailService.syncingOutlook());
  syncPercent = computed(() =>
    this.emailService.syncingGmail() ? this.emailService.gmailSyncPercent() : this.emailService.outlookSyncPercent(),
  );

  private currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
      startWith(this.router.url),
    ),
  );

  isMapRoute = computed(() => this.currentUrl() === '/map');

  ngOnInit() {
    this.mapService.loadUnlocatedCount();
    this.emailService.getConnections().subscribe({
      next: (conns) => this.emailConnections.set(conns),
    });
    this.tutorialService.autoStartIfNeeded();
  }

  toggleSidebar() {
    this.isCollapsed.set(!this.isCollapsed());
  }

  confirmDeleteAccount() {
    if (this.deletingAccount()) return;
    this.deletingAccount.set(true);
    this.userService.deleteAccount().subscribe({
      next: () => {
        this.message.success('Votre compte et vos données ont été supprimés');
        this.auth.logout();
      },
      error: () => {
        this.deletingAccount.set(false);
        this.message.error('Erreur lors de la suppression du compte');
      },
    });
  }
}
