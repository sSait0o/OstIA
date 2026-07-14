import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '@core/services/auth.service';
import { extractErrorMessage } from '@shared/utils/http-error.utils';

@Component({
  selector: 'app-verify-email-pending',
  standalone: true,
  imports: [NzButtonModule, NzCardModule, RouterLink],
  templateUrl: './verify-email-pending.component.html',
  styleUrl: '../register/register.component.scss',
})
export class VerifyEmailPendingComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly message = inject(NzMessageService);

  email = this.route.snapshot.queryParamMap.get('email') ?? '';
  resending = false;

  resend() {
    if (!this.email) return;
    this.resending = true;
    this.authService.resendVerification(this.email).subscribe({
      next: () => {
        this.message.success('Email de vérification renvoyé');
        this.resending = false;
      },
      error: (err) => {
        this.message.error(extractErrorMessage(err, "Impossible de renvoyer l'email"));
        this.resending = false;
      },
    });
  }
}
