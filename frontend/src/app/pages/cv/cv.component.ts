import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CvService, CvData } from '@core/services/cv.service';

@Component({
  selector: 'app-cv',
  standalone: true,
  imports: [
    NzUploadModule, NzCardModule, NzTagModule, NzSpinModule,
    NzAvatarModule, NzTimelineModule, NzIconModule, NzGridModule, NzButtonModule,
  ],
  templateUrl: './cv.component.html',
  styleUrl: './cv.component.scss',
})
export class CvComponent implements OnInit {
  private readonly cvService = inject(CvService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);

  uploading = signal(false);
  cvData = signal<CvData | null>(null);
  isDragging = false;

  ngOnInit() {
    this.cvService.getCv().subscribe({
      next: ({ cvData }) => {
        if (cvData && (cvData.firstName || cvData.skills?.length || cvData.experience?.length)) {
          this.cvData.set(this.sortByRecency(cvData));
        }
      },
    });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file) this.upload(file);
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.upload(file);
  }

  private upload(file: File) {
    if (file.type !== 'application/pdf') {
      this.message.error('Le fichier doit être un PDF');
      return;
    }
    this.uploading.set(true);
    this.cvService.upload(file).subscribe({
      next: ({ cvData }) => {
        this.uploading.set(false);
        if (cvData && (cvData.firstName || cvData.skills?.length || cvData.experience?.length)) {
          this.cvData.set(this.sortByRecency(cvData));
          this.message.success('CV analysé ! Recherche des offres en cours...');
          setTimeout(() => this.router.navigate(['/jobs']), 1500);
        } else {
          this.message.warning("Le CV n'a pas pu être analysé. Vérifiez que le PDF contient du texte sélectionnable.");
        }
      },
      error: () => {
        this.message.error("Erreur lors de l'analyse du CV. Le service IA est peut-être indisponible.");
        this.uploading.set(false);
      },
    });
  }

  private sortByRecency(cvData: CvData): CvData {
    const latestYear = (text: string) => {
      const years = text?.match(/\d{4}/g);
      return years ? Math.max(...years.map(Number)) : 0;
    };
    return {
      ...cvData,
      experience: [...(cvData.experience ?? [])].sort(
        (a, b) => latestYear(b.duration) - latestYear(a.duration),
      ),
      education: [...(cvData.education ?? [])].sort(
        (a, b) => latestYear(b.year) - latestYear(a.year),
      ),
    };
  }
}
