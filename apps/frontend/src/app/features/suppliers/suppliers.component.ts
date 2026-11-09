import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SuppliersApiService } from '../../core/api/services/suppliers-api.service';
import { AlertService } from '../../core/services/alert.service';
import { PermissionService } from '../../core/permissions/permission.service';
import { HasPermissionDirective } from '../../core/permissions/has-permission.directive';
import { SupplierDialogComponent } from './supplier-dialog.component';
import { PurchaseOrderDialogComponent } from './purchase-order-dialog.component';
import { PurchaseOrderDetailDialogComponent } from './purchase-order-detail-dialog.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { Supplier, PurchaseOrder, PurchaseOrderStatus } from '@vhp/shared';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    HasPermissionDirective,
  ],
  template: `
    <div class="page-container">
      <!-- En-tête de la page -->
      <div class="page-header">
        <div class="header-titles">
          <h1>Achats & Fournisseurs</h1>
          <p class="subtitle">Gestion du fichier fournisseurs, bons de commande, délais et exportations PDF</p>
        </div>
        <div class="header-actions">
          <button
            mat-stroked-button
            color="primary"
            *hasPermission="'stock.recevoir'"
            (click)="openNewSupplierDialog()"
          >
            <mat-icon>person_add</mat-icon>
            <span>Nouveau Fournisseur</span>
          </button>
          <button
            mat-flat-button
            color="primary"
            *hasPermission="'stock.recevoir'"
            (click)="openNewOrderDialog()"
          >
            <mat-icon>post_add</mat-icon>
            <span>Nouveau Bon de Commande</span>
          </button>
        </div>
      </div>

      <!-- Navigation par Onglets -->
      <mat-tab-group [(selectedIndex)]="activeTab" animationDuration="200ms" class="content-tabs">
        <!-- ONGLET 1 : FICHIER FOURNISSEURS -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon">local_shipping</mat-icon>
            <span>Fournisseurs ({{ filteredSuppliers().length }})</span>
          </ng-template>

          <div class="tab-body">
            <!-- Barre de recherche et filtres -->
            <div class="toolbar-card">
              <mat-form-field appearance="outline" class="search-input">
                <mat-label>Rechercher un fournisseur...</mat-label>
                <mat-icon matPrefix>search</mat-icon>
                <input matInput [(ngModel)]="searchSupplier" placeholder="Nom, contact, téléphone..." />
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-select">
                <mat-label>Statut</mat-label>
                <mat-select [(ngModel)]="filterSupplierActive">
                  <mat-option value="ALL">Tous les statuts</mat-option>
                  <mat-option value="ACTIVE">Actifs uniquement</mat-option>
                  <mat-option value="INACTIVE">Inactifs uniquement</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <!-- Tableau Fournisseurs -->
            <div class="table-card">
              @if (loadingSuppliers()) {
                <div class="loading-state">
                  <mat-spinner diameter="40"></mat-spinner>
                  <p>Chargement des fournisseurs...</p>
                </div>
              } @else if (filteredSuppliers().length === 0) {
                <div class="empty-state">
                  <mat-icon>domain_disabled</mat-icon>
                  <p>Aucun fournisseur trouvé.</p>
                </div>
              } @else {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Fournisseur</th>
                      <th>Contact Principal</th>
                      <th>Téléphone / Email</th>
                      <th>Délai Moyen</th>
                      <th>Conditions de Paiement</th>
                      <th>Statut</th>
                      <th class="actions-header">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of filteredSuppliers(); track s.id) {
                      <tr>
                        <td>
                          <div class="supplier-main-info">
                            <span class="supplier-name">{{ s.name }}</span>
                            @if (s.address) {
                              <span class="supplier-address">{{ s.address }}</span>
                            }
                          </div>
                        </td>
                        <td>{{ s.contactName || '—' }}</td>
                        <td>
                          <div class="contact-details">
                            @if (s.phone) {
                              <a [href]="'tel:' + s.phone" class="contact-link" matTooltip="Appeler">
                                <mat-icon class="contact-icon">phone</mat-icon>
                                <span>{{ s.phone }}</span>
                              </a>
                            }
                            @if (s.email) {
                              <a [href]="'mailto:' + s.email" class="contact-link email-sub" matTooltip="Envoyer un email">
                                <mat-icon class="contact-icon">email</mat-icon>
                                <span>{{ s.email }}</span>
                              </a>
                            }
                            @if (!s.phone && !s.email) { <span>—</span> }
                          </div>
                        </td>
                        <td>
                          <span class="lead-time-badge">
                            <mat-icon>schedule</mat-icon>
                            {{ s.leadTimeDays }} jour(s)
                          </span>
                        </td>
                        <td>{{ s.paymentTerms || 'Comptant' }}</td>
                        <td>
                          <span class="status-pill" [class.active]="s.isActive" [class.inactive]="!s.isActive">
                            {{ s.isActive ? 'Actif' : 'Inactif' }}
                          </span>
                        </td>
                        <td class="actions-cell">
                          <!-- Commander chez ce fournisseur -->
                          <button
                            mat-icon-button
                            color="accent"
                            matTooltip="Créer une commande pour ce fournisseur"
                            *hasPermission="'stock.recevoir'"
                            [disabled]="!s.isActive"
                            (click)="orderFromSupplier(s)"
                          >
                            <mat-icon>post_add</mat-icon>
                          </button>

                          <!-- Voir les commandes de ce fournisseur -->
                          <button
                            mat-icon-button
                            color="primary"
                            matTooltip="Filtrer les commandes de ce fournisseur"
                            (click)="filterOrdersBySupplier(s)"
                          >
                            <mat-icon>receipt_long</mat-icon>
                          </button>

                          <!-- Modifier la fiche -->
                          <button
                            mat-icon-button
                            color="primary"
                            matTooltip="Modifier la fiche"
                            *hasPermission="'stock.recevoir'"
                            (click)="editSupplier(s)"
                          >
                            <mat-icon>edit</mat-icon>
                          </button>

                          <!-- Activer / Désactiver -->
                          <button
                            mat-icon-button
                            [color]="s.isActive ? 'warn' : 'accent'"
                            [matTooltip]="s.isActive ? 'Désactiver le fournisseur' : 'Réactiver le fournisseur'"
                            *hasPermission="'stock.recevoir'"
                            (click)="toggleSupplierStatus(s)"
                          >
                            <mat-icon>{{ s.isActive ? 'block' : 'check_circle' }}</mat-icon>
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        </mat-tab>

        <!-- ONGLET 2 : BONS DE COMMANDE (ACH-02) -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon">description</mat-icon>
            <span>Bons de Commande ({{ filteredOrders().length }})</span>
          </ng-template>

          <div class="tab-body">
            <!-- Barre de filtres Commandes -->
            <div class="toolbar-card">
              <mat-form-field appearance="outline" class="search-input">
                <mat-label>Rechercher une commande...</mat-label>
                <mat-icon matPrefix>search</mat-icon>
                <input matInput [(ngModel)]="searchOrder" placeholder="N° Bon de commande, notes..." />
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-select">
                <mat-label>Filtrer par statut</mat-label>
                <mat-select [(ngModel)]="filterOrderStatus" (selectionChange)="loadOrders()">
                  <mat-option value="">Tous les statuts</mat-option>
                  <mat-option value="BROUILLON">Brouillon</mat-option>
                  <mat-option value="ENVOYE">Envoyé</mat-option>
                  <mat-option value="PARTIELLEMENT_RECU">Partiellement Reçu</mat-option>
                  <mat-option value="RECU">Reçu Totalement</mat-option>
                  <mat-option value="ANNULE">Annulé</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <!-- Tableau Commandes -->
            <div class="table-card">
              @if (loadingOrders()) {
                <div class="loading-state">
                  <mat-spinner diameter="40"></mat-spinner>
                  <p>Chargement des bons de commande...</p>
                </div>
              } @else if (filteredOrders().length === 0) {
                <div class="empty-state">
                  <mat-icon>assignment_late</mat-icon>
                  <p>Aucun bon de commande trouvé pour ces critères.</p>
                </div>
              } @else {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>N° Commande</th>
                      <th>Date</th>
                      <th>Fournisseur</th>
                      <th>Articles</th>
                      <th>Montant Estimé</th>
                      <th>Statut</th>
                      <th class="actions-header">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (o of filteredOrders(); track o.id) {
                      <tr>
                        <td>
                          <span class="order-num">{{ o.orderNumber }}</span>
                        </td>
                        <td>{{ o.orderDate | date:'dd/MM/yyyy' }}</td>
                        <td>
                          <span class="order-supp">{{ o.supplierName || 'Fournisseur' }}</span>
                        </td>
                        <td>
                          <span class="items-count-badge">{{ o.items.length }} réf(s)</span>
                        </td>
                        <td>
                          <div class="order-amounts">
                            <span class="cdf-amount">{{ o.totalAmountCdf | number:'1.0-0' }} CDF</span>
                            <span class="usd-amount">~ {{ o.totalAmountUsd | number:'1.2-2' }} USD</span>
                          </div>
                        </td>
                        <td>
                          <span class="order-status-badge" [attr.data-status]="o.status">
                            {{ formatStatus(o.status) }}
                          </span>
                        </td>
                        <td class="actions-cell">
                          <!-- Consulter le détail du bon -->
                          <button
                            mat-icon-button
                            color="primary"
                            matTooltip="Consulter le détail du bon"
                            (click)="viewOrderDetail(o)"
                          >
                            <mat-icon>visibility</mat-icon>
                          </button>

                          <!-- Télécharger PDF (ACH-02) -->
                          <button
                            mat-icon-button
                            color="primary"
                            matTooltip="Télécharger le bon en PDF"
                            (click)="downloadPdf(o)"
                          >
                            <mat-icon>picture_as_pdf</mat-icon>
                          </button>

                          <!-- Réceptionner la livraison -->
                          @if (o.status === 'ENVOYE' || o.status === 'PARTIELLEMENT_RECU') {
                            <button
                              mat-icon-button
                              color="accent"
                              matTooltip="Réceptionner la commande en stock"
                              *hasPermission="'stock.recevoir'"
                              (click)="receiveOrder(o)"
                            >
                              <mat-icon>inventory_2</mat-icon>
                            </button>
                          }

                          <!-- Actions de changement de statut -->
                          @if (o.status === 'BROUILLON') {
                            <button
                              mat-icon-button
                              color="accent"
                              matTooltip="Marquer comme Envoyé"
                              *hasPermission="'stock.recevoir'"
                              (click)="updateStatus(o, 'ENVOYE')"
                            >
                              <mat-icon>send</mat-icon>
                            </button>
                            <button
                              mat-icon-button
                              color="warn"
                              matTooltip="Annuler le bon"
                              *hasPermission="'stock.recevoir'"
                              (click)="updateStatus(o, 'ANNULE')"
                            >
                              <mat-icon>cancel</mat-icon>
                            </button>
                          }

                          @if (o.status === 'ENVOYE' || o.status === 'PARTIELLEMENT_RECU') {
                            <button
                              mat-icon-button
                              color="warn"
                              matTooltip="Annuler / Clôturer le solde"
                              *hasPermission="'stock.recevoir'"
                              (click)="updateStatus(o, 'ANNULE')"
                            >
                              <mat-icon>close</mat-icon>
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-titles h1 {
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
    .header-actions {
      display: flex;
      gap: 12px;
    }
    .tab-icon {
      margin-right: 8px;
    }
    .tab-body {
      padding: 20px 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .toolbar-card {
      display: flex;
      gap: 16px;
      align-items: center;
      background: white;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .search-input {
      flex: 1;
    }
    .filter-select {
      width: 220px;
    }
    .table-card {
      background: white;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .data-table {
      width: 100%;
      min-width: 650px;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    .data-table th {
      background: #f8fafc;
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
    }
    .data-table td {
      padding: 12px 16px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .actions-header, .actions-cell {
      text-align: right;
    }
    .supplier-main-info {
      display: flex;
      flex-direction: column;
    }
    .supplier-name {
      font-weight: 600;
      color: #1e293b;
    }
    .supplier-address {
      font-size: 0.8rem;
      color: #64748b;
    }
    .contact-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .contact-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #0284c7;
      text-decoration: none;
      font-size: 0.85rem;
    }
    .contact-link:hover {
      text-decoration: underline;
      color: #0369a1;
    }
    .contact-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #64748b;
    }
    .email-sub {
      font-size: 0.8rem;
      color: #64748b;
    }
    .lead-time-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: #f1f5f9;
      border-radius: 4px;
      font-size: 0.85rem;
      color: #334155;
    }
    .lead-time-badge mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .status-pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .status-pill.active {
      background: #dcfce7;
      color: #166534;
    }
    .status-pill.inactive {
      background: #fee2e2;
      color: #991b1b;
    }
    .order-num {
      font-weight: 600;
      color: #0284c7;
    }
    .order-supp {
      font-weight: 500;
      color: #1e293b;
    }
    .items-count-badge {
      padding: 3px 8px;
      background: #f1f5f9;
      border-radius: 4px;
      font-size: 0.85rem;
      color: #475569;
    }
    .order-amounts {
      display: flex;
      flex-direction: column;
    }
    .cdf-amount {
      font-weight: 600;
      color: #0f172a;
    }
    .usd-amount {
      font-size: 0.8rem;
      color: #64748b;
    }
    .order-status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .order-status-badge[data-status="BROUILLON"] {
      background: #f1f5f9;
      color: #475569;
    }
    .order-status-badge[data-status="ENVOYE"] {
      background: #e0f2fe;
      color: #0369a1;
    }
    .order-status-badge[data-status="PARTIELLEMENT_RECU"] {
      background: #fef3c7;
      color: #92400e;
    }
    .order-status-badge[data-status="RECU"] {
      background: #dcfce7;
      color: #166534;
    }
    .order-status-badge[data-status="ANNULE"] {
      background: #fee2e2;
      color: #991b1b;
    }
    .loading-state, .empty-state {
      padding: 48px;
      text-align: center;
      color: #64748b;
    }
    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 8px;
      color: #94a3b8;
    }
    @media (max-width: 768px) {
      .page-container {
        padding: 12px 6px;
      }
      .page-header {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }
      .header-actions {
        flex-direction: column;
      }
      .header-actions button {
        width: 100%;
      }
      .toolbar-card {
        flex-direction: column;
        align-items: stretch;
      }
      .filter-select {
        width: 100%;
      }
    }
  `],
})
export class SuppliersComponent implements OnInit {
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly alert = inject(AlertService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  public readonly perm = inject(PermissionService);

  activeTab = 0;

  // Fournisseurs
  readonly suppliers = signal<Supplier[]>([]);
  readonly loadingSuppliers = signal<boolean>(false);
  searchSupplier = '';
  filterSupplierActive = 'ALL';

  // Commandes
  readonly orders = signal<PurchaseOrder[]>([]);
  readonly loadingOrders = signal<boolean>(false);
  searchOrder = '';
  filterOrderStatus = '';

  ngOnInit() {
    this.loadSuppliers();
    this.loadOrders();
  }

  loadSuppliers() {
    this.loadingSuppliers.set(true);
    this.suppliersApi.getSuppliers().subscribe({
      next: (data) => {
        this.suppliers.set(data);
        this.loadingSuppliers.set(false);
      },
      error: () => {
        this.loadingSuppliers.set(false);
        this.alert.error('Erreur de chargement des fournisseurs.');
      },
    });
  }

  loadOrders() {
    this.loadingOrders.set(true);
    const query = this.filterOrderStatus ? { status: this.filterOrderStatus } : undefined;
    this.suppliersApi.getPurchaseOrders(query).subscribe({
      next: (data) => {
        this.orders.set(data);
        this.loadingOrders.set(false);
      },
      error: () => {
        this.loadingOrders.set(false);
        this.alert.error('Erreur de chargement des bons de commande.');
      },
    });
  }

  filteredSuppliers(): Supplier[] {
    return this.suppliers().filter((s) => {
      const matchSearch =
        !this.searchSupplier ||
        s.name.toLowerCase().includes(this.searchSupplier.toLowerCase()) ||
        (s.contactName && s.contactName.toLowerCase().includes(this.searchSupplier.toLowerCase())) ||
        (s.phone && s.phone.includes(this.searchSupplier));

      const matchActive =
        this.filterSupplierActive === 'ALL' ||
        (this.filterSupplierActive === 'ACTIVE' && s.isActive) ||
        (this.filterSupplierActive === 'INACTIVE' && !s.isActive);

      return matchSearch && matchActive;
    });
  }

  filteredOrders(): PurchaseOrder[] {
    return this.orders().filter((o) => {
      const matchSearch =
        !this.searchOrder ||
        o.orderNumber.toLowerCase().includes(this.searchOrder.toLowerCase()) ||
        (o.supplierName && o.supplierName.toLowerCase().includes(this.searchOrder.toLowerCase())) ||
        (o.notes && o.notes.toLowerCase().includes(this.searchOrder.toLowerCase()));

      return matchSearch;
    });
  }

  openNewSupplierDialog() {
    const ref = this.dialog.open(SupplierDialogComponent, { width: '560px' });
    ref.afterClosed().subscribe((res) => {
      if (res) this.loadSuppliers();
    });
  }

  editSupplier(supplier: Supplier) {
    const ref = this.dialog.open(SupplierDialogComponent, {
      width: '560px',
      data: { supplier },
    });
    ref.afterClosed().subscribe((res) => {
      if (res) this.loadSuppliers();
    });
  }

  orderFromSupplier(supplier: Supplier) {
    const ref = this.dialog.open(PurchaseOrderDialogComponent, {
      width: '850px',
      data: { supplierId: supplier.id },
    });
    ref.afterClosed().subscribe((res) => {
      if (res) {
        this.loadOrders();
        this.activeTab = 1;
      }
    });
  }

  filterOrdersBySupplier(supplier: Supplier) {
    this.searchOrder = supplier.name;
    this.activeTab = 1;
  }

  toggleSupplierStatus(supplier: Supplier) {
    const action = supplier.isActive ? 'désactiver' : 'réactiver';
    const confirmRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `${supplier.isActive ? 'Désactiver' : 'Réactiver'} le fournisseur`,
        message: `Voulez-vous vraiment ${action} le fournisseur "${supplier.name}" ? ${supplier.isActive ? 'Il ne pourra plus être sélectionné pour de nouvelles commandes.' : 'Il sera à nouveau disponible pour les commandes.'}`,
        confirmColor: supplier.isActive ? 'warn' : 'primary',
      },
    });

    confirmRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.suppliersApi.toggleSupplierActive(supplier.id, !supplier.isActive).subscribe({
          next: () => {
            this.alert.success(`Fournisseur "${supplier.name}" ${supplier.isActive ? 'désactivé' : 'réactivé'} avec succès.`);
            this.loadSuppliers();
          },
          error: (err) => this.alert.error(err.error?.message || 'Erreur lors de la mise à jour du fournisseur.'),
        });
      }
    });
  }

  openNewOrderDialog() {
    const ref = this.dialog.open(PurchaseOrderDialogComponent, { width: '850px' });
    ref.afterClosed().subscribe((res) => {
      if (res) {
        this.loadOrders();
        this.activeTab = 1; // Basculer vers l'onglet commandes
      }
    });
  }

  viewOrderDetail(order: PurchaseOrder) {
    const ref = this.dialog.open(PurchaseOrderDetailDialogComponent, {
      width: '850px',
      data: { order },
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      if (result.action === 'DOWNLOAD_PDF') {
        this.downloadPdf(result.order);
      } else if (result.action === 'RECEIVE_ORDER') {
        this.receiveOrder(result.order);
      }
    });
  }

  receiveOrder(order: PurchaseOrder) {
    this.alert.info(`Ouverture de la réception pour le bon ${order.orderNumber}...`);
    this.router.navigate(['/reception'], { queryParams: { orderId: order.id } });
  }

  updateStatus(order: PurchaseOrder, status: PurchaseOrderStatus) {
    const isCancelBalance = (order.status === 'ENVOYE' || order.status === 'PARTIELLEMENT_RECU') && status === 'ANNULE';
    const confirmRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: isCancelBalance ? 'Clôturer et annuler le solde' : 'Changer le statut du bon',
        message: isCancelBalance
          ? `Voulez-vous clôturer la commande ${order.orderNumber} et annuler le solde des articles restants ?`
          : `Voulez-vous passer le bon ${order.orderNumber} au statut "${this.formatStatus(status)}" ?`,
        confirmColor: status === 'ANNULE' ? 'warn' : 'primary',
      },
    });

    confirmRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.suppliersApi.updateOrderStatus(order.id, status).subscribe({
          next: () => {
            this.alert.success(`Statut du bon ${order.orderNumber} mis à jour.`);
            this.loadOrders();
          },
          error: (err) => this.alert.error(err.error?.message || 'Erreur lors du changement de statut.'),
        });
      }
    });
  }

  downloadPdf(order: PurchaseOrder) {
    this.suppliersApi.downloadPurchaseOrderPdf(order.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Bon-Commande-${order.orderNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: () => this.alert.error('Erreur lors du téléchargement du PDF.'),
    });
  }

  formatStatus(status: PurchaseOrderStatus): string {
    switch (status) {
      case 'BROUILLON': return 'Brouillon';
      case 'ENVOYE': return 'Envoyé';
      case 'PARTIELLEMENT_RECU': return 'Partiellement Reçu';
      case 'RECU': return 'Reçu';
      case 'ANNULE': return 'Annulé';
      default: return status;
    }
  }
}
