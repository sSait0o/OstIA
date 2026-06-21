import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface MapApplication {
  id: string;
  company: string;
  jobTitle: string;
  status: string;
  location: string | null;
  resolvedLocation: string | null;
  lat: number | null;
  lon: number | null;
  source: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  emailId: string | null;
  salary: string | null;
  notes: string | null;
  jobUrl: string | null;
  appliedAt: string | null;
  createdAt: string;
}

export interface GeocodeResult {
  lat: number | null;
  lon: number | null;
  resolvedLocation: string | null;
  confidence: 'geocoded' | 'ai_guess' | 'failed';
}

@Injectable({ providedIn: 'root' })
export class MapService {
  private readonly http = inject(HttpClient);
  private readonly appsBase = `${environment.apiUrl}/applications`;
  private readonly coreBase = `${environment.coreUrl}/analytics`;

  getMapApplications() {
    return this.http.get<MapApplication[]>(`${this.appsBase}/map`);
  }

  geocode(company: string, jobTitle: string, location: string) {
    return this.http.post<GeocodeResult>(`${this.coreBase}/geocode`, {
      company,
      jobTitle,
      location,
    });
  }

  saveCoordinates(id: string, lat: number, lon: number, resolvedLocation: string) {
    return this.http.patch(`${this.appsBase}/${id}/coordinates`, {
      lat,
      lon,
      resolvedLocation,
    });
  }

  resetCoordinates() {
    return this.http.delete<{ reset: number }>(`${this.appsBase}/coordinates/reset`);
  }
}
