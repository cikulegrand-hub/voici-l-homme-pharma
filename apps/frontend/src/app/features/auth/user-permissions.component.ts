import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';

import { AuthApiService } from '../../core/api/services/auth-api.service';
import { AlertService } from '../../core/services/alert.service';
import { I18N_FR } from '../../core/i18n/translations.fr';

interface PermRow {
  code: string;
  label: string;
  isGrantedByRole: boolean;
  isOverridden: boolean;
  overrideType: 'GRANT' | 'DENY' | null;
  isEffective: boolean;
  /** Local toggle state in the UI */
  toggled: boolean;
}

interface CategoryGroup {
  category: string;
  permissions: PermRow[];
}

@Component({
  selector: 'app-user-permissions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  template: `
    <div class="perms-page">
      <mat-card class="page-header-card">
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <button mat-icon-button (click)="goBack()"><mat-icon>arrow_back</mat-icon></button>
              Accès personnels
            </h1>
            <p class="page-subtitle" *ngIf="userName()">
              {{ userName() }} — <span class="role-badge">{{ getRoleName(role()) }}</span>
            </p>
          </div>
          <div class="header-actions">
            <button mat-stroked-button (click)="resetAll()" [disabled]="!hasChanges() || isSaving()">
              <mat-icon>restart_alt</mat-icon>
              Réinitialiser
            </button>
            <button mat-flat-button color="primary" (click)="save()" [disabled]="!hasChanges() || isSaving()">
              <mat-spinner *ngIf="isSaving()" diameter="18" class="btn-spinner"></mat-spinner>
              <mat-icon *ngIf="!isSaving()">save</mat-icon>
              Enregistrer
            </button>
          </div>
        </div>
      </mat-card>

      <div *ngIf="isLoading()" class="loading-center">
        <mat-spinner diameter="40"></mat-spinner>
        <span>Chargement des accès…</span>
      </div>

      <div *ngIf="!isLoading() && categories().length > 0" class="categories-list">
        <mat-card *ngFor="let cat of categories()" class="category-card">
          <h3 class="category-title">{{ cat.category }}</h3>
          <div class="perm-list">
            <div *ngFor="let perm of cat.permissions" class="perm-row" [class.denied]="!perm.toggled">
              <div class="perm-info">
                <span class="perm-label">{{ perm.label }}</span>
                <div class="perm-tags">
                  <mat-chip *ngIf="perm.isGrantedByRole" class="tag-role" disableRipple>
                    Inclus dans le rôle
                  </mat-chip>
                  <mat-chip *ngIf="!perm.isGrantedByRole && perm.toggled" class="tag-added" disableRipple>
                    Ajouté
                  </mat-chip>
                  <mat-chip *ngIf="perm.isGrantedByRole && !perm.toggled" class="tag-removed" disableRipple>
                    Retiré
                  </mat-chip>
                </div>
              </div>
              <mat-slide-toggle
                [checked]="perm.toggled"
                (change)="togglePerm(perm, $event.checked)"
                [matTooltip]="perm.toggled ? 'Cliquez pour retirer cet accès' : 'Cliquez pour accorder cet accès'"
              ></mat-slide-toggle>
            </div>
          </div>
        </mat-card>
      </div>

      <div *ngIf="!isLoading() && categories().length === 0" class="empty-state">
        <mat-icon>security</mat-icon>
        <p>Impossible de charger les accès de cet utilisateur.</p>
      </div>
    </div>
  `,
  styles: [`
    .perms-page { padding: 24px; max-width: 900px; margin: 0 auto; }
    .page-header-card { margin-bottom: 16px; padding: 20px 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
    .page-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 700; color: #1e3a2f; margin: 0; }
    .page-subtitle { color: #5f6368; font-size: 14px; margin: 4px 0 0; }
    .role-badge { background: #e8f0fe; color: #1a73e8; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; }
    .header-actions { display: flex; gap: 10px; }
    .loading-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px; color: #5f6368; }
    .categories-list { display: grid; gap: 16px; }
    .category-card { padding: 20px 24px; }
    .category-title { font-size: 16px; font-weight: 700; color: #0f766e; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
    .perm-list { display: flex; flex-direction: column; gap: 6px; }
    .perm-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-radius: 8px; background: #f0fdf4; transition: background 0.2s; }
    .perm-row.denied { background: #fef2f2; }
    .perm-info { flex: 1; min-width: 0; }
    .perm-label { font-size: 13px; font-weight: 500; color: #1e293b; }
    .perm-tags { display: flex; gap: 6px; margin-top: 3px; }
    .tag-role { font-size: 10px !important; min-height: 20px !important; padding: 0 8px !important; background: #e8f0fe !important; color: #1a73e8 !important; }
    .tag-added { font-size: 10px !important; min-height: 20px !important; padding: 0 8px !important; background: #e6f4ea !important; color: #137333 !important; }
    .tag-removed { font-size: 10px !important; min-height: 20px !important; padding: 0 8px !important; background: #fce8e6 !important; color: #c5221f !important; }
    .empty-state { text-align: center; padding: 48px; color: #5f6368; }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; color: #9aa0a6; }
    .btn-spinner { display: inline-block; margin-right: 6px; }

    @media (max-width: 600px) {
      .perms-page { padding: 8px 4px; }
      .page-header { flex-direction: column; align-items: stretch; }
      .header-actions { justify-content: stretch; }
      .header-actions button { flex: 1; }
    }
  `],
})
export class UserPermissionsComponent implements OnInit {
  private readonly authApi = inject(AuthApiService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = I18N_FR;

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly userName = signal('');
  readonly role = signal('');
  readonly categories = signal<CategoryGroup[]>([]);
  readonly hasChanges = signal(false);

  private userId = '';
  private initialState = new Map<string, boolean>();

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.userId) {
      this.router.navigate(['/users']);
      return;
    }
    this.loadPermissions();
  }

  loadPermissions(): void {
    this.isLoading.set(true);

    // Load user info
    this.authApi.getUserById(this.userId).subscribe({
      next: (user) => {
        this.userName.set(user.fullName);
        this.role.set(user.role);
      },
    });

    // Load permissions overview
    this.authApi.getUserPermissions(this.userId).subscribe({
      next: (data) => {
        this.role.set(data.role);
        const cats: CategoryGroup[] = data.categories.map((cat) => ({
          category: cat.category,
          permissions: cat.permissions.map((p) => ({
            ...p,
            toggled: p.isEffective,
          })),
        }));
        this.categories.set(cats);
        // Save initial state
        this.initialState.clear();
        for (const cat of cats) {
          for (const p of cat.permissions) {
            this.initialState.set(p.code, p.toggled);
          }
        }
        this.hasChanges.set(false);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.alertService.error('Impossible de charger les accès.');
      },
    });
  }

  togglePerm(perm: PermRow, checked: boolean): void {
    perm.toggled = checked;
    this.checkChanges();
  }

  resetAll(): void {
    for (const cat of this.categories()) {
      for (const perm of cat.permissions) {
        perm.toggled = this.initialState.get(perm.code) ?? perm.isEffective;
      }
    }
    this.hasChanges.set(false);
  }

  save(): void {
    this.isSaving.set(true);
    const overrides: Array<{ permission: string; overrideType: 'GRANT' | 'DENY' | null }> = [];

    for (const cat of this.categories()) {
      for (const perm of cat.permissions) {
        const originalEffective = this.initialState.get(perm.code) ?? perm.isEffective;
        if (perm.toggled !== originalEffective) {
          if (perm.isGrantedByRole && !perm.toggled) {
            overrides.push({ permission: perm.code, overrideType: 'DENY' });
          } else if (!perm.isGrantedByRole && perm.toggled) {
            overrides.push({ permission: perm.code, overrideType: 'GRANT' });
          } else {
            overrides.push({ permission: perm.code, overrideType: null });
          }
        }
      }
    }

    this.authApi.updateUserPermissions(this.userId, overrides).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.alertService.success('Accès personnels mis à jour avec succès.');
        this.loadPermissions();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alertService.error(err?.error?.message || 'Erreur lors de la mise à jour des accès.');
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/users']);
  }

  getRoleName(role: string): string {
    return (this.i18n.roles as Record<string, string>)[role] || role;
  }

  private checkChanges(): void {
    let changed = false;
    for (const cat of this.categories()) {
      for (const perm of cat.permissions) {
        if (perm.toggled !== (this.initialState.get(perm.code) ?? perm.isEffective)) {
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
    this.hasChanges.set(changed);
  }
}

