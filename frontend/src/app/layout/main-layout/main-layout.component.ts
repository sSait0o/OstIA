import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NzLayoutModule,
    NzMenuModule,
    NzAvatarModule,
    NzDropDownModule,
    NzIconModule,
  ],
  template: `
    <nz-layout style="min-height: 100vh">
      <nz-sider nzCollapsible [(nzCollapsed)]="collapsed" nzTheme="dark">
        <div class="logo">
          <span nz-icon nzType="compass" nzTheme="outline"></span>
          @if (!collapsed) { <span class="logo-text">Ostia</span> }
        </div>
        <ul nz-menu nzTheme="dark" nzMode="inline">
          <li nz-menu-item routerLink="/kanban" routerLinkActive="ant-menu-item-selected">
            <span nz-icon nzType="project" nzTheme="outline"></span>
            <span>Candidatures</span>
          </li>
          <li nz-menu-item routerLink="/jobs" routerLinkActive="ant-menu-item-selected">
            <span nz-icon nzType="search" nzTheme="outline"></span>
            <span>Offres</span>
          </li>
          <li nz-menu-item routerLink="/dashboard" routerLinkActive="ant-menu-item-selected">
            <span nz-icon nzType="bar-chart" nzTheme="outline"></span>
            <span>Dashboard</span>
          </li>
        </ul>
      </nz-sider>
      <nz-layout>
        <nz-header style="background:#fff; padding: 0 24px; display:flex; align-items:center; justify-content:flex-end; border-bottom:1px solid #f0f0f0;">
          <span style="cursor:pointer" nz-dropdown [nzDropdownMenu]="userMenu">
            <nz-avatar nzIcon="user" style="background:#1890ff"></nz-avatar>
            <span style="margin-left:8px">{{ auth.currentUser()?.firstName }}</span>
          </span>
          <nz-dropdown-menu #userMenu="nzDropdownMenu">
            <ul nz-menu>
              <li nz-menu-item (click)="auth.logout()">
                <span nz-icon nzType="logout"></span> Déconnexion
              </li>
            </ul>
          </nz-dropdown-menu>
        </nz-header>
        <nz-content style="margin:24px; background:#fff; padding:24px; border-radius:8px; min-height:360px">
          <router-outlet />
        </nz-content>
      </nz-layout>
    </nz-layout>
  `,
  styles: [`
    .logo { height: 64px; display: flex; align-items: center; justify-content: center; gap: 8px; color: white; font-size: 20px; }
    .logo-text { font-weight: bold; font-size: 18px; }
  `],
})
export class MainLayoutComponent {
  auth = inject(AuthService);
  collapsed = false;
}
