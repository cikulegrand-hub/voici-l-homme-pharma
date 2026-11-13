import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { AlertService } from '../../core/services/alert.service';
import { ProductCategory } from '@vhp/shared';

@Component({
  selector: 'app-categories-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <h2 mat-dialog-title>Gestion des Catégories & Formes Galéniques</h2>
        <button mat-icon-button mat-dialog-close class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <mat-tab-group>
          <!-- ONGLET 1 : CATÉGORIES -->
          <mat-tab label="Catégories de produits">
            <div class="tab-body">
              <div class="add-section">
                <h3>
                  @if (editingCatId()) {
                    Modifier la catégorie
                  } @else {
                    Nouvelle catégorie
                  }
                </h3>
                <div class="form-row">
                  <mat-form-field appearance="outline" class="flex-1">
                    <mat-label>Nom de la catégorie *</mat-label>
                    <input matInput [(ngModel)]="newCatName" placeholder="Ex: Antibiotiques, Antalgiques..." />
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="flex-2">
                    <mat-label>Description (optionnelle)</mat-label>
                    <input matInput [(ngModel)]="newCatDesc" placeholder="Description médicale ou thérapeutique" />
                  </mat-form-field>

                  <div class="actions-inline">
                    @if (editingCatId()) {
                      <button mat-button (click)="cancelEditCategory()">Annuler</button>
                      <button mat-flat-button color="primary" [disabled]="!newCatName.trim() || isSavingCat()" (click)="saveCategory()">
                        Enregistrer
                      </button>
                    } @else {
                      <button mat-flat-button color="primary" [disabled]="!newCatName.trim() || isSavingCat()" (click)="saveCategory()">
                        <mat-icon>add</mat-icon> Ajouter
                      </button>
                    }
                  </div>
                </div>
              </div>

              @if (isLoadingCats()) {
                <div class="loading-box">
                  <mat-spinner diameter="32"></mat-spinner>
                  <span>Chargement des catégories...</span>
                </div>
              } @else {
                <div class="table-container">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Nom</th>
                        <th>Description</th>
                        <th class="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (cat of categories(); track cat.id) {
                        <tr>
                          <td class="font-medium">{{ cat.name }}</td>
                          <td class="text-muted">{{ cat.description || '—' }}</td>
                          <td class="text-right">
                            <button mat-icon-button color="primary" (click)="editCategory(cat)" title="Modifier">
                              <mat-icon>edit</mat-icon>
                            </button>
                            <button mat-icon-button color="warn" (click)="deleteCategory(cat)" title="Supprimer">
                              <mat-icon>delete</mat-icon>
                            </button>
                          </td>
                        </tr>
                      }
                      @if (categories().length === 0) {
                        <tr>
                          <td colspan="3" class="text-center py-4 text-muted">
                            Aucune catégorie enregistrée.
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </mat-tab>

          <!-- ONGLET 2 : FORMES GALÉNIQUES -->
          <mat-tab label="Formes galéniques">
            <div class="tab-body">
              <div class="add-section">
                <h3>Ajouter une forme galénique</h3>
                <div class="form-row">
                  <mat-form-field appearance="outline" class="flex-2">
                    <mat-label>Nom de la forme galénique *</mat-label>
                    <input matInput [(ngModel)]="newFormName" placeholder="Ex: Gélule, Sirop, Solution buvable..." />
                  </mat-form-field>

                  <div class="actions-inline">
                    <button mat-flat-button color="primary" [disabled]="!newFormName.trim() || isSavingForm()" (click)="saveGalenicForm()">
                      <mat-icon>add</mat-icon> Ajouter
                    </button>
                  </div>
                </div>
              </div>

              @if (isLoadingForms()) {
                <div class="loading-box">
                  <mat-spinner diameter="32"></mat-spinner>
                  <span>Chargement des formes galéniques...</span>
                </div>
              } @else {
                <div class="forms-chips-grid">
                  @for (form of galenicForms(); track form) {
                    <div class="form-chip">
                      <mat-icon class="chip-icon">medication</mat-icon>
                      <span class="chip-label">{{ form }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>Fermer</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        padding: 8px 16px;
        min-width: 320px; width: 100%;
        max-width: 750px;
      }
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .dialog-header h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #1e293b;
      }
      .tab-body {
        padding-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .add-section {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 12px 16px;
      }
      .add-section h3 {
        margin: 0 0 10px 0;
        font-size: 0.95rem;
        font-weight: 600;
        color: #334155;
      }
      .form-row {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .flex-1 {
        flex: 1;
      }
      .flex-2 {
        flex: 2;
      }
      .actions-inline {
        display: flex;
        gap: 8px;
        margin-bottom: 22px;
      }
      .loading-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 24px;
        color: #64748b;
      }
      .table-container {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
        max-height: 280px;
        overflow-y: auto;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .data-table {
        width: 100%;
        min-width: 440px;
        border-collapse: collapse;
        text-align: left;
        font-size: 0.9rem;
      }
      .data-table th {
        background-color: #f1f5f9;
        padding: 10px 14px;
        font-weight: 600;
        color: #475569;
        border-bottom: 1px solid #e2e8f0;
      }
      .data-table td {
        padding: 10px 14px;
        border-bottom: 1px solid #f1f5f9;
      }
      .text-right {
        text-align: right;
      }
      .text-center {
        text-align: center;
      }
      .text-muted {
        color: #64748b;
      }
      .font-medium {
        font-weight: 500;
      }
      .forms-chips-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 10px;
        max-height: 280px;
        overflow-y: auto;
        padding: 4px;
      }
      .form-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        background-color: #f1f5f9;
        border: 1px solid #cbd5e1;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 0.85rem;
        color: #1e293b;
      }
      .chip-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: #0284c7;
      }
      @media (max-width: 600px) {
        .form-row {
          flex-direction: column;
          align-items: stretch;
        }
        .actions-inline {
          width: 100%;
          margin-bottom: 8px;
        }
        .actions-inline button {
          width: 100%;
        }
      }
    `,
  ],
})
export class CategoriesDialogComponent implements OnInit {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly alertService = inject(AlertService);
  private readonly dialogRef = inject(MatDialogRef<CategoriesDialogComponent>);

  categories = signal<ProductCategory[]>([]);
  galenicForms = signal<string[]>([]);
  isLoadingCats = signal<boolean>(false);
  isLoadingForms = signal<boolean>(false);
  isSavingCat = signal<boolean>(false);
  isSavingForm = signal<boolean>(false);

  editingCatId = signal<string | null>(null);
  newCatName = '';
  newCatDesc = '';
  newFormName = '';

  ngOnInit() {
    this.loadCategories();
    this.loadGalenicForms();
  }

  loadCategories() {
    this.isLoadingCats.set(true);
    this.catalogApi.getCategories().subscribe({
      next: (cats) => {
        this.categories.set(cats);
        this.isLoadingCats.set(false);
      },
      error: (err) => {
        this.isLoadingCats.set(false);
        this.alertService.error('Erreur lors du chargement des catégories: ' + (err.message || ''));
      },
    });
  }

  loadGalenicForms() {
    this.isLoadingForms.set(true);
    this.catalogApi.getGalenicForms().subscribe({
      next: (forms) => {
        this.galenicForms.set(forms);
        this.isLoadingForms.set(false);
      },
      error: (err) => {
        this.isLoadingForms.set(false);
        this.alertService.error('Erreur lors du chargement des formes galéniques: ' + (err.message || ''));
      },
    });
  }

  editCategory(cat: ProductCategory) {
    this.editingCatId.set(cat.id);
    this.newCatName = cat.name;
    this.newCatDesc = cat.description || '';
  }

  cancelEditCategory() {
    this.editingCatId.set(null);
    this.newCatName = '';
    this.newCatDesc = '';
  }

  saveCategory() {
    if (!this.newCatName.trim()) return;

    this.isSavingCat.set(true);
    const id = this.editingCatId();

    if (id) {
      this.catalogApi.updateCategory(id, { name: this.newCatName.trim(), description: this.newCatDesc.trim() }).subscribe({
        next: () => {
          this.isSavingCat.set(false);
          this.alertService.success('Catégorie mise à jour avec succès.');
          this.cancelEditCategory();
          this.loadCategories();
        },
        error: (err) => {
          this.isSavingCat.set(false);
          this.alertService.error(err.error?.message || 'Erreur lors de la mise à jour de la catégorie.');
        },
      });
    } else {
      this.catalogApi.createCategory({ name: this.newCatName.trim(), description: this.newCatDesc.trim() }).subscribe({
        next: () => {
          this.isSavingCat.set(false);
          this.alertService.success('Catégorie créée avec succès.');
          this.cancelEditCategory();
          this.loadCategories();
        },
        error: (err) => {
          this.isSavingCat.set(false);
          this.alertService.error(err.error?.message || 'Erreur lors de la création de la catégorie.');
        },
      });
    }
  }

  deleteCategory(cat: ProductCategory) {
    if (!confirm(`Confirmez-vous la suppression de la catégorie "${cat.name}" ?`)) return;

    this.catalogApi.deleteCategory(cat.id).subscribe({
      next: () => {
        this.alertService.success('Catégorie supprimée avec succès.');
        this.loadCategories();
      },
      error: (err) => {
        this.alertService.error(err.error?.message || 'Impossible de supprimer cette catégorie.');
      },
    });
  }

  saveGalenicForm() {
    if (!this.newFormName.trim()) return;

    this.isSavingForm.set(true);
    this.catalogApi.createGalenicForm({ name: this.newFormName.trim() }).subscribe({
      next: (forms) => {
        this.isSavingForm.set(false);
        this.galenicForms.set(forms);
        this.newFormName = '';
        this.alertService.success('Forme galénique ajoutée avec succès.');
      },
      error: (err) => {
        this.isSavingForm.set(false);
        this.alertService.error(err.error?.message || 'Erreur lors de l’ajout de la forme galénique.');
      },
    });
  }
}

