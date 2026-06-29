import { Component, OnInit, inject, signal, computed } from '@angular/core';
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

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    NzLayoutModule, NzMenuModule, NzAvatarModule, NzDropDownModule, NzIconModule,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent implements OnInit {
  auth = inject(AuthService);
  mapService = inject(MapService);
  private router = inject(Router);
  readonly dots = Array(24);
  isCollapsed = signal(false);

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
  }

  toggleSidebar() {
    this.isCollapsed.set(!this.isCollapsed());
  }
}
