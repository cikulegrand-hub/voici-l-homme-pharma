import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';

import { AuthApiService } from '../../core/api/services/auth-api.service';
import { AlertService } from '../../core/services/alert.service';
import { RoleItem, CreateRoleDto, UpdateRoleDto } from '@vhp/shared';

interface PermCatGroup {
  category: string;
  label: string;
  permissions: Array<{
    code: string;
    label: string;
    category: string;
    description?: string;
    checked: boolean;
  }>;
}

@Component({
  selector: 'app-roles-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatDividerModule,
    MatExpansionModule,
  ],
  template: `
    <div class="roles-page">
      <!-- En-tête -->
      <mat-card class="header-card">
        <div class="header-content">
          <div class="header-title-group">
            <h1 class="header-title">
              <mat-icon class="title-icon">shield</mat-icon>
              Gestion des Rôles & Habilitations (RBAC)
            </h1>
            <p class="header-subtitle">
              Définissez les profils métiers et les permissions associées pour chaque fonction de l'officine.
            </p>
          </div>
          <div class="header-actions">
            <button mat-stroked-button (click)="loadRoles()">
              <mat-icon>refresh</mat-icon>
              Actualiser
            </button>
            <button mat-flat-button color="primary" (click)="openCreateDialog()">
              <mat-icon>add</mat-icon>
              Nouveau Rôle
            </button>
          </div>
        </div>
      </mat-card>

      <!-- Chargement -->
      <div *ngIf="isLoading()" class="loading-state">
        <mat-spinner diameter="40"></mat-spinner>
        <span>Chargement des rôles…</span>
      </div>

      <!-- Liste des rôles -->
      <div *ngIf="!isLoading()" class="roles-grid">
        <mat-card *ngFor="let role of roles()" class="role-card" [class.system-card]="role.isSystem">
          <div class="role-card-header">
            <div class="role-info">
              <div class="role-title-row">
                <span class="role-name-badge" [class]="getRoleBadgeClass(role.name)">
                  {{ role.name }}
                </span>
                <mat-chip *ngIf="role.isSystem" class="chip-system" disableRipple>
                  <mat-icon>lock</mat-icon> Système
                </mat-chip>
                <mat-chip *ngIf="!role.isSystem" class="chip-custom" disableRipple>
                  Personnalisé
                </mat-chip>
              </div>
              <p class="role-desc">{{ role.description || 'Aucune description' }}</p>
            </div>
            <div class="role-actions">
              <button
                mat-icon-button
                (click)="editRole(role)"
                [disabled]="role.name === 'SUPER_ADMIN'"
                [matTooltip]="role.name === 'SUPER_ADMIN' ? 'Le Super-Administrateur possède le plein pouvoir absolu (*)' : 'Modifier les habilitations'"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                mat-icon-button
                color="warn"
                *ngIf="!role.isSystem"
                [disabled]="(role.userCount || 0) > 0"
                [matTooltip]="(role.userCount || 0) > 0 ? 'Impossible de supprimer un rôle avec des utilisateurs actifs' : 'Supprimer ce rôle'"
                (click)="confirmDeleteRole(role)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>

          <mat-divider></mat-divider>

          <div class="role-stats">
            <div class="stat-item">
              <mat-icon class="stat-icon">percent</mat-icon>
              <span class="stat-label">Plafond remise :</span>
              <span class="stat-val">{{ role.maxDiscountPercent }}%</span>
            </div>
            <div class="stat-item">
              <mat-icon class="stat-icon">group</mat-icon>
              <span class="stat-label">Utilisateurs :</span>
              <span class="stat-val">{{ role.userCount || 0 }}</span>
            </div>
            <div class="stat-item">
              <mat-icon class="stat-icon">verified_user</mat-icon>
              <span class="stat-label">Habilitations :</span>
              <span class="stat-val highlight">
                {{ isSuperAdmin(role.name) ? 'Plein pouvoir (*)' : role.permissionCodes.length + ' accordée(s)' }}
              </span>
            </div>
          </div>
        </mat-card>
      </div>

      <!-- Dialogue / Formulaire Création & Édition de Rôle -->
      <div *ngIf="showEditor()" class="modal-backdrop" (click)="closeEditor()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>
              <mat-icon>{{ isEditing() ? 'edit' : 'add_moderator' }}</mat-icon>
              {{ isEditing() ? 'Modifier le rôle : ' + currentRoleName() : 'Créer un nouveau rôle personnalisé' }}
            </h2>
            <button mat-icon-button (click)="closeEditor()">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <form [formGroup]="roleForm" (ngSubmit)="saveRole()" class="modal-body">
            <div class="form-row">
              <mat-form-field appearance="outline" class="flex-2">
                <mat-label>Nom du rôle (Code technique)</mat-label>
                <input matInput formControlName="name" placeholder="ex: SUPERVISEUR_VENTES" [readonly]="isEditing() && selectedRole()?.isSystem" />
                <mat-hint>Caractères majuscules et underscores recommandés</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline" class="flex-1">
                <mat-label>Plafond Remise (%)</mat-label>
                <input matInput type="number" formControlName="maxDiscountPercent" min="0" max="100" />
                <mat-hint>Max 100%</mat-hint>
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description du rôle</mat-label>
              <textarea matInput formControlName="description" rows="2" placeholder="Décrivez les responsabilités de ce rôle"></textarea>
            </mat-form-field>

            <mat-divider></mat-divider>

            <div class="perms-header">
              <h3>Permissions attribuées au rôle</h3>
              <p class="perms-sub">
                Cochez les actions que ce profil métier est autorisé à réaliser par défaut.
              </p>
            </div>

            <div class="perms-accordion">
              <div *ngFor="let cat of catalogCategories()" class="perm-cat-block">
                <div class="cat-header" (click)="toggleCategory(cat)">
                  <span class="cat-name">{{ cat.label }}</span>
                  <span class="cat-count">{{ countChecked(cat) }} / {{ cat.permissions.length }}</span>
                </div>
                <div class="cat-grid">
                  <div *ngFor="let p of cat.permissions" class="perm-item" [class.active]="p.checked">
                    <mat-slide-toggle [checked]="p.checked" (change)="p.checked = $event.checked">
                      <span class="perm-item-label">{{ p.label }}</span>
                    </mat-slide-toggle>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button mat-button type="button" (click)="closeEditor()">Annuler</button>
              <button mat-flat-button color="primary" type="submit" [disabled]="roleForm.invalid || isSaving()">
                <mat-spinner *ngIf="isSaving()" diameter="18" class="btn-spinner"></mat-spinner>
                Enregistrer le rôle
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .roles-page { padding: 24px; max-width: 1100px; margin: 0 auto; }
    .header-card { margin-bottom: 24px; padding: 16px 24px; border-radius: 12px; }
    .header-content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
    .header-title-group { display: flex; flex-direction: column; gap: 4px; }
    .header-title { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; color: #1e3a2f; margin: 0; }
    .title-icon { color: #0f766e; }
    .header-subtitle { color: #64748b; font-size: 14px; margin: 0; }
    .header-actions { display: flex; gap: 12px; }

    .loading-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px; color: #64748b; }
    
    .roles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
    .role-card { border-radius: 12px; border: 1px solid #e2e8f0; transition: box-shadow 0.2s; padding: 18px 20px; }
    .role-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .role-card.system-card { border-left: 4px solid #0f766e; }

    .role-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .role-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    
    .role-name-badge {
      font-weight: 700; font-size: 13px; padding: 3px 10px; border-radius: 8px; text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-super-admin { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
    .badge-admin { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .badge-pharmacien { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-caissier { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .badge-stock { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }
    .badge-comptable { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
    .badge-custom { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }

    .chip-system { font-size: 11px !important; min-height: 22px !important; background: #f8fafc !important; color: #475569 !important; border: 1px solid #e2e8f0; }
    .chip-system mat-icon { font-size: 14px; width: 14px; height: 14px; margin-right: 2px; }
    .chip-custom { font-size: 11px !important; min-height: 22px !important; background: #ecfdf5 !important; color: #047857 !important; border: 1px solid #a7f3d0; }

    .role-desc { font-size: 13px; color: #64748b; margin: 0; line-height: 1.4; min-height: 36px; }
    .role-actions { display: flex; gap: 4px; }

    .role-stats { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; font-size: 13px; }
    .stat-item { display: flex; align-items: center; gap: 8px; }
    .stat-icon { font-size: 18px; width: 18px; height: 18px; color: #94a3b8; }
    .stat-label { color: #64748b; font-weight: 500; }
    .stat-val { font-weight: 600; color: #1e293b; }
    .stat-val.highlight { color: #0f766e; }

    /* Modal Form */
    .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .modal-card { background: white; border-radius: 16px; width: 100%; max-width: 800px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e2e8f0; }
    .modal-header h2 { margin: 0; font-size: 18px; font-weight: 700; color: #1e3a2f; display: flex; align-items: center; gap: 8px; }
    .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .form-row { display: flex; gap: 16px; }
    .flex-2 { flex: 2; }
    .flex-1 { flex: 1; }
    .full-width { width: 100%; }

    .perms-header h3 { margin: 12px 0 4px; font-size: 15px; font-weight: 700; color: #1e3a2f; }
    .perms-sub { font-size: 13px; color: #64748b; margin: 0 0 16px; }
    .perms-accordion { display: flex; flex-direction: column; gap: 12px; }
    .perm-cat-block { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .cat-header { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 10px 16px; font-weight: 600; font-size: 13px; color: #0f766e; cursor: pointer; }
    .cat-count { font-size: 12px; background: #e2e8f0; padding: 2px 8px; border-radius: 10px; color: #334155; }
    .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; padding: 12px 16px; background: white; }
    .perm-item { padding: 4px 6px; border-radius: 6px; }
    .perm-item-label { font-size: 12px; font-weight: 500; color: #1e293b; }

    .modal-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
    .btn-spinner { display: inline-block; margin-right: 6px; }
  `],
})
export class RolesListComponent implements OnInit {
  private readonly authApi = inject(AuthApiService);
  private readonly alertService = inject(AlertService);
  private readonly fb = inject(FormBuilder);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly roles = signal<RoleItem[]>([]);
  readonly showEditor = signal(false);
  readonly isEditing = signal(false);
  readonly selectedRole = signal<RoleItem | null>(null);
  readonly currentRoleName = signal('');
  readonly catalogCategories = signal<PermCatGroup[]>([]);

  roleForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    description: [''],
    maxDiscountPercent: [0, [Validators.min(0), Validators.max(100)]],
  });

  ngOnInit(): void {
    this.loadRoles();
    this.loadCatalog();
  }

  loadRoles(): void {
    this.isLoading.set(true);
    this.authApi.getAllRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.alertService.error('Impossible de charger les rôles.');
      },
    });
  }

  loadCatalog(): void {
    this.authApi.getPermissionsCatalog().subscribe({
      next: (data) => {
        const cats: PermCatGroup[] = data.categories.map((c) => ({
          category: c.category,
          label: c.label,
          permissions: c.permissions.map((p) => ({
            ...p,
            checked: false,
          })),
        }));
        this.catalogCategories.set(cats);
      },
    });
  }

  isSuperAdmin(roleName: string): boolean {
    return roleName === 'SUPER_ADMIN';
  }

  getRoleBadgeClass(roleName: string): string {
    switch (roleName) {
      case 'SUPER_ADMIN': return 'badge-super-admin';
      case 'ADMIN': return 'badge-admin';
      case 'PHARMACIEN': return 'badge-pharmacien';
      case 'CAISSIER': return 'badge-caissier';
      case 'STOCK': return 'badge-stock';
      case 'COMPTABLE': return 'badge-comptable';
      default: return 'badge-custom';
    }
  }

  countChecked(cat: PermCatGroup): number {
    return cat.permissions.filter((p) => p.checked).length;
  }

  toggleCategory(cat: PermCatGroup): void {
    const allChecked = cat.permissions.every((p) => p.checked);
    for (const p of cat.permissions) {
      p.checked = !allChecked;
    }
  }

  openCreateDialog(): void {
    this.isEditing.set(false);
    this.selectedRole.set(null);
    this.currentRoleName.set('');
    this.roleForm.reset({
      name: '',
      description: '',
      maxDiscountPercent: 0,
    });
    // Reset permissions
    for (const cat of this.catalogCategories()) {
      for (const p of cat.permissions) {
        p.checked = false;
      }
    }
    this.showEditor.set(true);
  }

  editRole(role: RoleItem): void {
    this.isEditing.set(true);
    this.selectedRole.set(role);
    this.currentRoleName.set(role.name);
    this.roleForm.patchValue({
      name: role.name,
      description: role.description || '',
      maxDiscountPercent: role.maxDiscountPercent,
    });

    const activeSet = new Set(role.permissionCodes);
    const hasWildcard = activeSet.has('*');

    for (const cat of this.catalogCategories()) {
      for (const p of cat.permissions) {
        p.checked = hasWildcard || activeSet.has(p.code);
      }
    }
    this.showEditor.set(true);
  }

  closeEditor(): void {
    this.showEditor.set(false);
  }

  saveRole(): void {
    if (this.roleForm.invalid) return;

    this.isSaving.set(true);
    const formVal = this.roleForm.value;

    const selectedPerms: string[] = [];
    for (const cat of this.catalogCategories()) {
      for (const p of cat.permissions) {
        if (p.checked) selectedPerms.push(p.code);
      }
    }

    if (this.isEditing() && this.selectedRole()) {
      const updateDto: UpdateRoleDto = {
        name: formVal.name,
        description: formVal.description,
        maxDiscountPercent: formVal.maxDiscountPercent,
        permissionCodes: selectedPerms,
      };

      this.authApi.updateRole(this.selectedRole()!.id, updateDto).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.alertService.success('Rôle mis à jour avec succès.');
          this.closeEditor();
          this.loadRoles();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.alertService.error(err?.error?.message || 'Erreur lors de la mise à jour du rôle.');
        },
      });
    } else {
      const createDto: CreateRoleDto = {
        name: formVal.name,
        description: formVal.description,
        maxDiscountPercent: formVal.maxDiscountPercent,
        permissionCodes: selectedPerms,
      };

      this.authApi.createRole(createDto).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.alertService.success('Nouveau rôle créé avec succès.');
          this.closeEditor();
          this.loadRoles();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.alertService.error(err?.error?.message || 'Erreur lors de la création du rôle.');
        },
      });
    }
  }

  confirmDeleteRole(role: RoleItem): void {
    if (confirm(`Êtes-vous sûr de vouloir supprimer définitivement le rôle "${role.name}" ?`)) {
      this.authApi.deleteRole(role.id).subscribe({
        next: () => {
          this.alertService.success(`Rôle "${role.name}" supprimé.`);
          this.loadRoles();
        },
        error: (err) => {
          this.alertService.error(err?.error?.message || 'Impossible de supprimer ce rôle.');
        },
      });
    }
  }
}

