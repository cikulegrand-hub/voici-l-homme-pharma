import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/auth/auth.service';
import { AuthApiService } from '../../core/api/services/auth-api.service';
import { AlertService } from '../../core/services/alert.service';
import { I18N_FR } from '../../core/i18n/translations.fr';

function passwordPolicyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value || '';
  if (!val) return null;
  const errors: Record<string, boolean> = {};
  if (val.length < 10) errors['minlength'] = true;
  if (!/[A-Z]/.test(val)) errors['noUppercase'] = true;
  if (!/[a-z]/.test(val)) errors['noLowercase'] = true;
  if (!/\d/.test(val)) errors['noDigit'] = true;
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val)) errors['noSpecial'] = true;
  return Object.keys(errors).length > 0 ? errors : null;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="profile-page">
      <!-- Informations personnelles -->
      <mat-card class="profile-card">
        <mat-card-header>
          <mat-card-title class="section-title">
            <mat-icon>account_circle</mat-icon>
            {{ i18n.profile.personalInfo }}
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">{{ i18n.users.username }}</span>
              <span class="info-value">{{ currentUser()?.username || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ i18n.users.fullName }}</span>
              <span class="info-value">{{ currentUser()?.fullName || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ i18n.users.email }}</span>
              <span class="info-value">{{ currentUser()?.email || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ i18n.users.role }}</span>
              <span class="info-value role-badge" [class]="'role-' + (currentUser()?.role || '').toLowerCase()">
                {{ getRoleName(currentUser()?.role || '') }}
              </span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Changer le mot de passe -->
      <mat-card class="profile-card">
        <mat-card-header>
          <mat-card-title class="section-title">
            <mat-icon>lock</mat-icon>
            {{ i18n.profile.changePasswordTitle }}
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="passwordForm" (ngSubmit)="onChangePassword()" class="form-section">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.profile.currentPassword }}</mat-label>
              <input matInput type="password" formControlName="currentPassword" />
              <mat-error *ngIf="passwordForm.get('currentPassword')?.hasError('required')">{{ i18n.common.required }}</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.profile.newPassword }}</mat-label>
              <input matInput [type]="hideNewPwd() ? 'password' : 'text'" formControlName="newPassword" />
              <button mat-icon-button matSuffix type="button" (click)="toggleNewPwd()">
                <mat-icon>{{ hideNewPwd() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.profile.confirmNewPassword }}</mat-label>
              <input matInput type="password" formControlName="confirmNewPassword" />
            </mat-form-field>

            <div *ngIf="passwordForm.get('confirmNewPassword')?.touched && passwordForm.hasError('passwordsMismatch')" class="error-text">
              {{ i18n.users.passwordsMismatch }}
            </div>

            <!-- Politique -->
            <div class="policy-rules" *ngIf="passwordForm.get('newPassword')?.value">
              <p class="rules-title">{{ i18n.users.rulesTitle }}</p>
              <div class="rule" [class.valid]="newPwdValue.length >= 10">
                <mat-icon>{{ newPwdValue.length >= 10 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                {{ i18n.users.ruleLength }}
              </div>
              <div class="rule" [class.valid]="pwdHasUpper">
                <mat-icon>{{ pwdHasUpper ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                {{ i18n.users.ruleUpper }}
              </div>
              <div class="rule" [class.valid]="pwdHasLower">
                <mat-icon>{{ pwdHasLower ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                {{ i18n.users.ruleLower }}
              </div>
              <div class="rule" [class.valid]="pwdHasDigit">
                <mat-icon>{{ pwdHasDigit ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                {{ i18n.users.ruleDigit }}
              </div>
              <div class="rule" [class.valid]="pwdHasSpecial">
                <mat-icon>{{ pwdHasSpecial ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                {{ i18n.users.ruleSpecial }}
              </div>
            </div>

            <div class="form-actions">
              <button mat-flat-button color="primary" type="submit" [disabled]="passwordForm.invalid || isSavingPwd()">
                <mat-spinner *ngIf="isSavingPwd()" diameter="18" class="btn-spinner"></mat-spinner>
                {{ i18n.profile.savePassword }}
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Changer le code PIN -->
      <mat-card class="profile-card">
        <mat-card-header>
          <mat-card-title class="section-title">
            <mat-icon>pin</mat-icon>
            {{ i18n.profile.changePinTitle }}
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="pinForm" (ngSubmit)="onChangePin()" class="form-section">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.profile.currentPin }}</mat-label>
              <input matInput type="password" formControlName="currentPin" maxlength="4" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.profile.newPin }}</mat-label>
              <input matInput formControlName="newPin" maxlength="4" />
              <mat-error *ngIf="pinForm.get('newPin')?.hasError('required')">{{ i18n.common.required }}</mat-error>
              <mat-error *ngIf="pinForm.get('newPin')?.hasError('pattern')">{{ i18n.users.pinInvalid }}</mat-error>
            </mat-form-field>

            <div class="form-actions">
              <button mat-flat-button color="primary" type="submit" [disabled]="pinForm.invalid || isSavingPin()">
                <mat-spinner *ngIf="isSavingPin()" diameter="18" class="btn-spinner"></mat-spinner>
                {{ i18n.profile.savePin }}
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .profile-page { padding: 24px; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    .profile-card { padding: 8px; }
    .section-title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; color: #1e3a2f; }
    .section-title mat-icon { color: #0f9d58; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; padding-top: 8px; }
    .info-item { display: flex; flex-direction: column; gap: 4px; }
    .info-label { font-size: 12px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { font-size: 15px; color: #1e3a2f; }
    .role-badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 600; }
    .role-admin { background: #e8f0fe; color: #1a73e8; }
    .role-pharmacien { background: #e6f4ea; color: #137333; }
    .role-caissier { background: #fef7e0; color: #b06000; }
    .role-stock { background: #fce8e6; color: #c5221f; }
    .role-comptable { background: #f3e8fd; color: #7627bb; }
    .form-section { display: flex; flex-direction: column; gap: 4px; padding-top: 12px; }
    .full-width { width: 100%; }
    .error-text { color: #c5221f; font-size: 12px; margin-bottom: 8px; }
    .policy-rules { background: #f8f9fa; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
    .rules-title { font-size: 13px; font-weight: 600; color: #1e3a2f; margin: 0 0 8px; }
    .rule { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9aa0a6; padding: 2px 0; }
    .rule mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .rule.valid { color: #137333; }
    .rule.valid mat-icon { color: #0f9d58; }
    .form-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
    .btn-spinner { display: inline-block; margin-right: 6px; }
  `],
})
export class ProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly authApi = inject(AuthApiService);
  private readonly alertService = inject(AlertService);

  readonly i18n = I18N_FR;
  readonly currentUser = this.authService.currentUser;
  readonly hideNewPwd = signal(true);
  readonly isSavingPwd = signal(false);
  readonly isSavingPin = signal(false);

  passwordForm: FormGroup = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, passwordPolicyValidator]],
    confirmNewPassword: ['', [Validators.required]],
  }, { validators: this.passwordsMatchValidator });

  pinForm: FormGroup = this.fb.group({
    currentPin: [''],
    newPin: ['', [Validators.required, Validators.pattern(/^\d{4}$/)]],
  });

  get newPwdValue(): string { return this.passwordForm.get('newPassword')?.value || ''; }
  get pwdHasUpper(): boolean { return /[A-Z]/.test(this.newPwdValue); }
  get pwdHasLower(): boolean { return /[a-z]/.test(this.newPwdValue); }
  get pwdHasDigit(): boolean { return /\d/.test(this.newPwdValue); }
  get pwdHasSpecial(): boolean { return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(this.newPwdValue); }

  toggleNewPwd(): void {
    this.hideNewPwd.update((v) => !v);
  }

  getRoleName(role: string): string {
    return (this.i18n.roles as Record<string, string>)[role] || role;
  }

  passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
    const pass = group.get('newPassword')?.value;
    const confirm = group.get('confirmNewPassword')?.value;
    return pass && confirm && pass !== confirm ? { passwordsMismatch: true } : null;
  }

  ngOnInit(): void {
    // Refresh profile from API
    this.authService.loadMe().subscribe();
  }

  onChangePassword(): void {
    if (this.passwordForm.invalid) return;
    this.isSavingPwd.set(true);

    this.authApi.changeMyPassword({
      currentPassword: this.passwordForm.value.currentPassword,
      newPassword: this.passwordForm.value.newPassword,
    }).subscribe({
      next: () => {
        this.isSavingPwd.set(false);
        this.alertService.success(this.i18n.profile.passwordUpdated);
        this.passwordForm.reset();
      },
      error: (err) => {
        this.isSavingPwd.set(false);
        this.alertService.error(err?.error?.message || 'Erreur lors du changement de mot de passe.');
      },
    });
  }

  onChangePin(): void {
    if (this.pinForm.invalid) return;
    this.isSavingPin.set(true);

    this.authApi.changeMyPin({
      currentPin: this.pinForm.value.currentPin || undefined,
      newPin: this.pinForm.value.newPin,
    }).subscribe({
      next: () => {
        this.isSavingPin.set(false);
        this.alertService.success(this.i18n.profile.pinUpdated);
        this.pinForm.reset();
      },
      error: (err) => {
        this.isSavingPin.set(false);
        this.alertService.error(err?.error?.message || 'Erreur lors du changement de code PIN.');
      },
    });
  }
}

