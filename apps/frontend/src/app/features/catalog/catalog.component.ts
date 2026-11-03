import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/services/alert.service';
import { CategoriesDialogComponent } from './categories-dialog.component';
import { PriceHistoryDialogComponent } from './price-history-dialog.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { Product, ProductCategory, PaginatedResult } from '@vhp/shared';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="feature-page">
      <!-- EN-TÊTE DU CATALOGUE -->
      <header class="page-header">
        <div>
          <h2>Catalogue des médicaments et produits</h2>
          <p class="subtitle">
            Référentiel officiel de l'officine : DCI, dosages, formes galéniques, seuils et traçabilité réglementaire.
          </p>
        </div>

        <div class="header-actions">
          <button mat-stroked-button (click)="openCategoriesDialog()">
            <mat-icon>category</mat-icon> Catégories & Formes
          </button>

          <button mat-stroked-button (click)="exportCsv()" [disabled]="isExporting()">
            <mat-icon>download</mat-icon> {{ isExporting() ? 'Exportation...' : 'Exporter les données' }}
          </button>

          <button mat-stroked-button routerLink="/settings/import">
            <mat-icon>upload_file</mat-icon> Importer
          </button>

          @if (canCreateProduct()) {
            <button mat-flat-button color="primary" routerLink="/catalog/new">
              <mat-icon>add</mat-icon> Nouveau Produit
            </button>
          }
        </div>
      </header>

      <!-- BARRE DE RECHERCHE ET FILTRES -->
      <mat-card class="filter-card">
        <div class="filter-grid">
          <!-- Recherche instantanée avec debounce 250ms (CAT-05, PERF-01) -->
          <mat-form-field appearance="outline" class="search-input">
            <mat-label>Recherche instantanée (Nom, DCI, Code-barres)...</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              [(ngModel)]="searchQuery"
              (ngModelChange)="onSearchChange($event)"
              placeholder="Ex: Doliprane, Paracétamol, 358291..."
            />
            @if (searchQuery) {
              <button mat-icon-button matSuffix (click)="clearSearch()">
                <mat-icon>close</mat-icon>
              </button>
            }
          </mat-form-field>

          <!-- Filtre Catégorie -->
          <mat-form-field appearance="outline" class="filter-select">
            <mat-label>Catégorie</mat-label>
            <mat-select [(ngModel)]="selectedCategory" (selectionChange)="onFilterChange()">
              <mat-option value="">Toutes les catégories</mat-option>
              @for (cat of categories(); track cat.id) {
                <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <!-- Filtre Statut Réglementaire -->
          <mat-form-field appearance="outline" class="filter-select">
            <mat-label>Statut réglementaire</mat-label>
            <mat-select [(ngModel)]="selectedRegulatory" (selectionChange)="onFilterChange()">
              <mat-option value="ALL">Tous les statuts</mat-option>
              <mat-option value="RX">Sur ordonnance (Rx)</mat-option>
              <mat-option value="CONTROLLED">Produit contrôlé / Stup</mat-option>
              <mat-option value="COLD">Chaîne du froid (2-8°C)</mat-option>
            </mat-select>
          </mat-form-field>

          <!-- Filtre Actif / Inactif -->
          <mat-form-field appearance="outline" class="filter-select">
            <mat-label>État d'activité</mat-label>
            <mat-select [(ngModel)]="selectedActiveState" (selectionChange)="onFilterChange()">
              <mat-option value="ACTIVE">Actifs uniquement</mat-option>
              <mat-option value="INACTIVE">Désactivés uniquement</mat-option>
              <mat-option value="ALL">Tous les produits</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </mat-card>

      <!-- TABLEAU DES PRODUITS DU CATALOGUE -->
      <mat-card class="table-card">
        @if (isLoading()) {
          <div class="loading-state">
            <mat-spinner diameter="40"></mat-spinner>
            <span>Recherche des produits en cours...</span>
          </div>
        } @else if (products().length === 0) {
          <div class="empty-state">
            <mat-icon class="empty-icon">medication_liquid</mat-icon>
            <h3>Aucun médicament ne correspond aux critères</h3>
            <p class="text-muted">
              Essayez de modifier votre terme de recherche ou vos filtres.
            </p>
            @if (canCreateProduct()) {
              <button mat-flat-button color="primary" routerLink="/catalog/new" class="mt-3">
                <mat-icon>add</mat-icon> Ajouter un médicament
              </button>
            }
          </div>
        } @else {
          <div class="table-responsive">
            <table class="products-table">
              <thead>
                <tr>
                  <th (click)="changeSort('name')" class="sortable-th">
                    Produit & DCI
                    <mat-icon class="sort-icon">{{ getSortIcon('name') }}</mat-icon>
                  </th>
                  <th>Forme / Dosage</th>
                  <th>Unité</th>
                  <th (click)="changeSort('selling_price_cdf')" class="sortable-th text-right">
                    Prix Vente
                    <mat-icon class="sort-icon">{{ getSortIcon('selling_price_cdf') }}</mat-icon>
                  </th>
                  <th class="text-center">Stock Dispo</th>
                  <th>Statut Réglementaire</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (prod of products(); track prod.id) {
                  <tr [class.inactive-row]="!prod.isActive">
                    <td>
                      <div class="prod-identity">
                        <div class="prod-name font-medium">
                          {{ prod.name }}
                          @if (!prod.isActive) {
                            <span class="badge badge-inactive">Désactivé</span>
                          }
                        </div>
                        <div class="prod-dci text-xs text-muted">
                          DCI : <strong>{{ prod.dci }}</strong>
                          @if (prod.laboratory) {
                            <span class="lab-tag">| {{ prod.laboratory }}</span>
                          }
                        </div>
                        @if (prod.barcodes && prod.barcodes.length > 0) {
                          <div class="barcode-tag text-xs">
                            <mat-icon class="mini-icon">qr_code</mat-icon> {{ prod.barcodes[0] }}
                          </div>
                        }
                      </div>
                    </td>

                    <td>
                      <div class="font-medium">{{ prod.galenicForm || '—' }}</div>
                      <div class="text-xs text-muted">{{ prod.dosage || '' }}</div>
                    </td>

                    <td>
                      <span class="unit-badge">{{ prod.sellingUnit }}</span>
                    </td>

                    <td class="text-right">
                      <div class="price-cdf font-bold">
                        {{ prod.sellingPriceCdf | number:'1.0-2' }} CDF
                      </div>
                      <div class="price-usd text-xs text-muted">
                        {{ prod.sellingPriceUsd | number:'1.2-2' }} USD
                      </div>
                    </td>

                    <td class="text-center">
                      <div class="stock-cell">
                        @if (prod.totalStock <= 0) {
                          <span class="badge badge-out-stock" matTooltip="Rupture de stock">0 (Rupture)</span>
                        } @else if (prod.totalStock <= prod.minAlertThreshold) {
                          <span class="badge badge-low-stock" matTooltip="Seuil minimal d'alerte atteint">
                            {{ prod.totalStock }} (Stock bas)
                          </span>
                        } @else {
                          <span class="badge badge-in-stock">{{ prod.totalStock }}</span>
                        }
                        <div class="seuil-label text-xs text-muted">Seuil: {{ prod.minAlertThreshold }}</div>
                      </div>
                    </td>

                    <td>
                      <div class="regulatory-badges-cell">
                        @if (prod.requiresPrescription) {
                          <span class="badge badge-rx" matTooltip="Prescription médicale obligatoire">Rx</span>
                        }
                        @if (prod.isControlledSubstance) {
                          <span class="badge badge-ctrl" matTooltip="Produit stupéfiant / contrôlé">Stup</span>
                        }
                        @if (prod.isColdChain) {
                          <span class="badge badge-cold" matTooltip="Chaîne du froid 2-8°C">❄️ Froid</span>
                        }
                        @if (!prod.requiresPrescription && !prod.isControlledSubstance && !prod.isColdChain) {
                          <span class="badge badge-otc">Conseil / Libre</span>
                        }
                      </div>
                    </td>

                    <td class="text-right actions-cell">
                      <button
                        mat-icon-button
                        [routerLink]="['/catalog', prod.id, 'edit']"
                        color="primary"
                        matTooltip="Consulter / Modifier la fiche"
                      >
                        <mat-icon>edit</mat-icon>
                      </button>

                      <button
                        mat-icon-button
                        (click)="openPriceHistory(prod)"
                        matTooltip="Historique des prix"
                      >
                        <mat-icon>history</mat-icon>
                      </button>

                      @if (prod.isActive) {
                        <button
                          mat-icon-button
                          color="warn"
                          (click)="confirmDeactivate(prod)"
                        matTooltip="Désactiver le produit"
                        >
                          <mat-icon>block</mat-icon>
                        </button>
                      } @else {
                        <button
                          mat-icon-button
                          (click)="confirmActivate(prod)"
                          class="reactivate-btn"
                          matTooltip="Réactiver le produit"
                        >
                          <mat-icon>check_circle</mat-icon>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- PAGINATION SERVEUR -->
          <div class="pagination-footer">
            <div class="pagination-info text-muted text-sm">
              Affichage de <strong>{{ getFromItem() }}</strong> à <strong>{{ getToItem() }}</strong> sur <strong>{{ totalProducts() }}</strong> références
            </div>

            <div class="pagination-controls">
              <button
                mat-icon-button
                [disabled]="currentPage() <= 1 || isLoading()"
                (click)="goToPage(currentPage() - 1)"
                title="Page précédente"
              >
                <mat-icon>chevron_left</mat-icon>
              </button>

              <span class="page-indicator">
                Page {{ currentPage() }} sur {{ totalPages() }}
              </span>

              <button
                mat-icon-button
                [disabled]="currentPage() >= totalPages() || isLoading()"
                (click)="goToPage(currentPage() + 1)"
                title="Page suivante"
              >
                <mat-icon>chevron_right</mat-icon>
              </button>
            </div>
          </div>
        }
      </mat-card>
    </div>
  `,
  styles: [
    `
      .feature-page {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 8px 16px;
        font-family: var(--vhp-font, inherit);
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
      }
      .page-header h2 {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 700;
        color: #0f172a;
      }
      .subtitle {
        margin: 2px 0 0 0;
        font-size: 0.85rem;
        color: #64748b;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .filter-card {
        padding: 14px 16px 2px 16px;
        border-radius: 8px;
      }
      .filter-grid {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr;
        gap: 16px;
      }
      @media (max-width: 960px) {
        .filter-grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      @media (max-width: 600px) {
        .filter-grid {
          grid-template-columns: 1fr;
        }
      }
      .table-card {
        padding: 0;
        border-radius: 8px;
        overflow: hidden;
      }
      .table-responsive {
        width: 100%;
        overflow-x: auto;
      }
      .products-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: 0.875rem;
      }
      .products-table th {
        background-color: #f8fafc;
        padding: 12px 16px;
        font-weight: 600;
        color: #475569;
        border-bottom: 1px solid #e2e8f0;
      }
      .sortable-th {
        cursor: pointer;
        user-select: none;
      }
      .sort-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        vertical-align: middle;
        margin-left: 4px;
        color: #94a3b8;
      }
      .products-table td {
        padding: 12px 16px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
      }
      .products-table tr:hover {
        background-color: #f8fafc;
      }
      .inactive-row {
        opacity: 0.65;
        background-color: #fafafa;
      }
      .prod-identity {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .prod-name {
        font-size: 0.95rem;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .lab-tag {
        color: #94a3b8;
      }
      .barcode-tag {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        color: #0284c7;
        font-family: monospace;
      }
      .mini-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      .unit-badge {
        background-color: #f1f5f9;
        color: #475569;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
      }
      .price-cdf {
        color: #0369a1;
        font-size: 0.95rem;
      }
      .stock-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .regulatory-badges-cell {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .badge {
        font-size: 0.7rem;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .badge-rx {
        background-color: #f3e8ff;
        color: #7e22ce;
      }
      .badge-ctrl {
        background-color: #ffe4e6;
        color: #be123c;
      }
      .badge-cold {
        background-color: #e0f2fe;
        color: #0369a1;
      }
      .badge-otc {
        background-color: #f1f5f9;
        color: #64748b;
      }
      .badge-in-stock {
        background-color: #dcfce7;
        color: #15803d;
      }
      .badge-low-stock {
        background-color: #fef3c7;
        color: #b45309;
      }
      .badge-out-stock {
        background-color: #fee2e2;
        color: #b91c1c;
      }
      .badge-inactive {
        background-color: #f1f5f9;
        color: #64748b;
        font-size: 0.65rem;
        padding: 1px 5px;
      }
      .reactivate-btn {
        color: #16a34a;
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
      .text-xs {
        font-size: 0.75rem;
      }
      .text-sm {
        font-size: 0.85rem;
      }
      .font-medium {
        font-weight: 500;
      }
      .font-bold {
        font-weight: 700;
      }
      .actions-cell {
        white-space: nowrap;
      }
      .pagination-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background-color: #f8fafc;
        border-top: 1px solid #e2e8f0;
      }
      .pagination-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .page-indicator {
        font-size: 0.875rem;
        color: #334155;
      }
      .loading-state,
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 16px;
        gap: 12px;
      }
      .empty-icon {
        font-size: 54px;
        width: 54px;
        height: 54px;
        color: #94a3b8;
      }
      .mt-3 {
        margin-top: 12px;
      }
    `,
  ],
})
export class CatalogComponent implements OnInit {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly dialog = inject(MatDialog);

  products = signal<Product[]>([]);
  categories = signal<ProductCategory[]>([]);
  totalProducts = signal<number>(0);
  currentPage = signal<number>(1);
  totalPages = signal<number>(1);
  pageSize = 20;

  isLoading = signal<boolean>(false);
  isExporting = signal<boolean>(false);

  searchQuery = '';
  selectedCategory = '';
  selectedRegulatory = 'ALL';
  selectedActiveState = 'ACTIVE';
  sortBy = 'name';
  sortOrder: 'asc' | 'desc' = 'asc';

  private readonly searchSubject = new Subject<string>();

  ngOnInit() {
    this.loadCategories();
    this.loadProducts();

    this.searchSubject
      .pipe(
        debounceTime(250), // PERF-01 : instantanéité ~250ms
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.currentPage.set(1);
        this.loadProducts();
      });
  }

  canCreateProduct(): boolean {
    return this.authService.hasPermission('catalogue.creer') || this.authService.hasPermission('catalogue.modifier');
  }

  loadCategories() {
    this.catalogApi.getCategories().subscribe({
      next: (cats) => this.categories.set(cats),
    });
  }

  loadProducts() {
    this.isLoading.set(true);

    let isActive: boolean | undefined = true;
    if (this.selectedActiveState === 'INACTIVE') isActive = false;
    else if (this.selectedActiveState === 'ALL') isActive = undefined;

    let requiresPrescription: boolean | undefined = undefined;
    let isControlled: boolean | undefined = undefined;
    let isColdChain: boolean | undefined = undefined;

    if (this.selectedRegulatory === 'RX') requiresPrescription = true;
    else if (this.selectedRegulatory === 'CONTROLLED') isControlled = true;
    else if (this.selectedRegulatory === 'COLD') isColdChain = true;

    this.catalogApi
      .getProducts({
        q: this.searchQuery.trim() || undefined,
        categoryId: this.selectedCategory || undefined,
        isActive,
        requiresPrescription,
        isControlledSubstance: isControlled,
        isColdChain,
        page: this.currentPage(),
        limit: this.pageSize,
        sortBy: this.sortBy,
        sortOrder: this.sortOrder,
      })
      .subscribe({
        next: (res) => {
          this.products.set(res.data);
          this.totalProducts.set(res.total);
          this.totalPages.set(res.totalPages);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.alertService.error(err.error?.message || 'Erreur lors du chargement des produits.');
        },
      });
  }

  onSearchChange(val: string) {
    this.searchSubject.next(val);
  }

  clearSearch() {
    this.searchQuery = '';
    this.currentPage.set(1);
    this.loadProducts();
  }

  onFilterChange() {
    this.currentPage.set(1);
    this.loadProducts();
  }

  changeSort(field: string) {
    if (this.sortBy === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortOrder = 'asc';
    }
    this.loadProducts();
  }

  getSortIcon(field: string): string {
    if (this.sortBy !== field) return 'unfold_more';
    return this.sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadProducts();
  }

  getFromItem(): number {
    if (this.totalProducts() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize + 1;
  }

  getToItem(): number {
    return Math.min(this.currentPage() * this.pageSize, this.totalProducts());
  }

  openCategoriesDialog() {
    const ref = this.dialog.open(CategoriesDialogComponent, { width: '750px' });
    ref.afterClosed().subscribe(() => {
      this.loadCategories();
      this.loadProducts();
    });
  }

  openPriceHistory(product: Product) {
    this.dialog.open(PriceHistoryDialogComponent, {
      data: { product },
      width: '750px',
    });
  }

  confirmDeactivate(product: Product) {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Désactiver ce produit ?',
        message: `Le produit "${product.name}" ne sera plus sélectionnable en vente au comptoir ni dans les réceptions. Son historique est conservé.`,
        confirmText: 'Désactiver',
        cancelText: 'Annuler',
        color: 'warn',
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.catalogApi.deactivateProduct(product.id).subscribe({
          next: () => {
            this.alertService.success(`Le produit "${product.name}" a été désactivé sans perte d’historique.`);
            this.loadProducts();
          },
          error: (err) => {
            this.alertService.error(err.error?.message || 'Erreur lors de la désactivation du produit.');
          },
        });
      }
    });
  }

  confirmActivate(product: Product) {
    this.catalogApi.activateProduct(product.id).subscribe({
      next: () => {
        this.alertService.success(`Le produit "${product.name}" a été réactivé avec succès.`);
        this.loadProducts();
      },
      error: (err) => {
        this.alertService.error(err.error?.message || 'Erreur lors de la réactivation du produit.');
      },
    });
  }

  exportCsv() {
    this.isExporting.set(true);
    this.catalogApi.exportCsv().subscribe({
      next: (csvText) => {
        this.isExporting.set(false);
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `catalogue_produits_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.alertService.success('Catalogue exporté avec succès.');
      },
      error: () => {
        this.isExporting.set(false);
        this.alertService.error('Erreur lors du téléchargement du catalogue.');
      },
    });
  }
}
