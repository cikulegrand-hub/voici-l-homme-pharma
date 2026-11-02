import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthApiService } from '../../core/api/services/auth-api.service';
import { I18N_FR } from '../../core/i18n/translations.fr';

export interface ResetPasswordDialogData {
  userId: string;
  username: string;
  fullName: string;
}

function passwordPolicyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value || '';
  const errors: Record<string, boolean> = {};
  if (val.length < 10) errors['minlength'] = true;
  if (!/[A-Z]/.test(val)) errors['noUppercase'] = true;
  if (!/[a-z]/.test(val)) errors['noLowercase'] = true;
  if (!/\d/.test(val)) errors['noDigit'] = true;
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val)) errors['noSpecial'] = true;
  return Object.keys(errors).length > 0 ? errors : null;
}

@Component({
  selector: 'app-reset-password-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="dialog-icon">lock_reset</mat-icon>
      {{ i18n.users.resetPassword }}
    </h2>
    <mat-dialog-content>
      <p class="dialog-info">
        Réinitialisation du mot de passe pour <strong>{{ data.fullName }}</strong> ({{ data.username }}).
      </p>

      <form [formGroup]="form" class="form-fields">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Nouveau mot de passe</mat-label>
          <input matInput [type]="hidePassword() ? 'password' : 'text'" formControlName="newPassword" />
          <button mat-icon-button matSuffix type="button" (click)="togglePassword()">
            <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Confirmer le mot de passe</mat-label>
          <input matInput [type]="hidePassword() ? 'password' : 'text'" formControlName="confirmPassword" />
        </mat-form-field>

        <div *ngIf="form.get('confirmPassword')?.touched && form.hasError('passwordsMismatch')" class="error-text">
          {{ i18n.users.passwordsMismatch }}
        </div>

        <!-- Règles de politique de mot de passe -->
        <div class="policy-rules">
          <p class="rules-title">{{ i18n.users.rulesTitle }}</p>
          <div class="rule" [class.valid]="passValue.length >= 10">
            <mat-icon>{{ passValue.length >= 10 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            {{ i18n.users.ruleLength }}
          </div>
          <div class="rule" [class.valid]="hasUppercase">
            <mat-icon>{{ hasUppercase ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            {{ i18n.users.ruleUpper }}
          </div>
          <div class="rule" [class.valid]="hasLowercase">
            <mat-icon>{{ hasLowercase ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            {{ i18n.users.ruleLower }}
          </div>
          <div class="rule" [class.valid]="hasDigit">
            <mat-icon>{{ hasDigit ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            {{ i18n.users.ruleDigit }}
          </div>
          <div class="rule" [class.valid]="hasSpecial">
            <mat-icon>{{ hasSpecial ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            {{ i18n.users.ruleSpecial }}
          </div>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ i18n.actions.cancel }}</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || isSubmitting()" (click)="submit()">
        <mat-spinner *ngIf="isSubmitting()" diameter="18" class="btn-spinner"></mat-spinner>
        {{ i18n.actions.confirm }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-icon { vertical-align: middle; margin-right: 8px; color: #0f9d58; }
    .dialog-info { color: #5f6368; font-size: 14px; margin-bottom: 16px; }
    .form-fields { display: flex; flex-direction: column; gap: 4px; }
    .full-width { width: 100%; }
    .error-text { color: #c5221f; font-size: 12px; margin-top: -8px; margin-bottom: 8px; }
    .policy-rules { background: #f8f9fa; border-radius: 8px; padding: 12px 16px; margin-top: 4px; }
    .rules-title { font-size: 13px; font-weight: 600; color: #1e3a2f; margin: 0 0 8px; }
    .rule { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9aa0a6; padding: 2px 0; }
    .rule mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .rule.valid { color: #137333; }
    .rule.valid mat-icon { color: #0f9d58; }
    .btn-spinner { display: inline-block; margin-right: 6px; }
  `],
})
export class ResetPasswordDialogComponent {
  private readonly authApi = inject(AuthApiService);
  readonly dialogRef = inject(MatDialogRef<ResetPasswordDialogComponent>);
  readonly data: ResetPasswordDialogData = inject(MAT_DIALOG_DATA);
  readonly i18n = I18N_FR;
  readonly hidePassword = signal(true);
  readonly isSubmitting = signal(false);

  form: FormGroup;

  get passValue(): string { return this.form?.get('newPassword')?.value || ''; }
  get hasUppercase(): boolean { return /[A-Z]/.test(this.passValue); }
  get hasLowercase(): boolean { return /[a-z]/.test(this.passValue); }
  get hasDigit(): boolean { return /\d/.test(this.passValue); }
  get hasSpecial(): boolean { return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(this.passValue); }

  constructor() {
    const fb = inject(FormBuilder);
    this.form = fb.group({
      newPassword: ['', [Validators.required, passwordPolicyValidator]],
      confirmPassword: ['', [Validators.required]],
    }, { validators: this.passwordsMatchValidator });
  }

  togglePassword(): void {
    this.hidePassword.update((v) => !v);
  }

  passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
    const pass = group.get('newPassword')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return pass && confirm && pass !== confirm ? { passwordsMismatch: true } : null;
  }

  submit(): void {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);
    this.authApi.resetPassword(this.data.userId, { newPassword: this.form.value.newPassword }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        // Error handled by global interceptor
      },
    });
  }
}

