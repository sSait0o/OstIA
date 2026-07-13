import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users`;

  exportData() {
    return this.http.get(`${this.base}/export`, { responseType: 'blob' });
  }

  deleteAccount() {
    return this.http.delete(`${this.base}/me`);
  }
}
