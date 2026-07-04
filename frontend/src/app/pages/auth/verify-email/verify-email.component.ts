import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [NzButtonModule, NzCardModule, RouterLink],
  templateUrl: './verify-email.component.html',
  styleUrl: '../register/register.component.scss',
})
export class VerifyEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  status: 'loading' | 'success' | 'error' = 'loading';
  errorMessage = '';

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.status = 'error';
      this.errorMessage = 'Lien de vérification invalide';
      return;
    }
    this.authService.verifyEmail(token).subscribe({
      next: () => {
        this.status = 'success';
        setTimeout(() => this.router.navigate(['/auth/login']), 1500);
      },
      error: (err) => {
        this.status = 'error';
        this.errorMessage = err.error?.message || 'Lien de vérification invalide ou expiré';
      },
    });
  }
}
