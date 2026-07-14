import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '@core/services/auth.service';
import { syncPasswordMismatch } from '@shared/validators/password-match.validator';
import { extractErrorMessage } from '@shared/utils/http-error.utils';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, NzFormModule, NzInputModule, NzButtonModule, NzCardModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: '../login/login.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly message = inject(NzMessageService);

  loading = false;
  token = '';
  invalidLink = false;

  form: FormGroup = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  constructor() {
    syncPasswordMismatch(
      this.form.get('password')!,
      this.form.get('confirmPassword')!,
    );
  }

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) this.invalidLink = true;
  }

  onSubmit() {
    if (this.form.invalid || !this.token) return;
    this.loading = true;
    const { password } = this.form.value;
    this.authService.resetPassword(this.token, password).subscribe({
      next: () => {
        this.loading = false;
        this.message.success('Mot de passe mis à jour, vous pouvez vous connecter.');
        this.router.navigate(['/auth/login']);
      },
      error: (err) => {
        this.loading = false;
        this.message.error(extractErrorMessage(err, 'Lien de réinitialisation invalide ou expiré'));
      },
    });
  }
}
