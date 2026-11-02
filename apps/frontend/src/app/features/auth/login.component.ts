import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/services/alert.service';
import { I18N_FR } from '../../core/i18n/translations.fr';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-wrapper">
      <div class="login-container">
        <!-- Logo et En-tête -->
        <div class="brand-header">
          <div class="logo-circle">
            <mat-icon class="brand-icon">local_pharmacy</mat-icon>
          </div>
          <h1 class="brand-title">{{ i18n.appName }}</h1>
          <p class="brand-subtitle">{{ i18n.appSubtitle }}</p>
        </div>

        <!-- Notification de raison de déconnexion -->
        <div class="info-alert" *ngIf="inactivityNotice()" role="alert">
          <mat-icon>info</mat-icon>
          <span>{{ inactivityNotice() }}</span>
        </div>

        <mat-card class="login-card">
          <mat-card-header>
            <mat-card-title>{{ i18n.auth.loginTitle }}</mat-card-title>
            <mat-card-subtitle>{{ i18n.auth.loginSubtitle }}</mat-card-subtitle>
          </mat-card-header>

          <mat-card-content>
            <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="login-form">
              <!-- Champ Nom d'utilisateur -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ i18n.auth.usernameLabel }}</mat-label>
                <input
                  matInput
                  formControlName="username"
                  autocomplete="username"
                  placeholder="ex: admin"
                  autofocus
                  required
                  (keydown.enter)="onEnterUsername($event)"
                />
                <mat-icon matPrefix>person_outline</mat-icon>
                <mat-error *ngIf="loginForm.get('username')?.hasError('required')">
                  {{ i18n.common.required }}
                </mat-error>
              </mat-form-field>

              <!-- Champ Mot de passe -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ i18n.auth.passwordLabel }}</mat-label>
                <input
                  #passwordInput
                  matInput
                  [type]="hidePassword() ? 'password' : 'text'"
                  formControlName="password"
                  autocomplete="current-password"
                  placeholder="••••••••••"
                  required
                  (keydown.enter)="onSubmit()"
                />
                <mat-icon matPrefix>lock_outline</mat-icon>
                <button
                  mat-icon-button
                  matSuffix
                  type="button"
                  tabindex="-1"
                  (click)="togglePasswordVisibility()"
                  [attr.aria-label]="hidePassword() ? 'Afficher le mot de passe' : 'Masquer le mot de passe'"
                >
                  <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
                <mat-error *ngIf="loginForm.get('password')?.hasError('required')">
                  {{ i18n.common.required }}
                </mat-error>
              </mat-form-field>

              <!-- Bannière d'erreur contextualisée (AUT-01, AUT-02, AUT-04) -->
              <div class="error-banner" *ngIf="errorMessage()" role="alert">
                <mat-icon>{{ getErrorIcon() }}</mat-icon>
                <span>{{ errorMessage() }}</span>
              </div>

              <!-- Bouton de soumission -->
              <button
                mat-flat-button
                color="primary"
                type="submit"
                class="btn-submit"
                [disabled]="loginForm.invalid || isLoading()"
              >
                <mat-spinner *ngIf="isLoading()" diameter="20" class="btn-spinner"></mat-spinner>
                <span>{{ isLoading() ? i18n.auth.loggingIn : i18n.auth.submitButton }}</span>
              </button>
            </form>
          </mat-card-content>
        </mat-card>

        <!-- Pied de page officiel -->
        <footer class="login-footer">
          <p>Conforme aux spécifications VHP-CDC-001 (AUT-01 à AUT-08, SEC-01 à SEC-03)</p>
          <p>Kinshasa, RDC · Version 1.0</p>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .login-wrapper {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1e3a2f 0%, #0d221a 100%);
      padding: 24px;
    }

    .login-container {
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .brand-header {
      text-align: center;
      color: #ffffff;
    }

    .logo-circle {
      width: 64px;
      height: 64px;
      background: #0f9d58;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(15, 157, 88, 0.4);
    }

    .brand-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #ffffff;
    }

    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 4px;
    }

    .brand-subtitle {
      font-size: 14px;
      color: #a0aec0;
      margin: 0;
    }

    .info-alert {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #e8f0fe;
      color: #1a73e8;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      border-left: 4px solid #1a73e8;
    }

    .login-card {
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      padding: 8px;
    }

    mat-card-header {
      margin-bottom: 20px;
    }

    mat-card-title {
      font-size: 20px;
      font-weight: 700;
      color: #1e3a2f;
    }

    mat-card-subtitle {
      color: #5f6368;
      font-size: 13px;
      margin-top: 4px;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .full-width {
      width: 100%;
    }

    .error-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: #fce8e6;
      color: #c5221f;
      padding: 12px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      border-left: 4px solid #c5221f;
    }

    .error-banner mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .btn-submit {
      height: 48px;
      font-size: 15px;
      font-weight: 700;
      background-color: #0f9d58;
      color: #ffffff;
      margin-top: 8px;
      border-radius: 8px;
    }

    .btn-spinner {
      display: inline-block;
      margin-right: 8px;
    }

    .login-footer {
      text-align: center;
      color: #8fa39a;
      font-size: 12px;
      line-height: 1.6;
    }
  `],
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly i18n = I18N_FR;
  readonly isLoading = signal(false);
  readonly hidePassword = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly inactivityNotice = signal<string | null>(null);

  loginForm: FormGroup = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  private returnUrl = '/dashboard';

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
    const reason = this.route.snapshot.queryParams['reason'];

    if (reason === 'inactivity') {
      this.inactivityNotice.set(this.i18n.auth.inactivityLogout);
    } else if (reason === 'session_expired') {
      this.inactivityNotice.set(this.i18n.auth.sessionExpired);
    }
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update((val) => !val);
  }

  onEnterUsername(event: Event): void {
    event.preventDefault();
    const pwdInput = document.querySelector('input[formControlName="password"]') as HTMLInputElement;
    if (pwdInput) {
      pwdInput.focus();
    }
  }

  getErrorIcon(): string {
    const msg = this.errorMessage() || '';
    if (msg.includes('verrouillé')) return 'lock_clock';
    if (msg.includes('désactivé')) return 'person_off';
    if (msg.includes('Tentatives restantes')) return 'warning';
    return 'error_outline';
  }

  onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { username, password } = this.loginForm.value;

    this.authService.login({ username: username.trim(), password }).subscribe({
      next: (session) => {
        this.isLoading.set(false);
        this.alertService.success(`Bienvenue, ${session.user.fullName} !`);
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (err) => {
        this.isLoading.set(false);
        const serverMsg = err?.error?.message;
        let displayMsg = '';

        if (serverMsg) {
          displayMsg = serverMsg;
        } else if (err.status === 401) {
          displayMsg = this.i18n.auth.loginFailed;
        } else if (err.status === 429) {
          displayMsg = 'Trop de tentatives de connexion. Veuillez patienter une minute (SEC-03).';
        } else {
          displayMsg = this.i18n.errors.network;
        }

        this.errorMessage.set(displayMsg);
      },
    });
  }
}
