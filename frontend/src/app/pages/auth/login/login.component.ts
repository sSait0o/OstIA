import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, NzFormModule, NzInputModule, NzButtonModule, NzCardModule, RouterLink],
  template: `
    <div class="auth-container">
      <nz-card style="width:400px">
        <div class="auth-header">
          <h1>Ostia</h1>
          <p>Gérez vos candidatures intelligemment</p>
        </div>
        <form nz-form [formGroup]="form" (ngSubmit)="onSubmit()">
          <nz-form-item>
            <nz-form-control nzErrorTip="Email invalide">
              <input nz-input formControlName="email" placeholder="Email" type="email" />
            </nz-form-control>
          </nz-form-item>
          <nz-form-item>
            <nz-form-control nzErrorTip="Mot de passe requis (min. 8 caractères)">
              <input nz-input formControlName="password" placeholder="Mot de passe" type="password" />
            </nz-form-control>
          </nz-form-item>
          <button nz-button nzType="primary" nzBlock [nzLoading]="loading" type="submit">
            Se connecter
          </button>
        </form>
        <div style="text-align:center; margin-top:16px">
          Pas encore de compte ? <a routerLink="/auth/register">S'inscrire</a>
        </div>
      </nz-card>
    </div>
  `,
  styles: [`
    .auth-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f0f2f5; }
    .auth-header { text-align: center; margin-bottom: 24px; }
    .auth-header h1 { font-size: 32px; font-weight: bold; color: #1890ff; margin: 0; }
    .auth-header p { color: #666; margin: 4px 0 0; }
  `],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  loading = false;

  form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    const { email, password } = this.form.value;
    this.authService.login(email, password).subscribe({
      next: () => this.router.navigate(['/']),
      error: () => {
        this.message.error('Identifiants invalides');
        this.loading = false;
      },
    });
  }
}
