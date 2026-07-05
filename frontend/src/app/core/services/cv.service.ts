import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface CvExperience {
  title: string;
  company: string;
  duration: string;
  description: string;
}

export interface CvEducation {
  degree: string;
  school: string;
  year: string;
}

export interface CvData {
  firstName: string;
  lastName: string;
  email: string;
  city?: string;
  skills: string[];
  languages: string[];
  experience: CvExperience[];
  education: CvEducation[];
  summary: string;
}

export interface CvResponse {
  cvPath: string | null;
  cvData: CvData | null;
}

@Injectable({ providedIn: 'root' })
export class CvService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/cv`;

  upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ message: string; cvData: CvData }>(
      `${this.base}/upload`,
      form,
    );
  }

  getCv() {
    return this.http.get<CvResponse>(this.base);
  }
}
