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
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, NzFormModule, NzInputModule, NzButtonModule, NzCardModule, RouterLink],
  template: `
    <div class="auth-container">
      <nz-card style="width:420px">
        <div class="auth-header">
          <h1>Ostia</h1>
          <p>Créer un compte</p>
        </div>
        <form nz-form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div style="display:flex; gap:8px">
            <nz-form-item style="flex:1">
              <nz-form-control nzErrorTip="Requis">
                <input nz-input formControlName="firstName" placeholder="Prénom" />
              </nz-form-control>
            </nz-form-item>
            <nz-form-item style="flex:1">
              <nz-form-control nzErrorTip="Requis">
                <input nz-input formControlName="lastName" placeholder="Nom" />
              </nz-form-control>
            </nz-form-item>
          </div>
          <nz-form-item>
            <nz-form-control nzErrorTip="Email invalide">
              <input nz-input formControlName="email" placeholder="Email" type="email" />
            </nz-form-control>
          </nz-form-item>
          <nz-form-item>
            <nz-form-control nzErrorTip="Min. 8 caractères">
              <input nz-input formControlName="password" placeholder="Mot de passe" type="password" />
            </nz-form-control>
          </nz-form-item>
          <button nz-button nzType="primary" nzBlock [nzLoading]="loading" type="submit">
            Créer mon compte
          </button>
        </form>
        <div style="text-align:center; margin-top:16px">
          Déjà un compte ? <a routerLink="/auth/login">Se connecter</a>
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
  });

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    const { firstName, lastName, email, password } = this.form.value;
    this.authService.register(firstName, lastName, email, password).subscribe({
      next: () => this.router.navigate(['/']),
      error: (err) => {
        this.message.error(err.error?.message || 'Erreur lors de la création du compte');
        this.loading = false;
      },
    });
  }
}
