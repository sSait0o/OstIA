import { Component, OnInit, inject, signal } from '@angular/core';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CvService, CvData } from '../../core/services/cv.service';

@Component({
  selector: 'app-cv',
  standalone: true,
  imports: [
    NzUploadModule, NzCardModule, NzTagModule, NzSpinModule,
    NzAvatarModule, NzTimelineModule, NzIconModule, NzGridModule,
  ],
  templateUrl: './cv.component.html',
  styleUrl: './cv.component.scss',
})
export class CvComponent implements OnInit {
  private readonly cvService = inject(CvService);
  private readonly message = inject(NzMessageService);

  uploading = signal(false);
  cvData = signal<CvData | null>(null);
  isDragging = false;

  ngOnInit() {
    this.cvService.getCv().subscribe({
      next: ({ cvData }) => {
        if (cvData) this.cvData.set(cvData);
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
        this.cvData.set(cvData);
        this.message.success('CV analysé avec succès !');
        this.uploading.set(false);
      },
      error: () => {
        this.message.error("Erreur lors de l'analyse du CV");
        this.uploading.set(false);
      },
    });
  }
}
