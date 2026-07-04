import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNzI18n, fr_FR } from 'ng-zorro-antd/i18n';
import { NZ_ICONS } from 'ng-zorro-antd/icon';
import { registerLocaleData } from '@angular/common';
import fr from '@angular/common/locales/fr';
import { provideEchartsCore } from 'ngx-echarts';
import { IconDefinition } from '@ant-design/icons-angular';
import {
  CompassOutline,
  DownOutline,
  ProjectOutline,
  SearchOutline,
  BarChartOutline,
  FileTextOutline,
  GlobalOutline,
  UserOutline,
  LogoutOutline,
  PlusOutline,
  EnvironmentOutline,
  MailOutline,
  HeartOutline,
  HeartFill,
  CloudUploadOutline,
  SyncOutline,
  DisconnectOutline,
  LaptopOutline,
  DesktopOutline,
  SettingOutline,
  DeleteOutline,
  EditOutline,
  EyeOutline,
  CheckOutline,
  CloseOutline,
  InfoCircleOutline,
  MenuOutline,
  MenuFoldOutline,
  ArrowRightOutline,
  QuestionCircleOutline,
} from '@ant-design/icons-angular/icons';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

registerLocaleData(fr);

const icons: IconDefinition[] = [
  CompassOutline,
  DownOutline,
  ProjectOutline,
  SearchOutline,
  BarChartOutline,
  FileTextOutline,
  GlobalOutline,
  UserOutline,
  LogoutOutline,
  PlusOutline,
  EnvironmentOutline,
  MailOutline,
  HeartOutline,
  HeartFill,
  CloudUploadOutline,
  SyncOutline,
  DisconnectOutline,
  LaptopOutline,
  DesktopOutline,
  SettingOutline,
  DeleteOutline,
  EditOutline,
  EyeOutline,
  CheckOutline,
  CloseOutline,
  InfoCircleOutline,
  MenuOutline,
  MenuFoldOutline,
  ArrowRightOutline,
  QuestionCircleOutline,
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    provideNzI18n(fr_FR),
    provideEchartsCore({ echarts: () => import('echarts') }),
    { provide: NZ_ICONS, useValue: icons },
  ],
};
