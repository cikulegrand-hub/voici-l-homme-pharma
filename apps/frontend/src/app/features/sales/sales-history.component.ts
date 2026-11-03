import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { Sale } from '@vhp/shared';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { SalesApiService } from '../../core/api/services/sales-api.service';
import { HasPermissionDirective } from '../../core/permissions/has-permission.directive';
import { PermissionService } from '../../core/permissions/permission.service';

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    CurrencyFormatPipe,
    HasPermissionDirective,
  ],
  template: `
    <div class="sales-history-container">
      <header class="page-header">
        <div>
          <h2>Historique des ventes et avoirs</h2>
          <p class="subtitle">Journal des factures émises, réimpressions duplicatas et gestion des retours clients.</p>
        </div>
        <div class="header-actions">
          <button mat-stroked-button (click)="loadSales()">
            <mat-icon>refresh</mat-icon> Actualiser
          </button>
        </div>
      </header>

      <!-- Barre de filtres -->
      <div class="filters-card">
        <div class="search-field">
          <mat-icon>search</mat-icon>
          <input
            type="text"
            placeholder="Filtrer par n° de facture ou nom du client..."
            [(ngModel)]="searchQuery"
          />
        </div>
        <div class="filter-status">
          <label>Statut :</label>
          <select [(ngModel)]="statusFilter">
            <option value="ALL">Tous les statuts</option>
            <option value="VALIDEE">Validée</option>
            <option value="AVOIR">Avoir partiel</option>
            <option value="ANNULEE">Annulée</option>
          </select>
        </div>
      </div>

      <!-- Tableau des ventes -->
      <div class="table-container">
        <table class="sales-table">
          <thead>
            <tr>
              <th>N° Facture</th>
              <th>Date & Heure</th>
              <th>Client</th>
              <th>Total CDF</th>
              <th>Total USD</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (sale of filteredSales(); track sale.id) {
              <tr [class.selected]="selectedSale()?.id === sale.id">
                <td>
                  <strong class="invoice-link" (click)="selectSale(sale)">{{ sale.invoiceNumber }}</strong>
                </td>
                <td>{{ sale.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
                <td>{{ sale.customerName || 'Client comptoir' }}</td>
                <td><strong>{{ sale.totalAmountCdf | currencyFormat:'CDF' }}</strong></td>
                <td>{{ sale.totalAmountUsd | currencyFormat:'USD' }}</td>
                <td>
                  <span class="status-badge" [ngClass]="sale.status.toLowerCase()">
                    {{ sale.status }}
                  </span>
                </td>
                <td class="actions-cell">
                  <button mat-icon-button (click)="selectSale(sale)" title="Voir détail">
                    <mat-icon>visibility</mat-icon>
                  </button>
                  <button mat-icon-button (click)="reprintDuplicate(sale.invoiceNumber)" title="Réimprimer le duplicata">
                    <mat-icon>print</mat-icon>
                  </button>
                  <!-- Actions Annulation / Avoir -->
                  <button
                    *hasPermission="'vente.annuler'"
                    mat-icon-button
                    color="warn"
                    [disabled]="sale.status === 'ANNULEE'"
                    (click)="openCancelModal(sale)"
                    title="Émettre un avoir / Annuler (Pharmacien)"
                  >
                    <mat-icon>assignment_return</mat-icon>
                  </button>
                  <button
                    *hasPermission="'vente.creer'"
                    mat-icon-button
                    [disabled]="sale.status === 'ANNULEE'"
                    (click)="openRequestCancelModal(sale)"
                    title="Demander annulation (Caissier)"
                  >
                    <mat-icon>help_outline</mat-icon>
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="empty-table">
                  <mat-icon>receipt_long</mat-icon>
                  <p>Aucune facture trouvée correspondant aux critères.</p>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Tiroir / Panneau de détail d'une vente -->
      <div class="sale-detail-card" *ngIf="selectedSale()">
        <div class="detail-header">
          <h3>Détail de la facture : {{ selectedSale().invoiceNumber }}</h3>
          <button type="button" class="btn-close-detail" (click)="selectedSale.set(null)">✕</button>
        </div>

        <div class="detail-grid">
          <div>Client : <strong>{{ selectedSale().customerName }}</strong></div>
          <div>Date d'émission : <strong>{{ selectedSale().createdAt | date:'medium' }}</strong></div>
          <div>Taux appliqué : <strong>1 USD = {{ selectedSale().appliedExchangeRate | currencyFormat:'CDF' }}</strong></div>
          <div>Statut : <span class="status-badge" [ngClass]="selectedSale().status.toLowerCase()">{{ selectedSale().status }}</span></div>
        </div>

        <!-- Lignes d'articles -->
        <h4 style="margin-top: 16px;">Articles facturés et lots utilisés</h4>
        <table class="detail-items-table">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Péremption</th>
              <th>Quantité</th>
              <th>Prix unitaire</th>
              <th>Remise</th>
              <th>Total ligne</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let it of selectedSale().items">
              <td><strong>{{ it.lotNumber || 'Non spécifié' }}</strong></td>
              <td>{{ it.expiryDate || 'N/A' }}</td>
              <td>{{ it.quantity }}</td>
              <td>{{ it.unitPriceCdf | currencyFormat:'CDF' }}</td>
              <td>{{ it.discountCdf | currencyFormat:'CDF' }}</td>
              <td><strong>{{ it.totalLineCdf | currencyFormat:'CDF' }}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="detail-actions">
          <button mat-flat-button color="primary" (click)="reprintDuplicate(selectedSale().invoiceNumber)">
            <mat-icon>print</mat-icon> Imprimer DUPLICATA certifié
          </button>
          <button mat-stroked-button (click)="printTicket(selectedSale().invoiceNumber)">
            <mat-icon>receipt</mat-icon> Re-ticket 80 mm
          </button>
        </div>
      </div>

      <!-- Dialogue Modal Pharmacien : Annulation & Émission d'Avoir partiel/total (VTE-14, UC-05) -->
      <div class="modal-backdrop" *ngIf="showCancelModal && saleToCancel">
        <div class="modal-dialog cancel-dialog">
          <div class="modal-header">
            <h3>Émettre un avoir ou annuler la vente</h3>
            <button type="button" class="btn-close-modal" (click)="showCancelModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p>Facture concernée : <strong>{{ saleToCancel.invoiceNumber }}</strong></p>

            <div class="form-group">
              <label>Motif obligatoire de l'avoir ou de l'annulation :</label>
              <textarea
                [(ngModel)]="cancelReason"
                rows="3"
                placeholder="Explication claire du retour client ou de l'erreur..."
              ></textarea>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="cancelRestock" />
                Réintégrer les médicaments non altérés en stock (RETOUR_CLIENT)
              </label>
              <small class="hint">Si décoché, les articles retournés seront enregistrés en CASSE_PERTE (non revendables).</small>
            </div>

            <h4>Sélection des quantités retournées :</h4>
            <div class="return-lines-list">
              <div *ngFor="let item of returnLines" class="return-line-row">
                <label>Lot {{ item.lotNumber }} (Vendues : {{ item.maxQuantity }})</label>
                <div class="qty-field">
                  <span>Qté à retourner :</span>
                  <input type="number" min="0" [max]="item.maxQuantity" [(ngModel)]="item.returnQuantity" />
                </div>
              </div>
            </div>

            <div *ngIf="actionError" class="modal-error">{{ actionError }}</div>
          </div>
          <div class="modal-footer">
            <button mat-stroked-button (click)="showCancelModal = false">Annuler</button>
            <button mat-flat-button color="warn" [disabled]="!cancelReason.trim() || isSubmitting" (click)="submitCancelSale()">
              {{ isSubmitting ? 'Traitement...' : 'Valider l’avoir et contre-passer' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Dialogue Modal Caissier : Demande d'annulation transmise au pharmacien -->
      <div class="modal-backdrop" *ngIf="showRequestModal && saleToRequest">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>Demande d'annulation de vente</h3>
            <button type="button" class="btn-close-modal" (click)="showRequestModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p>La demande sera transmise au pharmacien responsable pour validation.</p>
            <div class="form-group">
              <label>Motif de la demande :</label>
              <textarea [(ngModel)]="requestReason" rows="3" placeholder="Motif justifiant l'annulation..."></textarea>
            </div>
            <div *ngIf="actionError" class="modal-error">{{ actionError }}</div>
          </div>
          <div class="modal-footer">
            <button mat-stroked-button (click)="showRequestModal = false">Fermer</button>
            <button mat-flat-button color="primary" [disabled]="!requestReason.trim() || isSubmitting" (click)="submitCancellationRequest()">
              {{ isSubmitting ? 'Envoi...' : 'Transmettre au pharmacien' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .sales-history-container { padding: 16px; font-family: var(--vhp-font); }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .subtitle { color: #555; font-size: 13px; margin: 0; }
    .filters-card { background: #fff; border: 1px solid #d5ded9; border-radius: 8px; padding: 12px; margin-bottom: 16px; display: flex; gap: 16px; align-items: center; }
    .search-field { display: flex; align-items: center; gap: 8px; flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 0 10px; height: 38px; }
    .search-field input { border: none; outline: none; width: 100%; font-size: 14px; }
    .filter-status { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
    .filter-status select { height: 38px; padding: 0 10px; border: 1px solid #ccc; border-radius: 6px; }
    .table-container { background: #fff; border: 1px solid #d5ded9; border-radius: 8px; overflow: hidden; }
    .sales-table { width: 100%; border-collapse: collapse; }
    .sales-table th { background: #f8faf9; padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: left; font-size: 13px; }
    .sales-table td { padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: middle; }
    .sales-table tr:hover { background: #f9fbf9; }
    .sales-table tr.selected { background: #eef6f2; }
    .invoice-link { color: #116149; cursor: pointer; text-decoration: underline; }
    .status-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .status-badge.validee { background: #e6f4ea; color: #137333; }
    .status-badge.avoir { background: #fef3c7; color: #92400e; }
    .status-badge.annulee { background: #fee2e2; color: #991b1b; }
    .actions-cell { white-space: nowrap; }
    .empty-table { text-align: center; color: #777; padding: 32px !important; }
    .empty-table mat-icon { font-size: 40px; width: 40px; height: 40px; color: #ccc; }
    .sale-detail-card { margin-top: 20px; background: #fff; border: 2px solid #116149; border-radius: 8px; padding: 16px; }
    .detail-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 12px; }
    .btn-close-detail { background: none; border: none; font-size: 18px; cursor: pointer; }
    .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; font-size: 13px; }
    .detail-items-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .detail-items-table th { background: #f4f6f5; padding: 8px; border-bottom: 1px solid #ddd; text-align: left; font-size: 12px; }
    .detail-items-table td { padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; }
    .detail-actions { display: flex; gap: 12px; margin-top: 16px; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1200; }
    .modal-dialog { background: #fff; border-radius: 10px; width: 500px; max-width: 95%; padding: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .btn-close-modal { background: none; border: none; font-size: 18px; cursor: pointer; }
    .form-group { margin-bottom: 12px; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .form-group textarea { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-family: inherit; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .hint { display: block; font-size: 11px; color: #666; margin-top: 4px; }
    .return-lines-list { max-height: 180px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; padding: 8px; margin-bottom: 12px; }
    .return-line-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    .qty-field { display: flex; align-items: center; gap: 6px; }
    .qty-field input { width: 60px; height: 30px; text-align: center; border: 1px solid #ccc; border-radius: 4px; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .modal-error { color: #b91c1c; font-size: 13px; margin-top: 8px; }
  `],
})
export class SalesHistoryComponent implements OnInit {
  private readonly salesApi = inject(SalesApiService);
  private readonly permissions = inject(PermissionService);

