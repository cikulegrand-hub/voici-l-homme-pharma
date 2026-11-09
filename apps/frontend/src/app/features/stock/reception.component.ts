import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SuppliersApiService } from '../../core/api/services/suppliers-api.service';
import { CashApiService } from '../../core/api/services/cash-api.service';
import { StockApiService, DirectReceptionLineDto } from '../../core/api/services/stock-api.service';
import { AlertService } from '../../core/services/alert.service';
import { ProductAutocompleteComponent } from '../../shared/components/product-autocomplete/product-autocomplete.component';
import { PurchaseOrder, Supplier, ProductAutocompleteItem } from '@vhp/shared';

interface ReceptionTableLine {
  productId: string;
  productName: string;
  dosage?: string;
  purchaseOrderItemId?: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePriceCdf: number;
  purchasePriceUsd: number;
}

@Component({
  selector: 'app-reception',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatTooltipModule,
    ProductAutocompleteComponent,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div class="header-titles">
          <h1>Réception fournisseur</h1>
          <p class="subtitle">
            Enregistrement des entrées de stock avec traçabilité des lots et calcul automatique du coût moyen du stock.
          </p>
        </div>
      </div>

      <!-- Mode de réception : Bon de commande OU Réception directe -->
      <mat-card class="mode-card">
        <mat-card-content class="mode-content">
          <div class="mode-selector">
            <span class="mode-label">Type d'entrée :</span>
            <mat-radio-group [(ngModel)]="receptionMode" (change)="onModeChange()">
              <mat-radio-button value="PO">Réception sur bon de commande</mat-radio-button>
              <mat-radio-button value="DIRECT">Réception directe</mat-radio-button>
            </mat-radio-group>
          </div>

          @if (receptionMode === 'PO') {
            <div class="po-selector-row">
              <mat-form-field appearance="outline" class="flex-2">
                <mat-label>Sélectionner le Bon de Commande en cours</mat-label>
                <mat-select [(ngModel)]="selectedOrderId" (selectionChange)="onOrderSelected()">
                  @if (openOrders().length === 0) {
                    <mat-option disabled>Aucun bon de commande ouvert (Envoyé ou Partiel)</mat-option>
                  }
                  @for (po of openOrders(); track po.id) {
                    <mat-option [value]="po.id">
                      {{ po.orderNumber }} — {{ po.supplierName }} ({{ po.status }})
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="flex-1">
                <mat-label>N° Facture / BL Fournisseur</mat-label>
                <input matInput [(ngModel)]="supplierInvoiceNumber" placeholder="Ex: FACT-2026-890" />
              </mat-form-field>
            </div>
          } @else {
            <div class="po-selector-row">
              <mat-form-field appearance="outline" class="flex-1">
                <mat-label>Fournisseur émetteur</mat-label>
                <mat-select [(ngModel)]="selectedSupplierId">
                  <mat-option value="">— Aucun / Divers —</mat-option>
                  @for (s of suppliers(); track s.id) {
                    <mat-option [value]="s.id">{{ s.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="flex-1">
                <mat-label>N° Facture / BL Fournisseur</mat-label>
                <input matInput [(ngModel)]="supplierInvoiceNumber" placeholder="Ex: BL-KIN-0043" />
              </mat-form-field>

              <mat-form-field appearance="outline" class="flex-2">
                <mat-label>Motif / Notes</mat-label>
                <input matInput [(ngModel)]="notes" placeholder="Ex: Livraison directe au comptoir" />
              </mat-form-field>
            </div>
          }
        </mat-card-content>
      </mat-card>

      <!-- Carte d'ajout d'article (si mode DIRECT ou ajout hors BC) -->
      <mat-card class="picker-card">
        <mat-card-header>
          <mat-card-title class="card-title">
            <mat-icon>barcode_scanner</mat-icon>
            <span>Scan ou recherche de produit à réceptionner</span>
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-product-autocomplete
            placeholder="Scanner le code-barres ou saisir le nom/DCI pour ajouter une ligne..."
            (productSelected)="onProductSelected($event)"
          ></app-product-autocomplete>
        </mat-card-content>
      </mat-card>

      <!-- Tableau de saisie rapide au clavier -->
      <div class="table-container">
        <table class="reception-table">
          <thead>
            <tr>
              <th style="width: 28%">Produit</th>
              <th style="width: 18%">N° de Lot *</th>
              <th style="width: 20%">Date de Péremption *</th>
              <th style="width: 12%">Quantité Reçue *</th>
              <th style="width: 14%">Prix d'Achat (CDF) *</th>
              <th style="width: 8%"></th>
            </tr>
          </thead>
          <tbody>
            @if (lines().length === 0) {
              <tr>
                <td colspan="6" class="empty-reception">
                  <mat-icon>inventory</mat-icon>
                  <p>Aucune ligne de réception. Sélectionnez un bon de commande ou scannez des produits ci-dessus.</p>
                </td>
              </tr>
            } @else {
              @for (line of lines(); track $index; let i = $index) {
                <tr>
                  <td>
                    <div class="prod-cell">
                      <span class="prod-name">{{ line.productName }}</span>
                      @if (line.dosage) {
                        <span class="prod-sub">{{ line.dosage }}</span>
                      }
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      class="table-input"
                      placeholder="Ex: LOT-2026-A"
                      [(ngModel)]="line.lotNumber"
                      required
                    />
                  </td>
                  <td>
                    <div class="expiry-input-wrapper">
                      <input
                        type="date"
                        class="table-input expiry-input"
                        [(ngModel)]="line.expiryDate"
                        (change)="checkExpiry(line)"
                        required
                      />
                      <!-- Alerte visuelle de péremption -->
                      @if (getExpiryStatus(line.expiryDate) === 'EXPIRED') {
                        <span class="expiry-badge expired" matTooltip="Attention : le lot est déjà périmé. Réception interdite.">
                          <mat-icon>dangerous</mat-icon> Périmé
                        </span>
                      } @else if (getExpiryStatus(line.expiryDate) === 'WARNING') {
                        <span class="expiry-badge warning" matTooltip="Alerte : Date de péremption très proche (< 60 jours).">
                          <mat-icon>warning</mat-icon> &lt; 60 j
                        </span>
                      } @else if (getExpiryStatus(line.expiryDate) === 'OK') {
                        <span class="expiry-badge ok">
                          <mat-icon>check_circle</mat-icon> Valide
                        </span>
                      }
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      class="table-input qty-input"
                      [(ngModel)]="line.quantity"
                      (ngModelChange)="onLineChange()"
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      class="table-input price-input"
                      [(ngModel)]="line.purchasePriceCdf"
                      (ngModelChange)="onLineChange()"
                      required
                    />
                  </td>
                  <td class="action-cell">
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

      <!-- Récapitulatif et Validation -->
      <div class="summary-footer">
        <div class="summary-details">
          <div class="stat-pill">
            <span class="stat-label">Lignes :</span>
            <span class="stat-val">{{ lines().length }}</span>
          </div>
          <div class="stat-pill">
            <span class="stat-label">Total unités :</span>
            <span class="stat-val">{{ totalUnits() }}</span>
          </div>
          <div class="stat-pill highlight">
            <span class="stat-label">Valeur totale :</span>
            <span class="stat-val cdf">{{ totalValueCdf() | number:'1.0-0' }} CDF</span>
            <span class="stat-sub">(~ {{ totalValueUsd() | number:'1.2-2' }} USD)</span>
          </div>
        </div>

        @if (showRecap()) {
          <div class="recap-box">
            <h3>Récapitulatif avant validation</h3>
            <ul>
              @for (line of lines(); track $index) {
                <li>
                  {{ line.productName }} — lot {{ line.lotNumber }} — {{ line.quantity }} u. —
                  {{ line.purchasePriceCdf | number:'1.0-0' }} CDF
                  @if (getExpiryStatus(line.expiryDate) === 'WARNING') {
                    <strong class="recap-warn">péremption proche</strong>
                  }
                </li>
              }
            </ul>
          </div>
        }

        <div class="footer-actions">
          <button mat-stroked-button (click)="resetForm()" [disabled]="submitting()">
            Réinitialiser
          </button>

          <!-- Bouton de validation protégé contre les doubles clics -->
          <button
            mat-flat-button
            color="primary"
            class="validate-btn"
            [disabled]="!canValidate() || submitting()"
            (click)="onValidateClick()"
          >
            @if (submitting()) {
              <mat-spinner diameter="20" class="inline-spinner"></mat-spinner>
              <span>Enregistrement sécurisé...</span>
            } @else if (showRecap()) {
              <ng-container>
                <mat-icon>check</mat-icon>
                <span>Confirmer l'enregistrement</span>
              </ng-container>
            } @else {
              <ng-container>
                <mat-icon>fact_check</mat-icon>
                <span>Voir le récapitulatif</span>
              </ng-container>
            }
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .page-header h1 {
      margin: 0;
      font-size: 1.6rem;
      font-weight: 700;
      color: #0f172a;
    }
    .subtitle {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 0.95rem;
    }
    .mode-card, .picker-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .mode-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px !important;
    }
    .mode-selector {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .mode-label {
      font-weight: 600;
      color: #334155;
    }
    .po-selector-row {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .flex-1 { flex: 1; }
    .flex-2 { flex: 2; }
    .card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
      font-weight: 600;
      color: #334155;
    }
    .table-container {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .reception-table {
      width: 100%;
      min-width: 780px;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    .reception-table th {
      background: #f8fafc;
      padding: 12px 14px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
    }
    .reception-table td {
      padding: 10px 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .prod-cell {
      display: flex;
      flex-direction: column;
    }
    .prod-name {
      font-weight: 600;
      color: #1e293b;
    }
    .prod-sub {
      font-size: 0.8rem;
      color: #64748b;
    }
    .table-input {
      width: 90%;
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    .table-input:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
    }
    .expiry-input-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .expiry-badge {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 3px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .expiry-badge mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
    .expiry-badge.expired {
      background: #fee2e2;
      color: #b91c1c;
    }
    .expiry-badge.warning {
      background: #fef3c7;
      color: #b45309;
    }
    .expiry-badge.ok {
      background: #dcfce7;
      color: #15803d;
    }
    .qty-input, .price-input {
      text-align: right;
    }
    .action-cell {
      text-align: right;
    }
    .empty-reception {
      text-align: center;
      padding: 48px !important;
      color: #94a3b8;
    }
    .empty-reception mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      margin-bottom: 8px;
    }
    .summary-footer {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .recap-box {
      width: 100%;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
    }
    .recap-box h3 { margin: 0 0 8px; font-size: 1rem; }
    .recap-box ul { margin: 0; padding-left: 18px; }
    .recap-warn { color: #b45309; margin-left: 6px; }
    .summary-details {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .stat-pill {
      background: #f8fafc;
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .stat-pill.highlight {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    .stat-label {
      font-size: 0.85rem;
      color: #64748b;
    }
    .stat-val {
      font-weight: 700;
      color: #1e293b;
    }
    .stat-val.cdf {
      color: #166534;
      font-size: 1.15rem;
    }
    .stat-sub {
      font-size: 0.8rem;
      color: #64748b;
    }
    .footer-actions {
      display: flex;
      gap: 12px;
    }
    .validate-btn {
      padding: 0 24px;
    }
    .inline-spinner {
      display: inline-block;
      margin-right: 8px;
    }
    @media (max-width: 768px) {
      .page-container {
        padding: 12px 6px;
      }
      .po-selector-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      .mode-selector {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      .summary-footer {
        flex-direction: column;
        align-items: stretch;
      }
      .summary-details {
        flex-direction: column;
        align-items: stretch;
      }
      .footer-actions {
        flex-direction: column;
      }
      .footer-actions button {
        width: 100%;
      }
    }
  `],
})
export class ReceptionComponent implements OnInit {
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly cashApi = inject(CashApiService);
  private readonly stockApi = inject(StockApiService);
  private readonly alert = inject(AlertService);
  private readonly route = inject(ActivatedRoute);

  readonly showRecap = signal(false);
  receptionMode: 'PO' | 'DIRECT' = 'PO';
  selectedOrderId = '';
  selectedSupplierId = '';
  supplierInvoiceNumber = '';
  notes = '';

  readonly openOrders = signal<PurchaseOrder[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly lines = signal<ReceptionTableLine[]>([]);
  readonly totalUnits = signal<number>(0);
  readonly totalValueCdf = signal<number>(0);
  readonly totalValueUsd = signal<number>(0);
  readonly submitting = signal<boolean>(false);
  readonly exchangeRate = signal<number>(0);

  ngOnInit() {
    this.loadOpenOrders();
    this.loadSuppliers();
    this.cashApi.getActiveRate().subscribe({ next: (rate) => { this.exchangeRate.set(Number(rate.rate)); this.onLineChange(); }, error: () => this.alert.error('Aucun taux de change actif. Saisissez le taux avant la réception.') });
  }

  loadOpenOrders() {
    this.suppliersApi.getPurchaseOrders().subscribe({
      next: (orders) => {
        const eligible = orders.filter(
          (o) => o.status === 'ENVOYE' || o.status === 'PARTIELLEMENT_RECU',
        );
        this.openOrders.set(eligible);

        // Si un identifiant de commande est passé en paramètre (navigation directe depuis le module Fournisseurs)
        const urlOrderId = this.route.snapshot.queryParamMap.get('orderId');
        if (urlOrderId && eligible.some((o) => o.id === urlOrderId)) {
          this.receptionMode = 'PO';
          this.selectedOrderId = urlOrderId;
          this.onOrderSelected();
        }
      },
    });
  }

  loadSuppliers() {
    this.suppliersApi.getSuppliers().subscribe({
      next: (data) => this.suppliers.set(data.filter((s) => s.isActive)),
    });
  }

  onModeChange() {
    this.lines.set([]);
    this.selectedOrderId = '';
    this.onLineChange();
  }

  onOrderSelected() {
    if (!this.selectedOrderId) return;
    const po = this.openOrders().find((o) => o.id === this.selectedOrderId);
    if (!po) return;

    // Pré-remplir avec les lignes restantes à recevoir
    const prefilled: ReceptionTableLine[] = po.items.map((it) => {
      const remaining = Math.max(1, it.orderedQuantity - (it.receivedQuantity || 0));
      return {
        productId: it.productId,
        productName: it.productName || 'Produit',
        dosage: it.dosage,
        purchaseOrderItemId: it.id,
        lotNumber: '',
        expiryDate: '',
        quantity: remaining,
        purchasePriceCdf: it.unitPriceCdf || 1000,
        purchasePriceUsd: it.unitPriceUsd || this.toUsd(it.unitPriceCdf || 1000),
      };
    });

    this.lines.set(prefilled);
    this.onLineChange();
  }

  onProductSelected(item: ProductAutocompleteItem) {
    const current = this.lines();
    const defaultPriceCdf = Math.round(item.sellingPriceCdf * 0.7) || 1000;
    this.lines.set([
      ...current,
      {
        productId: item.id,
        productName: item.name,
        dosage: item.dosage,
        lotNumber: '',
        expiryDate: '',
        quantity: 10,
        purchasePriceCdf: defaultPriceCdf,
        purchasePriceUsd: this.toUsd(defaultPriceCdf),
      },
    ]);
    this.onLineChange();
  }

  removeLine(index: number) {
    const current = this.lines();
    current.splice(index, 1);
    this.lines.set([...current]);
    this.onLineChange();
  }

  onLineChange() {
    let units = 0;
    let totalCdf = 0;
    for (const l of this.lines()) {
      units += Number(l.quantity) || 0;
      totalCdf += (Number(l.quantity) || 0) * (Number(l.purchasePriceCdf) || 0);
      l.purchasePriceUsd = this.toUsd(Number(l.purchasePriceCdf) || 0);
    }
    this.totalUnits.set(units);
    this.totalValueCdf.set(totalCdf);
    this.totalValueUsd.set(this.toUsd(totalCdf));
  }

  private toUsd(amountCdf: number): number {
    const rate = this.exchangeRate();
    return rate > 0 ? Number((amountCdf / rate).toFixed(2)) : 0;
  }

  getExpiryStatus(dateStr: string): 'EXPIRED' | 'WARNING' | 'OK' | 'EMPTY' {
    if (!dateStr) return 'EMPTY';
    const exp = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (exp <= today) return 'EXPIRED';

    const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (diffDays < 60) return 'WARNING';

    return 'OK';
  }

  checkExpiry(line: ReceptionTableLine) {
    if (this.getExpiryStatus(line.expiryDate) === 'EXPIRED') {
      this.alert.warning(
            `Attention : la date de péremption du lot "${line.lotNumber || 'non renseigné'}" est déjà dépassée. La réception sera refusée.`,
      );
    }
  }

  onValidateClick() {
    if (!this.canValidate() || this.submitting()) return;
    if (!this.showRecap()) {
      this.showRecap.set(true);
      return;
    }
    this.submitReception();
  }

  canValidate(): boolean {
    const lines = this.lines();
    if (lines.length === 0 || this.exchangeRate() <= 0) return false;

    // Toutes les lignes doivent avoir lotNumber, expiryDate non périmée, quantité >= 1, prix >= 0
    return lines.every((l) => {
      const validLot = !!l.lotNumber && l.lotNumber.trim().length > 0;
      const validExp = this.getExpiryStatus(l.expiryDate) === 'OK' || this.getExpiryStatus(l.expiryDate) === 'WARNING';
      const validQty = Number(l.quantity) > 0;
      const validPrice = Number(l.purchasePriceCdf) >= 0;
      return validLot && validExp && validQty && validPrice;
    });
  }

  submitReception() {
    if (!this.canValidate() || this.submitting()) return;

    this.submitting.set(true);

    // Clé d'idempotence générée côté client
    const idempotencyKey = `idemp-rec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    if (this.receptionMode === 'PO' && this.selectedOrderId) {
      // Réception liée à un bon de commande
      const payload = {
        idempotencyKey,
        supplierInvoiceNumber: this.supplierInvoiceNumber.trim() || undefined,
        notes: this.notes.trim() || undefined,
        lines: this.lines().map((l) => ({
          productId: l.productId,
          purchaseOrderItemId: l.purchaseOrderItemId,
          lotNumber: l.lotNumber.trim(),
          expiryDate: l.expiryDate,
          receivedQuantity: Number(l.quantity),
          actualPurchasePriceCdf: Number(l.purchasePriceCdf),
          actualPurchasePriceUsd: Number(l.purchasePriceUsd),
        })),
      };

      this.suppliersApi.receiveOrder(this.selectedOrderId, payload).subscribe({
        next: (order) => {
          this.submitting.set(false);
          this.alert.success(
            `Réception enregistrée avec succès. Bon de commande ${order.orderNumber} mis à jour (${order.status}). Coût moyen du stock recalculé.`,
          );
          this.resetForm();
          this.loadOpenOrders();
        },
        error: (err) => {
          this.submitting.set(false);
          this.alert.error(err.error?.message || 'Erreur lors de la réception du bon de commande.');
        },
      });
    } else {
      // Réception directe
      const payload = {
        idempotencyKey,
        supplierId: this.selectedSupplierId || undefined,
        supplierInvoiceNumber: this.supplierInvoiceNumber.trim() || undefined,
        notes: this.notes.trim() || 'Réception directe sans bon',
        lines: this.lines().map((l) => ({
          productId: l.productId,
          lotNumber: l.lotNumber.trim(),
          expiryDate: l.expiryDate,
          quantity: Number(l.quantity),
          purchasePriceCdf: Number(l.purchasePriceCdf),
          purchasePriceUsd: Number(l.purchasePriceUsd),
        })),
      };

      this.stockApi.directReception(payload).subscribe({
        next: (receipt) => {
          this.submitting.set(false);
          this.alert.success(
            `Réception directe ${receipt.receiptNumber} validée avec succès. Lots créés et coût moyen du stock actualisé.`,
          );
          this.resetForm();
        },
        error: (err) => {
          this.submitting.set(false);
          this.alert.error(err.error?.message || 'Erreur lors de la réception directe.');
        },
      });
    }
  }

  resetForm() {
    this.lines.set([]);
    this.supplierInvoiceNumber = '';
    this.notes = '';
    this.selectedOrderId = '';
    this.showRecap.set(false);
    this.onLineChange();
  }
}
