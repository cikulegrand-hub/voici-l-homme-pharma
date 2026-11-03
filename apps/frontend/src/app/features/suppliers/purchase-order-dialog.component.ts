import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { SuppliersApiService } from '../../core/api/services/suppliers-api.service';
import { AlertService } from '../../core/services/alert.service';
import { ProductAutocompleteComponent } from '../../shared/components/product-autocomplete/product-autocomplete.component';
import { Supplier, ProductAutocompleteItem } from '@vhp/shared';

interface OrderLineForm {
  productId: string;
  productName: string;
  dosage?: string;
  orderedQuantity: number;
  unitPriceCdf: number;
  unitPriceUsd: number;
}

@Component({
  selector: 'app-purchase-order-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTableModule,
    ProductAutocompleteComponent,
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <h2 mat-dialog-title>Nouveau bon de commande fournisseur</h2>
        <button mat-icon-button mat-dialog-close class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content class="dialog-content">
        <!-- Informations Générales -->
        <div class="order-meta-grid">
          <mat-form-field appearance="outline" class="flex-2">
            <mat-label>Fournisseur *</mat-label>
            <mat-select [(ngModel)]="selectedSupplierId" required>
              @for (s of suppliers(); track s.id) {
                <mat-option [value]="s.id">{{ s.name }} (délai: {{ s.leadTimeDays }}j)</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="flex-1">
            <mat-label>Date de livraison souhaitée</mat-label>
            <input matInput type="date" [(ngModel)]="expectedDeliveryDate" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Notes / Référence interne</mat-label>
            <input matInput [(ngModel)]="notes" placeholder="Ex: Réapprovisionnement urgent antibiotiques" />
          </mat-form-field>
        </div>

        <!-- Ajout de produit par scan ou recherche -->
        <div class="product-picker-card">
          <div class="picker-title">
            <mat-icon>add_shopping_cart</mat-icon>
            <span>Ajouter des produits à la commande</span>
          </div>
          <app-product-autocomplete
            placeholder="Rechercher un produit à commander (Nom, DCI, Code-barres)..."
            (productSelected)="onProductSelected($event)"
          ></app-product-autocomplete>
        </div>

        <!-- Tableau des lignes de commande -->
        <div class="table-container">
          <table class="order-table">
            <thead>
              <tr>
                <th style="width: 40%">Produit</th>
                <th style="width: 15%">Quantité</th>
                <th style="width: 20%">Prix Unitaire (CDF)</th>
                <th style="width: 20%">Total (CDF)</th>
                <th style="width: 5%"></th>
              </tr>
            </thead>
            <tbody>
              @if (lines().length === 0) {
                <tr>
                  <td colspan="5" class="empty-lines">
                    <mat-icon>inbox</mat-icon>
                    <span>Aucun produit sélectionné. Utilisez la recherche ci-dessus pour ajouter des articles.</span>
                  </td>
                </tr>
              } @else {
                @for (line of lines(); track line.productId; let i = $index) {
                  <tr>
                    <td>
                      <div class="prod-info">
                        <span class="prod-name">{{ line.productName }}</span>
                        @if (line.dosage) {
                          <span class="prod-dosage">{{ line.dosage }}</span>
                        }
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        class="table-input"
                        [(ngModel)]="line.orderedQuantity"
                        (ngModelChange)="onLineUpdated()"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        class="table-input"
                        [(ngModel)]="line.unitPriceCdf"
                        (ngModelChange)="onLineUpdated()"
                      />
                    </td>
                    <td class="total-col">
                      {{ (line.orderedQuantity * line.unitPriceCdf) | number:'1.0-0' }} CDF
                    </td>
                    <td>
                      <button mat-icon-button color="warn" (click)="removeLine(i)">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Total de la commande -->
        <div class="order-totals">
          <div class="total-box">
            <span class="total-label">Total estimé :</span>
            <span class="total-cdf">{{ totalCdf() | number:'1.0-0' }} CDF</span>
            <span class="total-usd">~ {{ totalUsd() | number:'1.2-2' }} USD</span>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button mat-dialog-close [disabled]="submitting()">Annuler</button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="!isValid() || submitting()"
          (click)="submitOrder()"
        >
          @if (submitting()) {
            <mat-spinner diameter="18" class="inline-spinner"></mat-spinner>
            <span>Création en cours...</span>
          } @else {
            <span>Créer le bon de commande</span>
          }
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      min-width: 780px;
      max-width: 900px;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid #e0e0e0;
    }
    .dialog-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }
    .dialog-content {
      padding: 20px 24px !important;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-height: 75vh;
    }
    .order-meta-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .flex-2 { flex: 2; }
    .flex-1 { flex: 1; }
    .w-full { width: 100%; }
    .product-picker-card {
      background: #f8fafc;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px dashed #cbd5e1;
    }
    .picker-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 0.9rem;
      color: #334155;
      margin-bottom: 8px;
    }
    .table-container {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 8px;
    }
    .order-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    .order-table th {
      background: #f1f5f9;
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
    }
    .order-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .table-input {
      width: 90%;
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .prod-info {
      display: flex;
      flex-direction: column;
    }
    .prod-name {
      font-weight: 600;
      color: #1e293b;
    }
    .prod-dosage {
      font-size: 0.8rem;
      color: #64748b;
    }
    .total-col {
      font-weight: 600;
      color: #0f172a;
    }
    .empty-lines {
      text-align: center;
      padding: 32px !important;
      color: #94a3b8;
    }
    .empty-lines mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      display: block;
      margin: 0 auto 8px;
    }
    .order-totals {
      display: flex;
      justify-content: flex-end;
      padding: 12px 0;
    }
    .total-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 20px;
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .total-label {
      font-weight: 600;
      color: #475569;
    }
    .total-cdf {
      font-size: 1.3rem;
      font-weight: 700;
      color: #0f766e;
    }
    .total-usd {
      font-size: 0.95rem;
      font-weight: 600;
      color: #64748b;
    }
    .dialog-actions {
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
    }
    .inline-spinner {
      display: inline-block;
      margin-right: 8px;
    }
  `],
})
export class PurchaseOrderDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<PurchaseOrderDialogComponent>);
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly alert = inject(AlertService);

  readonly suppliers = signal<Supplier[]>([]);
  readonly lines = signal<OrderLineForm[]>([]);
  readonly totalCdf = signal<number>(0);
  readonly totalUsd = signal<number>(0);
  readonly submitting = signal<boolean>(false);

  selectedSupplierId = '';
  expectedDeliveryDate = '';
  notes = '';

  ngOnInit() {
    this.loadSuppliers();
  }

  loadSuppliers() {
    this.suppliersApi.getSuppliers().subscribe({
      next: (data) => {
        const active = data.filter((s) => s.isActive);
        this.suppliers.set(active);
        if (active.length > 0) {
          this.selectedSupplierId = active[0].id;
        }
      },
      error: () => this.alert.error('Impossible de charger les fournisseurs.'),
    });
  }

  onProductSelected(item: ProductAutocompleteItem) {
    const current = this.lines();
    const existingIndex = current.findIndex((l) => l.productId === item.id);
    if (existingIndex >= 0) {
      current[existingIndex].orderedQuantity += 10;
      this.lines.set([...current]);
      this.alert.info(`Quantité augmentée pour ${item.name}`);
    } else {
      const estimatedCdf = Math.round(item.sellingPriceCdf * 0.7); // Prix d'achat estimé à 70% du prix de vente
      this.lines.set([
        ...current,
        {
          productId: item.id,
          productName: item.name,
          dosage: item.dosage,
          orderedQuantity: 50,
          unitPriceCdf: estimatedCdf > 0 ? estimatedCdf : 1000,
          unitPriceUsd: Number(((estimatedCdf > 0 ? estimatedCdf : 1000) / 2850).toFixed(2)),
        },
      ]);
    }
    this.onLineUpdated();
  }

  removeLine(index: number) {
    const current = this.lines();
    current.splice(index, 1);
    this.lines.set([...current]);
    this.onLineUpdated();
  }

  onLineUpdated() {
    let sumCdf = 0;
    for (const line of this.lines()) {
      line.unitPriceUsd = Number((line.unitPriceCdf / 2850).toFixed(2));
      sumCdf += line.orderedQuantity * line.unitPriceCdf;
    }
    this.totalCdf.set(sumCdf);
    this.totalUsd.set(Number((sumCdf / 2850).toFixed(2)));
  }

  isValid(): boolean {
    return (
      !!this.selectedSupplierId &&
      this.lines().length > 0 &&
      this.lines().every((l) => l.orderedQuantity > 0 && l.unitPriceCdf >= 0)
    );
  }

  submitOrder() {
    if (!this.isValid()) return;

    this.submitting.set(true);
    const payload = {
      supplierId: this.selectedSupplierId,
      expectedDeliveryDate: this.expectedDeliveryDate || undefined,
      notes: this.notes.trim() || undefined,
      items: this.lines().map((l) => ({
        productId: l.productId,
        orderedQuantity: Number(l.orderedQuantity),
        unitPriceCdf: Number(l.unitPriceCdf),
        unitPriceUsd: Number(l.unitPriceUsd),
      })),
    };

    this.suppliersApi.createPurchaseOrder(payload).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.alert.success(`Bon de commande ${created.orderNumber} créé avec succès.`);
        this.dialogRef.close(created);
      },
      error: (err) => {
        this.submitting.set(false);
        this.alert.error(err.error?.message || 'Erreur lors de la création du bon de commande.');
      },
    });
  }
}