  sales = signal<Sale[]>([]);
  searchQuery = '';
  statusFilter = 'ALL';
  selectedSale = signal<any>(null);

  // Annulation modal (Pharmacien)
  showCancelModal = false;
  saleToCancel: any = null;
  cancelReason = '';
  cancelRestock = true;
  returnLines: { saleItemId: string; lotNumber: string; maxQuantity: number; returnQuantity: number }[] = [];

  // Demande modal (Caissier)
  showRequestModal = false;
  saleToRequest: any = null;
  requestReason = '';

  isSubmitting = false;
  actionError = '';

  ngOnInit(): void {
    this.loadSales();
  }

  loadSales(): void {
    this.salesApi.getSales().subscribe({
      next: (list) => {
        this.sales.set(list || []);
      },
    });
  }

  filteredSales = () => {
    let list = this.sales();
    if (this.statusFilter !== 'ALL') {
      list = list.filter((s) => s.status === this.statusFilter);
    }
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.invoiceNumber.toLowerCase().includes(q) ||
          (s.customerName && s.customerName.toLowerCase().includes(q)),
      );
    }
    return list;
  };

  selectSale(sale: Sale): void {
    this.salesApi.getSaleById(sale.id).subscribe({
      next: (full) => this.selectedSale.set(full),
      error: () => this.selectedSale.set(sale),
    });
  }

  reprintDuplicate(invoiceNumber: string): void {
    this.salesApi.getInvoiceDocument(invoiceNumber, false, true).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
    });
  }

  printTicket(invoiceNumber: string): void {
    this.salesApi.getInvoiceDocument(invoiceNumber, true).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
    });
  }

  openCancelModal(sale: any): void {
    this.salesApi.getSaleById(sale.id).subscribe({
      next: (full) => {
        this.saleToCancel = full;
        this.cancelReason = '';
        this.cancelRestock = true;
        this.actionError = '';
        this.returnLines = (full.items || []).map((it: any) => ({
          saleItemId: it.id || it.lotId,
          lotNumber: it.lotNumber,
          maxQuantity: it.quantity,
          returnQuantity: it.quantity,
        }));
        this.showCancelModal = true;
      },
    });
  }

  submitCancelSale(): void {
    if (!this.saleToCancel || !this.cancelReason.trim()) return;
    this.isSubmitting = true;
    this.actionError = '';

    const lines = this.returnLines
      .filter((l) => l.returnQuantity > 0)
      .map((l) => ({
        saleItemId: l.saleItemId,
        quantity: l.returnQuantity,
        restock: this.cancelRestock,
      }));

    this.salesApi
      .cancelSale(this.saleToCancel.id, {
        reason: this.cancelReason.trim(),
        restockItems: this.cancelRestock,
        items: lines,
      })
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.showCancelModal = false;
          this.loadSales();
          this.selectedSale.set(null);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.actionError = err?.error?.message || 'Erreur lors de l’annulation de la facture.';
        },
      });
  }

  openRequestCancelModal(sale: any): void {
    this.saleToRequest = sale;
    this.requestReason = '';
    this.actionError = '';
    this.showRequestModal = true;
  }

  submitCancellationRequest(): void {
    if (!this.saleToRequest || !this.requestReason.trim()) return;
    this.isSubmitting = true;
    this.actionError = '';

    this.salesApi
      .requestCancellation(this.saleToRequest.id, {
        reason: this.requestReason.trim(),
        restockItems: true,
      })
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.showRequestModal = false;
          alert('Demande d’annulation transmise au pharmacien avec succès.');
        },
        error: (err) => {
          this.isSubmitting = false;
          this.actionError = err?.error?.message || 'Erreur lors de l’envoi de la demande.';
        },
      });
  }
}

