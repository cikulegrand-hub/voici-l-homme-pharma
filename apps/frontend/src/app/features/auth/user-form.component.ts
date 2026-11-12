import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';

import { AuthApiService } from '../../core/api/services/auth-api.service';
import { AlertService } from '../../core/services/alert.service';
import { I18N_FR } from '../../core/i18n/translations.fr';
import { RoleName } from '@vhp/shared';

function passwordPolicyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value || '';
  if (!val) return null; // Let required handle empty
  const errors: Record<string, boolean> = {};
  if (val.length < 10) errors['minlength'] = true;
  if (!/[A-Z]/.test(val)) errors['noUppercase'] = true;
  if (!/[a-z]/.test(val)) errors['noLowercase'] = true;
  if (!/\d/.test(val)) errors['noDigit'] = true;
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val)) errors['noSpecial'] = true;
  return Object.keys(errors).length > 0 ? errors : null;
}

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  template: `
    <div class="form-page">
      <mat-card class="form-card">
        <mat-card-header>
          <mat-card-title class="form-title">
            <button mat-icon-button (click)="goBack()"><mat-icon>arrow_back</mat-icon></button>
            @if (isEditMode()) {
              <span>{{ i18n.users.editUser }}</span>
            } @else {
              <span>{{ i18n.users.newUser }}</span>
            }
          </mat-card-title>
        </mat-card-header>

        <mat-card-content>
          <div *ngIf="isLoadingUser()" class="loading-center">
            <mat-spinner diameter="36"></mat-spinner>
          </div>

          <form *ngIf="!isLoadingUser()" [formGroup]="form" (ngSubmit)="onSubmit()" class="user-form">
            <!-- Identifiant -->
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.users.username }}</mat-label>
              <mat-icon matPrefix>person</mat-icon>
              <input matInput formControlName="username" [readonly]="isEditMode()" />
              <mat-error *ngIf="form.get('username')?.hasError('required')">{{ i18n.common.required }}</mat-error>
            </mat-form-field>

            <!-- Nom complet -->
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.users.fullName }}</mat-label>
              <mat-icon matPrefix>badge</mat-icon>
              <input matInput formControlName="fullName" />
              <mat-error *ngIf="form.get('fullName')?.hasError('required')">{{ i18n.common.required }}</mat-error>
            </mat-form-field>

            <!-- Email -->
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.users.email }}</mat-label>
              <mat-icon matPrefix>email</mat-icon>
              <input matInput formControlName="email" type="email" />
              <mat-error *ngIf="form.get('email')?.hasError('email')">Adresse email invalide</mat-error>
            </mat-form-field>

            <!-- Rôle -->
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.users.role }}</mat-label>
              <mat-select formControlName="role">
                @for (role of availableRoles; track role) {
                  <mat-option [value]="role">{{ getRoleName(role) }}</mat-option>
                }
              </mat-select>
              <mat-error *ngIf="form.get('role')?.hasError('required')">{{ i18n.common.required }}</mat-error>
            </mat-form-field>

            <!-- Mot de passe (création uniquement ou optionnel en édition) -->
            <div *ngIf="!isEditMode()" class="password-section">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ i18n.users.password }}</mat-label>
                <mat-icon matPrefix>lock</mat-icon>
                <input matInput [type]="hidePassword() ? 'password' : 'text'" formControlName="password" />
                <button mat-icon-button matSuffix type="button" (click)="togglePassword()">
                  <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
                <mat-error *ngIf="form.get('password')?.hasError('required')">{{ i18n.common.required }}</mat-error>
              </mat-form-field>

              <!-- Politique de mot de passe -->
              <div class="policy-rules" *ngIf="form.get('password')?.value">
                <p class="rules-title">{{ i18n.users.rulesTitle }}</p>
                <div class="rule" [class.valid]="passValue.length >= 10">
                  <mat-icon>{{ passValue.length >= 10 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                  {{ i18n.users.ruleLength }}
                </div>
                <div class="rule" [class.valid]="hasUpper">
                  <mat-icon>{{ hasUpper ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                  {{ i18n.users.ruleUpper }}
                </div>
                <div class="rule" [class.valid]="hasLower">
                  <mat-icon>{{ hasLower ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
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
            </div>

            <!-- Code PIN -->
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.users.pinCode }}</mat-label>
              <mat-icon matPrefix>pin</mat-icon>
              <input matInput formControlName="pinCode" maxlength="4" placeholder="4 chiffres" />
              <mat-error *ngIf="form.get('pinCode')?.hasError('pattern')">{{ i18n.users.pinInvalid }}</mat-error>
            </mat-form-field>

            
            <!-- Accès personnels & Dérogations par module (CDC VHP-AUT) -->
            <div *ngIf="isEditMode()" class="personal-perms-section">
              <mat-divider class="section-divider"></mat-divider>
              <div class="perms-section-header">
                <div>
                  <h3 class="perms-section-title">
                    <mat-icon class="title-icon">security</mat-icon>
                    Accès personnels & dérogations
                  </h3>
                  <p class="perms-section-desc">
                    Ajustez les droits effectifs de l'utilisateur. En cas de conflit, le refus l'emporte toujours.
                  </p>
                </div>
              </div>

              <div *ngIf="loadingPerms()" class="perms-loading">
                <mat-spinner diameter="24"></mat-spinner>
                <span>Chargement des accès…</span>
              </div>

              <div *ngIf="!loadingPerms() && permCategories().length > 0" class="perm-categories-container">
                <div *ngFor="let cat of permCategories()" class="perm-category-block">
                  <h4 class="cat-title">{{ cat.category }}</h4>
                  <div class="cat-perms-grid">
                    <div *ngFor="let p of cat.permissions" class="perm-toggle-row" [class.perm-revoked]="!p.toggled">
                      <div class="perm-text-col">
                        <span class="perm-title-text">{{ p.label }}</span>
                        <div class="perm-status-badges">
                          <span *ngIf="p.isGrantedByRole && p.toggled" class="badge-role">Inclus dans le rôle</span>
                          <span *ngIf="!p.isGrantedByRole && p.toggled" class="badge-added">Ajouté</span>
                          <span *ngIf="p.isGrantedByRole && !p.toggled" class="badge-removed">Retiré</span>
                        </div>
                      </div>
                      <mat-slide-toggle
                        [checked]="p.toggled"
                        (change)="togglePermission(p, $event.checked)"
                        [matTooltip]="p.toggled ? 'Retirer cet accès' : 'Rétablir cet accès'"
                      ></mat-slide-toggle>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Boutons -->
            <div class="form-actions">
              <button *ngIf="isEditMode()" mat-stroked-button type="button" (click)="goToPermissions()" class="btn-perms">
                <mat-icon>security</mat-icon>
                Accès personnels
              </button>
              <button mat-button type="button" (click)="goBack()">{{ i18n.actions.cancel }}</button>
              <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || isSubmitting()">
                <mat-spinner *ngIf="isSubmitting()" diameter="18" class="btn-spinner"></mat-spinner>
                {{ i18n.actions.save }}
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .section-divider { margin: 24px 0 16px; }
    .personal-perms-section { margin-top: 8px; }
    .perms-section-header { margin-bottom: 16px; }
    .perms-section-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; color: #0f766e; margin: 0; }
    .perms-section-title .title-icon { color: #0f766e; font-size: 20px; width: 20px; height: 20px; }
    .perms-section-desc { font-size: 12px; color: #5f6368; margin: 4px 0 0; }
    .perms-loading { display: flex; align-items: center; gap: 10px; padding: 16px 0; color: #5f6368; font-size: 13px; }
    .perm-categories-container { display: flex; flex-direction: column; gap: 16px; }
    .perm-category-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
    .cat-title { font-size: 13px; font-weight: 700; color: #1e3a2f; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .cat-perms-grid { display: flex; flex-direction: column; gap: 8px; }
    .perm-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb; transition: all 0.2s; }
    .perm-toggle-row.perm-revoked { background: #fef2f2; border-color: #fecaca; }
    .perm-text-col { flex: 1; min-width: 0; }
    .perm-title-text { font-size: 13px; font-weight: 500; color: #1e293b; display: block; }
    .perm-status-badges { display: flex; gap: 6px; margin-top: 2px; }
    .badge-role { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #e8f0fe; color: #1a73e8; font-weight: 600; }
    .badge-added { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #e6f4ea; color: #137333; font-weight: 600; }
    .badge-removed { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #fce8e6; color: #c5221f; font-weight: 600; }

    .form-page { padding: 24px; max-width: 640px; margin: 0 auto; }
    .form-card { padding: 8px; }
    .form-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 700; color: #1e3a2f; }
    .user-form { display: flex; flex-direction: column; gap: 4px; padding-top: 16px; }
    .full-width { width: 100%; }
    .password-section { display: flex; flex-direction: column; gap: 4px; }
    .policy-rules { background: #f8f9fa; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
    .rules-title { font-size: 13px; font-weight: 600; color: #1e3a2f; margin: 0 0 8px; }
    .rule { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9aa0a6; padding: 2px 0; }
    .rule mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .rule.valid { color: #137333; }
    .rule.valid mat-icon { color: #0f9d58; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
    .loading-center { display: flex; justify-content: center; padding: 48px; }
    .btn-spinner { display: inline-block; margin-right: 6px; }

    @media (max-width: 600px) {
      .form-page { padding: 8px 4px; }
      .form-actions { flex-direction: column; }
      .form-actions button { width: 100%; }
    }
  `],
})
export class UserFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly i18n = I18N_FR;
  readonly isEditMode = signal(false);
  readonly isLoadingUser = signal(false);
  readonly isSubmitting = signal(false);
  readonly hidePassword = signal(true);
  readonly availableRoles: RoleName[] = ['ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE'];

  private editUserId = '';
  readonly loadingPerms = signal(false);
  readonly permCategories = signal<Array<{ category: string; permissions: any[] }>>([]);
  private initialPermState = new Map<string, boolean>();


  form: FormGroup = this.fb.group({
    username: ['', [Validators.required]],
    fullName: ['', [Validators.required]],
    email: ['', [Validators.email]],
    role: ['CAISSIER', [Validators.required]],
    password: ['', [Validators.required, passwordPolicyValidator]],
    pinCode: ['', [Validators.pattern(/^\d{4}$/)]],
  });

  get passValue(): string { return this.form.get('password')?.value || ''; }
  get hasUpper(): boolean { return /[A-Z]/.test(this.passValue); }
  get hasLower(): boolean { return /[a-z]/.test(this.passValue); }
  get hasDigit(): boolean { return /\d/.test(this.passValue); }
  get hasSpecial(): boolean { return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(this.passValue); }

  togglePassword(): void {
    this.hidePassword.update((v) => !v);
  }

  getRoleName(role: string): string {
    return (this.i18n.roles as Record<string, string>)[role] || role;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.editUserId = id;
      this.form.get('password')?.clearValidators();
      this.form.get('password')?.updateValueAndValidity();
      this.loadUser(id);
      this.loadPermissions(id);
    }
  }

  
  loadPermissions(userId: string): void {
    this.loadingPerms.set(true);
    this.authApi.getUserPermissions(userId).subscribe({
      next: (data) => {
        const cats = data.categories.map((c) => ({
          category: c.category,
          permissions: c.permissions.map((p) => ({ ...p, toggled: p.isEffective })),
        }));
        this.permCategories.set(cats);
        this.initialPermState.clear();
        for (const cat of cats) {
          for (const p of cat.permissions) {
            this.initialPermState.set(p.code, p.toggled);
          }
        }
        this.loadingPerms.set(false);
      },
      error: () => this.loadingPerms.set(false),
    });
  }

  togglePermission(perm: any, checked: boolean): void {
    perm.toggled = checked;
  }

  private collectPermissionOverrides(): Array<{ permission: string; overrideType: 'GRANT' | 'DENY' | null }> {
    const overrides: Array<{ permission: string; overrideType: 'GRANT' | 'DENY' | null }> = [];
    for (const cat of this.permCategories()) {
      for (const p of cat.permissions) {
        const original = this.initialPermState.get(p.code) ?? p.isEffective;
        if (p.toggled !== original) {
          if (p.isGrantedByRole && !p.toggled) {
            overrides.push({ permission: p.code, overrideType: 'DENY' });
          } else if (!p.isGrantedByRole && p.toggled) {
            overrides.push({ permission: p.code, overrideType: 'GRANT' });
          } else {
            overrides.push({ permission: p.code, overrideType: null });
          }
        }
      }
    }
    return overrides;
  }

  loadUser(id: string): void {
    this.isLoadingUser.set(true);
    this.authApi.getUserById(id).subscribe({
      next: (user) => {
        this.form.patchValue({
          username: user.username,
          fullName: user.fullName,
          email: user.email || '',
          role: user.role,
        });
        this.isLoadingUser.set(false);
      },
      error: () => {
        this.isLoadingUser.set(false);
        this.alertService.error('Utilisateur introuvable.');
        this.router.navigate(['/users']);
      },
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);

    if (this.isEditMode()) {
      const dto: any = {
        fullName: this.form.value.fullName,
        email: this.form.value.email || undefined,
        role: this.form.value.role,
      };
      if (this.form.value.pinCode) dto.pinCode = this.form.value.pinCode;

      this.authApi.updateUser(this.editUserId, dto).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.alertService.success('Utilisateur modifié avec succès.');
          this.router.navigate(['/users']);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.alertService.error(err?.error?.message || 'Erreur lors de la modification.');
        },
      });
    } else {
      const dto = {
        username: this.form.value.username.trim().toLowerCase(),
        fullName: this.form.value.fullName,
        email: this.form.value.email || undefined,
        password: this.form.value.password,
        role: this.form.value.role as RoleName,
        pinCode: this.form.value.pinCode || undefined,
      };
      this.authApi.createUser(dto).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.alertService.success('Utilisateur créé avec succès.');
          this.router.navigate(['/users']);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.alertService.error(err?.error?.message || 'Erreur lors de la création.');
        },
      });
    }
  }

  goToPermissions(): void {
    this.router.navigate(['/users', this.editUserId, 'permissions']);
  }

  goBack(): void {
    this.router.navigate(['/users']);
  }
}

