import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PurchaseOrder } from '@vhp/shared';

export interface PurchaseOrderDetailDialogData {
  order: PurchaseOrder;
}

@Component({
  selector: 'app-purchase-order-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <div class="header-title-box">
          <mat-icon class="header-icon">description</mat-icon>
          <div>
            <h2 mat-dialog-title>Bon de Commande : {{ data.order.orderNumber }}</h2>
            <span class="header-sub">
              Créé le {{ data.order.orderDate | date:'dd/MM/yyyy à HH:mm' }} par {{ data.order.createdByName || 'Gestionnaire Stock' }}
            </span>
          </div>
        </div>
        <button mat-icon-button mat-dialog-close class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content class="dialog-content">
        <!-- Informations Générales de la Commande -->
        <div class="meta-card">
          <div class="meta-item">
            <span class="meta-label">Fournisseur :</span>
            <span class="meta-value font-semibold">{{ data.order.supplierName || 'Fournisseur' }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Statut actuel :</span>
            <span class="status-pill" [attr.data-status]="data.order.status">
              {{ formatStatus(data.order.status) }}
            </span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Date livraison souhaitée :</span>
            <span class="meta-value">
              {{ data.order.expectedDeliveryDate ? (data.order.expectedDeliveryDate | date:'dd/MM/yyyy') : 'Non spécifiée' }}
            </span>
          </div>
          <div class="meta-item" *ngIf="data.order.receivedDate">
            <span class="meta-label">Date réception finale :</span>
            <span class="meta-value font-semibold text-green-700">
              {{ data.order.receivedDate | date:'dd/MM/yyyy' }}
            </span>
          </div>
          <div class="meta-item w-full" *ngIf="data.order.notes">
            <span class="meta-label">Notes & Références :</span>
            <span class="meta-value italic">{{ data.order.notes }}</span>
          </div>
        </div>

        <!-- Tableau des Lignes de Produits -->
        <div class="items-title">
          <mat-icon>format_list_bulleted</mat-icon>
          <span>Articles commandés ({{ data.order.items.length }} référence{{ data.order.items.length > 1 ? 's' : '' }})</span>
        </div>

        <div class="table-container">
          <table class="detail-table">
            <thead>
              <tr>
                <th style="width: 35%">Article / Produit</th>
                <th style="width: 12%; text-align: center;">Commandé</th>
                <th style="width: 12%; text-align: center;">Reçu</th>
                <th style="width: 15%; text-align: center;">Progression</th>
                <th style="width: 13%; text-align: right;">P.U. (CDF)</th>
                <th style="width: 13%; text-align: right;">Total (CDF)</th>
              </tr>
            </thead>
            <tbody>
              @for (item of data.order.items; track item.productId) {
                <tr>
                  <td>
                    <div class="product-col">
                      <span class="p-name">{{ item.productName || 'Produit' }}</span>
                      <span class="p-sub" *ngIf="item.dci || item.dosage">
                        {{ item.dci }} {{ item.dosage ? '— ' + item.dosage : '' }}
                      </span>
                    </div>
                  </td>
                  <td style="text-align: center; font-weight: 600;">
                    {{ item.orderedQuantity }}
                  </td>
                  <td style="text-align: center;">
                    <span [class.text-green-700]="item.receivedQuantity >= item.orderedQuantity" [class.text-amber-700]="item.receivedQuantity > 0 && item.receivedQuantity < item.orderedQuantity">
                      {{ item.receivedQuantity }}
                    </span>
                  </td>
                  <td>
                    <div class="progress-col">
                      <mat-progress-bar
                        mode="determinate"
                        [value]="getProgress(item.orderedQuantity, item.receivedQuantity)"
                        [color]="item.receivedQuantity >= item.orderedQuantity ? 'primary' : 'accent'"
                      ></mat-progress-bar>
                      <span class="progress-text">
                        {{ getProgress(item.orderedQuantity, item.receivedQuantity) }}%
                      </span>
                    </div>
                  </td>
                  <td style="text-align: right;">
                    {{ item.unitPriceCdf | number:'1.0-0' }} CDF
                  </td>
                  <td style="text-align: right; font-weight: 600;">
                    {{ (item.orderedQuantity * item.unitPriceCdf) | number:'1.0-0' }} CDF
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Récapitulatif Financier -->
        <div class="financial-summary">
          <div class="summary-box">
            <span class="summary-label">Total de la commande :</span>
            <span class="summary-cdf">{{ data.order.totalAmountCdf | number:'1.0-0' }} CDF</span>
            <span class="summary-usd">~ {{ data.order.totalAmountUsd | number:'1.2-2' }} USD</span>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button mat-dialog-close>Fermer</button>
        <button
          mat-stroked-button
          color="primary"
          (click)="onDownloadPdf()"
          matTooltip="Exporter en PDF officiel"
        >
          <mat-icon>picture_as_pdf</mat-icon>
          <span>Télécharger PDF</span>
        </button>
        <button
          *ngIf="data.order.status === 'ENVOYE' || data.order.status === 'PARTIELLEMENT_RECU'"
          mat-flat-button
          color="accent"
          (click)="onReceiveOrder()"
          matTooltip="Enregistrer la livraison des articles en stock"
        >
          <mat-icon>inventory_2</mat-icon>
          <span>Réceptionner la commande</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      width: 100%;
      max-width: 860px;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid #e2e8f0;
    }
    .header-title-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: #0284c7;
    }
    .dialog-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
    }
    .header-sub {
      font-size: 0.85rem;
      color: #64748b;
    }
    .dialog-content {
      padding: 20px 24px !important;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-height: 75vh;
    }
    .meta-card {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      background: #f8fafc;
      padding: 14px 18px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 180px;
    }
    .meta-label {
      font-size: 0.78rem;
      text-transform: uppercase;
      font-weight: 600;
      color: #64748b;
    }
    .meta-value {
      font-size: 0.95rem;
      color: #1e293b;
    }
    .w-full {
      width: 100%;
      flex-basis: 100%;
    }
    .font-semibold {
      font-weight: 600;
    }
    .status-pill {
      display: inline-block;
      width: fit-content;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .status-pill[data-status="BROUILLON"] { background: #f1f5f9; color: #475569; }
    .status-pill[data-status="ENVOYE"] { background: #e0f2fe; color: #0369a1; }
    .status-pill[data-status="PARTIELLEMENT_RECU"] { background: #fef3c7; color: #92400e; }
    .status-pill[data-status="RECU"] { background: #dcfce7; color: #166534; }
    .status-pill[data-status="ANNULE"] { background: #fee2e2; color: #991b1b; }
    .items-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 0.95rem;
      color: #334155;
    }
    .table-container {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .detail-table {
      width: 100%;
      min-width: 580px;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    .detail-table th {
      background: #f1f5f9;
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
    }
    .detail-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .product-col {
      display: flex;
      flex-direction: column;
    }
    .p-name {
      font-weight: 600;
      color: #0f172a;
    }
    .p-sub {
      font-size: 0.8rem;
      color: #64748b;
    }
    .progress-col {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .progress-text {
      font-size: 0.75rem;
      color: #64748b;
      text-align: center;
    }
    .financial-summary {
      display: flex;
      justify-content: flex-end;
      padding: 8px 0;
    }
    .summary-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 18px;
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .summary-label {
      font-weight: 600;
      color: #475569;
      font-size: 0.9rem;
    }
    .summary-cdf {
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f766e;
    }
    .summary-usd {
      font-size: 0.9rem;
      font-weight: 600;
      color: #64748b;
    }
    .dialog-actions {
      padding: 16px 24px;
      border-top: 1px solid #e2e8f0;
      gap: 8px;
      flex-wrap: wrap;
    }
    @media (max-width: 600px) {
      .meta-card {
        flex-direction: column;
      }
      .dialog-actions button {
        width: 100%;
      }
    }
  `],
})
export class PurchaseOrderDetailDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<PurchaseOrderDetailDialogComponent>);

  constructor(@Inject(MAT_DIALOG_DATA) public data: PurchaseOrderDetailDialogData) {}

  getProgress(ordered: number, received: number): number {
    if (!ordered || ordered <= 0) return 0;
    return Math.min(100, Math.round(((received || 0) / ordered) * 100));
  }

  formatStatus(status: string): string {
    switch (status) {
      case 'BROUILLON': return 'Brouillon';
      case 'ENVOYE': return 'Envoyé au fournisseur';
      case 'PARTIELLEMENT_RECU': return 'Partiellement Reçu';
      case 'RECU': return 'Reçu Totalement';
      case 'ANNULE': return 'Annulé';
      default: return status;
    }
  }

  onDownloadPdf() {
    this.dialogRef.close({ action: 'DOWNLOAD_PDF', order: this.data.order });
  }

  onReceiveOrder() {
    this.dialogRef.close({ action: 'RECEIVE_ORDER', order: this.data.order });
  }
}

