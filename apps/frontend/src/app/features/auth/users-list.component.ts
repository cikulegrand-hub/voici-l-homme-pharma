import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';

import { AuthApiService } from '../../core/api/services/auth-api.service';
import { AlertService } from '../../core/services/alert.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ResetPasswordDialogComponent } from './reset-password-dialog.component';
import { I18N_FR } from '../../core/i18n/translations.fr';
import { UserProfile, RoleName } from '@vhp/shared';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatMenuModule,
  ],
  template: `
    <div class="users-page">
      <mat-card class="page-header-card">
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <mat-icon class="title-icon">manage_accounts</mat-icon>
              {{ i18n.users.title }}
            </h1>
            <p class="page-subtitle">{{ i18n.users.subtitle }}</p>
          </div>
          <button mat-flat-button color="primary" (click)="navigateToCreate()">
            <mat-icon>person_add</mat-icon>
            {{ i18n.users.newUser }}
          </button>
        </div>
      </mat-card>

      <!-- Filtres -->
      <mat-card class="filters-card">
        <div class="filters-row">
          <mat-form-field appearance="outline" class="filter-field search-field">
            <mat-label>{{ i18n.actions.search }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)" placeholder="Rechercher par nom ou identifiant..." />
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>{{ i18n.users.role }}</mat-label>
            <mat-select [ngModel]="roleFilter()" (ngModelChange)="roleFilter.set($event)">
              <mat-option value="">{{ i18n.users.allRoles }}</mat-option>
              @for (role of availableRoles; track role) {
                <mat-option [value]="role">{{ getRoleName(role) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>{{ i18n.users.status }}</mat-label>
            <mat-select [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
              <mat-option value="">{{ i18n.users.allStatuses }}</mat-option>
              <mat-option value="active">{{ i18n.users.active }}</mat-option>
              <mat-option value="inactive">{{ i18n.users.inactive }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </mat-card>

      <!-- Tableau -->
      <mat-card class="table-card">
        <div *ngIf="isLoading()" class="loading-center">
          <mat-spinner diameter="40"></mat-spinner>
          <span>{{ i18n.table.loading }}</span>
        </div>

        <div *ngIf="!isLoading() && filteredUsers().length === 0" class="empty-state">
          <mat-icon class="empty-icon">person_search</mat-icon>
          <p>{{ i18n.table.empty }}</p>
        </div>

        <table mat-table [dataSource]="filteredUsers()" *ngIf="!isLoading() && filteredUsers().length > 0" class="users-table">
          <!-- Colonne Identifiant -->
          <ng-container matColumnDef="username">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.users.username }}</th>
            <td mat-cell *matCellDef="let user">
              <span class="username-cell">{{ user.username }}</span>
            </td>
          </ng-container>

          <!-- Colonne Nom complet -->
          <ng-container matColumnDef="fullName">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.users.fullName }}</th>
            <td mat-cell *matCellDef="let user">{{ user.fullName }}</td>
          </ng-container>

          <!-- Colonne Email -->
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.users.email }}</th>
            <td mat-cell *matCellDef="let user">{{ user.email || '—' }}</td>
          </ng-container>

          <!-- Colonne Rôle -->
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.users.role }}</th>
            <td mat-cell *matCellDef="let user">
              <span class="role-badge" [class]="'role-' + user.role.toLowerCase()">
                {{ getRoleName(user.role) }}
              </span>
            </td>
          </ng-container>

          <!-- Colonne Statut -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.users.status }}</th>
            <td mat-cell *matCellDef="let user">
              <span class="status-badge" [class.active]="user.isActive" [class.inactive]="!user.isActive">
                <mat-icon class="status-icon">{{ user.isActive ? 'check_circle' : 'cancel' }}</mat-icon>
                {{ user.isActive ? i18n.users.active : i18n.users.inactive }}
              </span>
            </td>
          </ng-container>

          <!-- Colonne Actions -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.users.actions }}</th>
            <td mat-cell *matCellDef="let user">
              <button mat-icon-button [matMenuTriggerFor]="actionMenu" [matTooltip]="'Actions'">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #actionMenu="matMenu">
                <button mat-menu-item (click)="navigateToEdit(user.id)">
                  <mat-icon>edit</mat-icon>
                  <span>{{ i18n.actions.edit }}</span>
                </button>
                <button mat-menu-item (click)="openResetPasswordDialog(user)">
                  <mat-icon>lock_reset</mat-icon>
                  <span>{{ i18n.users.resetPassword }}</span>
                </button>
                <button mat-menu-item *ngIf="user.isActive && user.username !== 'admin'" (click)="confirmDeactivate(user)">
                  <mat-icon color="warn">person_off</mat-icon>
                  <span>{{ i18n.users.deactivate }}</span>
                </button>
                <button mat-menu-item *ngIf="!user.isActive" (click)="activateUser(user)">
                  <mat-icon class="success-icon">person</mat-icon>
                  <span>{{ i18n.users.activate }}</span>
                </button>
              </mat-menu>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>
      </mat-card>
    </div>
  `,
  styles: [`
    .users-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .page-header-card { margin-bottom: 16px; padding: 20px 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
    .page-title { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 700; color: #1e3a2f; margin: 0; }
    .title-icon { color: #0f9d58; }
    .page-subtitle { color: #5f6368; font-size: 13px; margin: 4px 0 0; }
    .filters-card { margin-bottom: 16px; padding: 16px 24px 0; }
    .filters-row { display: flex; gap: 16px; flex-wrap: wrap; }
    .filter-field { flex: 0 0 auto; }
    .search-field { flex: 1 1 250px; min-width: 200px; }
    .table-card {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .users-table {
      width: 100%;
      min-width: 600px;
    }
    .username-cell { font-family: monospace; font-weight: 600; color: #1e3a2f; }
    .role-badge {
      display: inline-block; padding: 4px 10px; border-radius: 12px;
      font-size: 12px; font-weight: 600; text-transform: uppercase;
    }
    .role-admin { background: #e8f0fe; color: #1a73e8; }
    .role-pharmacien { background: #e6f4ea; color: #137333; }
    .role-caissier { background: #fef7e0; color: #b06000; }
    .role-stock { background: #fce8e6; color: #c5221f; }
    .role-comptable { background: #f3e8fd; color: #7627bb; }
    .status-badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 12px;
    }
    .status-badge.active { background: #e6f4ea; color: #137333; }
    .status-badge.inactive { background: #fce8e6; color: #c5221f; }
    .status-icon { font-size: 16px; width: 16px; height: 16px; }
    .loading-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px; color: #5f6368; }
    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px; color: #9aa0a6; }
    .empty-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 8px; }
    .success-icon { color: #0f9d58; }

    @media (max-width: 900px) {
      .users-page { padding: 16px; }
      .filters-row { flex-direction: column; }
      .filter-field { flex: 1 1 100%; }
    }

    @media (max-width: 600px) {
      .users-page { padding: 8px 4px; }
      .page-header { flex-direction: column; align-items: stretch; }
      .page-header button { width: 100%; }
    }
  `],
})
export class UsersListComponent implements OnInit {
  private readonly authApi = inject(AuthApiService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly i18n = I18N_FR;
  readonly isLoading = signal(true);
  readonly allUsers = signal<UserProfile[]>([]);
  readonly displayedColumns = ['username', 'fullName', 'email', 'role', 'status', 'actions'];
  readonly availableRoles: RoleName[] = ['ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE'];

  readonly searchTerm = signal('');
  readonly roleFilter = signal('');
  readonly statusFilter = signal('');

  readonly filteredUsers = computed(() => {
    let result = this.allUsers();
    const term = this.searchTerm().toLowerCase().trim();
    if (term) {
      result = result.filter(
        (u) => u.username.toLowerCase().includes(term) || u.fullName.toLowerCase().includes(term),
      );
    }
    const role = this.roleFilter();
    if (role) {
      result = result.filter((u) => u.role === role);
    }
    const status = this.statusFilter();
    if (status === 'active') {
      result = result.filter((u) => u.isActive);
    } else if (status === 'inactive') {
      result = result.filter((u) => !u.isActive);
    }
    return result;
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading.set(true);
    this.authApi.getAllUsers().subscribe({
      next: (users) => {
        this.allUsers.set(users);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.alertService.error('Impossible de charger la liste des utilisateurs.');
      },
    });
  }

  applyFilters(): void {
    // Les filtres sont automatiquement réactifs via les signaux
  }

  getRoleName(role: string): string {
    return (this.i18n.roles as Record<string, string>)[role] || role;
  }

  navigateToCreate(): void {
    this.router.navigate(['/users/new']);
  }

  navigateToEdit(userId: string): void {
    this.router.navigate(['/users', userId, 'edit']);
  }

  openResetPasswordDialog(user: UserProfile): void {
    const dialogRef = this.dialog.open(ResetPasswordDialogComponent, {
      width: '440px',
      data: { userId: user.id, username: user.username, fullName: user.fullName },
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.alertService.success(`Mot de passe de ${user.fullName} réinitialisé avec succès.`);
      }
    });
  }

  confirmDeactivate(user: UserProfile): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: this.i18n.users.confirmDeactivateTitle,
        message: `${this.i18n.users.confirmDeactivateMessage}\n\nUtilisateur : ${user.fullName} (${user.username})`,
        confirmLabel: this.i18n.users.deactivate,
        confirmColor: 'warn',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.authApi.deactivateUser(user.username).subscribe({
          next: () => {
            this.alertService.success(`${user.fullName} a été désactivé.`);
            this.loadUsers();
          },
          error: (err) => {
            this.alertService.error(err?.error?.message || 'Erreur lors de la désactivation.');
          },
        });
      }
    });
  }

  activateUser(user: UserProfile): void {
    this.authApi.activateUser(user.username).subscribe({
      next: () => {
        this.alertService.success(`${user.fullName} a été réactivé.`);
        this.loadUsers();
      },
      error: (err) => {
        this.alertService.error(err?.error?.message || 'Erreur lors de la réactivation.');
      },
    });
  }
}

