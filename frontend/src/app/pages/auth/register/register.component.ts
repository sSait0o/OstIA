import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services/auth.service';
import { syncPasswordMismatch } from '../../../shared/validators/password-match.validator';
import { extractErrorMessage } from '../../../shared/utils/http-error.utils';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, NzFormModule, NzInputModule, NzButtonModule, NzCardModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  loading = false;

  form: FormGroup = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  constructor() {
    syncPasswordMismatch(
      this.form.get('password')!,
      this.form.get('confirmPassword')!,
    );
  }

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    const { firstName, lastName, email, password } = this.form.value;
    this.authService.register(firstName, lastName, email, password).subscribe({
      next: () =>
        this.router.navigate(['/auth/verify-email-pending'], { queryParams: { email } }),
      error: (err) => {
        this.message.error(extractErrorMessage(err, 'Erreur lors de la création du compte'));
        this.loading = false;
      },
    });
  }
}
