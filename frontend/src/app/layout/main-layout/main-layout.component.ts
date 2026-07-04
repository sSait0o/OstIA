import { Component, OnInit, effect, inject, signal, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AuthService } from '../../core/services/auth.service';
import { MapService } from '../../core/services/map.service';
import { EmailService, EmailConnection } from '../../core/services/email.service';
import { TutorialService } from '../../core/services/tutorial.service';
import { TutorialOverlayComponent } from '../../shared/components/tutorial-overlay/tutorial-overlay.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    NzLayoutModule, NzMenuModule, NzAvatarModule, NzDropDownModule, NzIconModule,
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
  private router = inject(Router);
  readonly dots = Array(24);
  isCollapsed = signal(false);
  emailConnections = signal<EmailConnection[]>([]);

  private readonly expandSidebarForTutorial = effect(() => {
    if (this.tutorialService.active()) {
      this.isCollapsed.set(false);
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
}
