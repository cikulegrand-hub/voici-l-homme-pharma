import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { Sale, ConflictResolutionAction, ResolveConflictDto } from '@vhp/shared';
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
  providers: [DatePipe],
  template: `
    <div class="sales-history-container">
      <header class="page-header">
        <div>
          <h2>Historique des ventes, avoirs & conflits</h2>
          <p class="subtitle">Journal des ventes au comptoir, traçabilité des avoirs et arbitrage des synchronisations hors-ligne.</p>
        </div>
        <div class="header-actions">
          <button mat-stroked-button (click)="refreshAll()">
            <mat-icon>refresh</mat-icon> Actualiser
          </button>
        </div>
      </header>

      <!-- Onglets de navigation -->
      <nav class="nav-tabs">
        <button
          type="button"
          class="tab-btn"
          [class.active]="activeTab === 'SALES'"
          (click)="activeTab = 'SALES'"
        >
          <mat-icon>receipt_long</mat-icon>
          Journal des ventes & avoirs
        </button>

        <button
          *hasPermission="'vente.annuler'"
          type="button"
          class="tab-btn"
          [class.active]="activeTab === 'CONFLICTS'"
          (click)="activeTab = 'CONFLICTS'; loadConflicts()"
        >
          <mat-icon>warning</mat-icon>
          Conflits hors-ligne
          @if (conflicts().length > 0) {
            <span class="badge-count">{{ conflicts().length }}</span>
          }
        </button>

        <button
          *hasPermission="'vente.annuler'"
          type="button"
          class="tab-btn"
          [class.active]="activeTab === 'CANCELLATIONS'"
          (click)="activeTab = 'CANCELLATIONS'; loadCancellationRequests()"
        >
          <mat-icon>assignment_late</mat-icon>
          Demandes d'annulation
          @if (cancellationRequests().length > 0) {
            <span class="badge-count warning">{{ cancellationRequests().length }}</span>
          }
        </button>
      </nav>

      <!-- 1. VUE JOURNAL DES VENTES -->
      @if (activeTab === 'SALES') {
        <!-- Barre de filtres multi-critères (CDC V2) -->
        <div class="filters-card">
          <div class="search-field">
            <mat-icon>search</mat-icon>
            <input
              type="text"
              placeholder="Rechercher par N° facture, nom client ou téléphone..."
              [(ngModel)]="searchQuery"
              (keyup.enter)="loadSales()"
            />
          </div>

          <div class="filter-group">
            <label>Du :</label>
            <input type="date" [(ngModel)]="startDate" (change)="loadSales()" />
          </div>

          <div class="filter-group">
            <label>Au :</label>
            <input type="date" [(ngModel)]="endDate" (change)="loadSales()" />
          </div>

          <div class="filter-group">
            <label>Statut :</label>
            <select [(ngModel)]="statusFilter" (change)="loadSales()">
              <option value="ALL">Tous les statuts</option>
              <option value="VALIDEE">Validée</option>
              <option value="AVOIR">Avoir partiel</option>
              <option value="ANNULEE">Annulée</option>
              <option value="CONFLIT">En conflit</option>
            </select>
          </div>

          <button mat-stroked-button (click)="resetFilters()">
            Réinitialiser
          </button>
        </div>

        <!-- Tableau des ventes -->
        @if (salesLoadError) {
          <div class="modal-error" role="alert">{{ salesLoadError }}</div>
        }
        <div class="table-container">
          <table class="sales-table">
            <thead>
              <tr>
                <th>N° Facture</th>
                <th>Date & Heure</th>
                <th>Client</th>
                <th>Vendeur</th>
                <th>Total CDF</th>
                <th>Total USD</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (sale of sales(); track sale.id) {
                <tr [class.selected]="selectedSale()?.id === sale.id">
                  <td>
                    <strong class="invoice-link" (click)="selectSale(sale)">{{ sale.invoiceNumber }}</strong>
                    @if (sale.isOffline) {
                      <span class="offline-pill" title="Enregistrée hors-ligne">Hors-ligne</span>
                    }
                  </td>
                  <td>{{ sale.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
                  <td>{{ sale.customerName || 'Client comptoir' }}</td>
                  <td>{{ sale.cashierName || 'Vendeur' }}</td>
                  <td><strong>{{ sale.totalAmountCdf | currencyFormat:'CDF' }}</strong></td>
                  <td>{{ sale.totalAmountUsd | currencyFormat:'USD' }}</td>
                  <td>
                    <span class="status-badge" [ngClass]="sale.status.toLowerCase()">
                      {{ sale.status }}
                    </span>
                  </td>
                  <td class="actions-cell">
                    <button mat-icon-button (click)="selectSale(sale)" title="Consulter le détail">
                      <mat-icon>visibility</mat-icon>
                    </button>
                    <button mat-icon-button (click)="printDocument(sale.invoiceNumber, false, true)" title="Imprimer duplicata certifié">
                      <mat-icon>print</mat-icon>
                    </button>
                    <button mat-icon-button (click)="printDocument(sale.invoiceNumber, true, false)" title="Imprimer ticket 80mm">
                      <mat-icon>receipt</mat-icon>
                    </button>
                    <!-- Émettre un avoir (Pharmacien) -->
                    <button
                      *hasPermission="'vente.annuler'"
                      mat-icon-button
                      color="warn"
                      [disabled]="sale.status === 'ANNULEE'"
                      (click)="openCancelModal(sale)"
                      title="Émettre un avoir / retour produit"
                    >
                      <mat-icon>assignment_return</mat-icon>
                    </button>
                    <!-- Demander annulation (Caissier) -->
                    <button
                      *hasPermission="'vente.creer'"
                      mat-icon-button
                      [disabled]="sale.status === 'ANNULEE'"
                      (click)="openRequestCancelModal(sale)"
                      title="Demander annulation au pharmacien"
                    >
                      <mat-icon>help_outline</mat-icon>
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" class="empty-table">
                    <mat-icon>receipt_long</mat-icon>
                    <p>Aucune facture trouvée correspondant aux critères de recherche.</p>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Tiroir / Fiche détaillée d'une facture -->
        @if (selectedSale()) {
          <div class="sale-detail-card">
            <div class="detail-header">
              <h3>Facture officielle : {{ selectedSale().invoiceNumber }}</h3>
              <button type="button" class="btn-close-detail" (click)="selectedSale.set(null)">✕</button>
            </div>

            <div class="detail-grid">
              <div>Client : <strong>{{ selectedSale().customerName }}</strong> {{ selectedSale().customerPhone ? '(' + selectedSale().customerPhone + ')' : '' }}</div>
              <div>Date : <strong>{{ selectedSale().createdAt | date:'medium' }}</strong></div>
              <div>Vendeur : <strong>{{ selectedSale().cashierName || 'Vendeur' }}</strong></div>
              <div>Taux officiel : <strong>1 USD = {{ selectedSale().appliedExchangeRate | currencyFormat:'CDF' }}</strong></div>
              <div>Statut : <span class="status-badge" [ngClass]="selectedSale().status.toLowerCase()">{{ selectedSale().status }}</span></div>
              <div>Mode réseau : <strong>{{ selectedSale().isOffline ? 'Vente enregistrée hors-ligne' : 'Vente en ligne directe' }}</strong></div>
            </div>

            <!-- Articles facturés -->
            <h4 style="margin: 12px 0 6px;">Articles & Déstockage FEFO :</h4>
            <div class="table-container">
            <table class="detail-items-table">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Lot FEFO</th>
                  <th>Péremption</th>
                  <th>Qté</th>
                  <th>Prix Unitaire</th>
                  <th>Remise</th>
                  <th>Total CDF</th>
                </tr>
              </thead>
              <tbody>
                @for (it of selectedSale().items; track it.id || it.lotId) {
                  <tr>
                    <td><strong>{{ it.productName || 'Médicament' }}</strong></td>
                    <td><span class="status-badge">{{ it.lotNumber || 'Non spécifié' }}</span></td>
                    <td>{{ (it.expiryDate | date:'dd/MM/yyyy') || 'N/A' }}</td>
                    <td style="text-align:center"><strong>{{ it.quantity }}</strong></td>
                    <td>{{ it.unitPriceCdf | currencyFormat:'CDF' }}</td>
                    <td>{{ it.discountCdf | currencyFormat:'CDF' }}</td>
                    <td><strong>{{ it.totalLineCdf | currencyFormat:'CDF' }}</strong></td>
                  </tr>
                }
              </tbody>
            </table>
            </div>

            <div class="detail-actions">
              <button mat-flat-button color="primary" (click)="printDocument(selectedSale().invoiceNumber, false, true)">
                <mat-icon>print</mat-icon> Imprimer DUPLICATA certifié
              </button>
              <button mat-stroked-button (click)="printDocument(selectedSale().invoiceNumber, true, false)">
                <mat-icon>receipt</mat-icon> Ticket thermique 80 mm
              </button>
              <button mat-stroked-button (click)="printDocument(selectedSale().invoiceNumber, false, false)">
                <mat-icon>description</mat-icon> Facture A4
              </button>
            </div>
          </div>
        }
      }

      <!-- 2. VUE CONFLITS HORS-LIGNE (PHARMACIEN RESPONSABLE) -->
      @if (activeTab === 'CONFLICTS') {
        <div class="conflicts-container">
          <p class="subtitle" style="margin-bottom: 14px;">
            Ventes réalisées hors-ligne pour lesquelles le stock physique était insuffisant ou modifié au moment de la synchronisation.
            <strong>Arbitrage strict du Pharmacien Responsable requis (aucun stock négatif autorisé).</strong>
          </p>

          @for (conflict of conflicts(); track conflict.id) {
            <div class="conflict-card">
              <div class="conflict-header">
                <span class="conflict-title">Conflit sur facture : {{ conflict.invoiceNumber }}</span>
                <span class="status-badge conflit">En attente d'arbitrage</span>
              </div>

              <div class="conflict-meta">
                Vendeur : <strong>{{ conflict.cashierName || 'Vendeur' }}</strong> |
                Vente locale le : <strong>{{ conflict.offlineCreatedAt || conflict.createdAt | date:'medium' }}</strong> |
                Clé : <code>{{ conflict.idempotencyKey || 'N/A' }}</code>
              </div>

              <!-- Tableau des lignes en conflit -->
              <table class="conflict-items-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Lot vendu hors-ligne</th>
                    <th>Quantité vendue</th>
                    <th>Stock réel disponible</th>
                    <th>Écart</th>
                  </tr>
                </thead>
                <tbody>
                  @for (it of conflict.conflictDetails?.conflictingItems || []; track it.productId) {
                    <tr>
                      <td><strong>{{ it.productName }}</strong></td>
                      <td>{{ it.lotNumber }}</td>
                      <td><strong>{{ it.requestedQuantity }}</strong></td>
                      <td style="color: #b91c1c; font-weight: bold">{{ it.availableStock }}</td>
                      <td style="color: #b91c1c; font-weight: bold">-{{ it.shortage }}</td>
                    </tr>
                  }
                </tbody>
              </table>

              <div class="detail-actions" style="margin-top: 10px;">
                <button mat-flat-button color="primary" (click)="openResolveConflictModal(conflict)">
                  <mat-icon>gavel</mat-icon> Arbitrer ce conflit
                </button>
              </div>
            </div>
          } @empty {
            <div class="empty-table" style="background:#fff; border-radius:8px;">
              <mat-icon style="color:#15803d">check_circle</mat-icon>
              <p>Aucun conflit de synchronisation en attente. Tout le stock est parfaitement aligné !</p>
            </div>
          }
        </div>
      }

      <!-- 3. VUE DEMANDES D'ANNULATION (PHARMACIEN) -->
      @if (activeTab === 'CANCELLATIONS') {
        <div class="cancellations-container">
          <p class="subtitle" style="margin-bottom: 14px;">
            Demandes d'annulation transmises par les caissiers au comptoir.
          </p>

          <div class="table-container">
            <table class="sales-table">
              <thead>
                <tr>
                  <th>N° Facture</th>
                  <th>Date demande</th>
                  <th>Caissier demandeur</th>
                  <th>Motif</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (req of cancellationRequests(); track req.id) {
                  <tr>
                    <td><strong>{{ req.invoiceNumber }}</strong></td>
                    <td>{{ req.requestedAt | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td>{{ req.requestedBy }}</td>
                    <td>{{ req.reason }}</td>
                    <td>
                      <button mat-flat-button color="warn" (click)="acceptCancellationRequest(req)" [disabled]="isSubmitting">
                        Émettre l'avoir
                      </button>
                      <button mat-stroked-button (click)="rejectCancellationRequest(req)" [disabled]="isSubmitting">
                        Refuser
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="empty-table">
                      <mat-icon>task_alt</mat-icon>
                      <p>Aucune demande d'annulation en attente.</p>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- MODALE 1 : AVOIR & RETOUR EN 3 ÉTAPES (PHARMACIEN) -->
      @if (showCancelModal && saleToCancel) {
        <div class="modal-backdrop">
          <div class="modal-dialog">
            <div class="modal-header">
              <h3>Émettre un avoir / Retour produit (VTE-14)</h3>
              <button type="button" class="btn-close-modal" (click)="showCancelModal = false">✕</button>
            </div>
            <div class="modal-body">
              <p>Facture concernée : <strong>{{ saleToCancel.invoiceNumber }}</strong></p>

              <div class="form-group">
                <label>Motif obligatoire du retour / avoir :</label>
                <textarea
                  [(ngModel)]="cancelReason"
                  rows="2"
                  placeholder="Justification légale et pharmaceutique du retour..."
                ></textarea>
              </div>

              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="cancelRestock" />
                  Réintégrer les médicaments non altérés en stock (RETOUR_CLIENT)
                </label>
                <small class="hint">Si non coché, les articles seront comptabilisés en CASSE_PERTE (non revendables).</small>
              </div>

              <label style="font-size:12px; font-weight:700;">Quantités à retourner par article :</label>
              <div class="return-lines-list">
                @for (item of returnLines; track item.saleItemId) {
                  <div class="return-line-row">
                    <div>
                      <strong>{{ item.productName || 'Article' }}</strong>
                      <br><small>Lot : {{ item.lotNumber }} (Vendues : {{ item.maxQuantity }})</small>
                    </div>
                    <div class="qty-field">
                      <span>Retour :</span>
                      <input type="number" min="0" [max]="item.maxQuantity" [(ngModel)]="item.returnQuantity" />
                    </div>
                  </div>
                }
              </div>

              @if (actionError) {
                <div class="modal-error">{{ actionError }}</div>
              }
            </div>
            <div class="modal-footer">
              <button mat-stroked-button (click)="showCancelModal = false">Annuler</button>
              <button mat-flat-button color="warn" [disabled]="!cancelReason.trim() || isSubmitting" (click)="submitCancelSale()">
                @if (isSubmitting) {
                  <span>Traitement...</span>
                } @else {
                  <span>Valider l'avoir et contre-passer</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- MODALE 2 : DEMANDE D'ANNULATION (CAISSIER) -->
      @if (showRequestModal && saleToRequest) {
        <div class="modal-backdrop">
          <div class="modal-dialog">
            <div class="modal-header">
              <h3>Demande d'annulation de facture</h3>
              <button type="button" class="btn-close-modal" (click)="showRequestModal = false">✕</button>
            </div>
            <div class="modal-body">
              <p>Facture : <strong>{{ saleToRequest.invoiceNumber }}</strong></p>
              <p class="hint">La demande sera transmise au Pharmacien Responsable pour validation.</p>
              <div class="form-group">
                <label>Motif de la demande :</label>
                <textarea [(ngModel)]="requestReason" rows="3" placeholder="Motif justifiant l'annulation..."></textarea>
              </div>
              @if (actionError) {
                <div class="modal-error">{{ actionError }}</div>
              }
            </div>
            <div class="modal-footer">
              <button mat-stroked-button (click)="showRequestModal = false">Fermer</button>
              <button mat-flat-button color="primary" [disabled]="!requestReason.trim() || isSubmitting" (click)="submitCancellationRequest()">
                @if (isSubmitting) {
                  <span>Envoi en cours...</span>
                } @else {
                  <span>Transmettre au pharmacien</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- MODALE 3 : ARBITRAGE DE CONFLIT HORS-LIGNE (PHARMACIEN RESPONSABLE) -->
      @if (showConflictModal && conflictToResolve) {
        <div class="modal-backdrop">
          <div class="modal-dialog">
            <div class="modal-header">
              <h3>Arbitrage du conflit hors-ligne</h3>
              <button type="button" class="btn-close-modal" (click)="showConflictModal = false">✕</button>
            </div>
            <div class="modal-body">
              <p>Facture : <strong>{{ conflictToResolve.invoiceNumber }}</strong></p>

              <div class="form-group">
                <label>Action d'arbitrage choisie par le Pharmacien :</label>
                <select [(ngModel)]="conflictAction">
                  <option value="ANNULER_VENTE">Annuler la vente avec contre-passation financière</option>
                  <option value="MAINTENIR_EN_ATTENTE">Maintenir en attente pour vérification physique</option>
                </select>
              </div>

              <div class="form-group">
                <label>Justification obligatoire de la décision (traçabilité audit) :</label>
                <textarea
                  [(ngModel)]="conflictReason"
                  rows="3"
                  placeholder="Explication détaillée de la décision pour le registre..."
                ></textarea>
              </div>

              @if (actionError) {
                <div class="modal-error">{{ actionError }}</div>
              }
            </div>
            <div class="modal-footer">
              <button mat-stroked-button (click)="showConflictModal = false">Annuler</button>
              <button
                mat-flat-button
                color="primary"
                [disabled]="!conflictReason.trim() || isSubmitting"
                (click)="submitConflictResolution()"
              >
                @if (isSubmitting) {
                  <span>Enregistrement...</span>
                } @else {
                  <span>Enregistrer la décision d'arbitrage</span>
                }
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './sales-history.component.scss',
})
export class SalesHistoryComponent implements OnInit {
  private readonly salesApi = inject(SalesApiService);
  readonly permissions = inject(PermissionService);

  activeTab: 'SALES' | 'CONFLICTS' | 'CANCELLATIONS' = 'SALES';

  sales = signal<Sale[]>([]);
  conflicts = signal<any[]>([]);
  cancellationRequests = signal<any[]>([]);

  searchQuery = '';
  startDate = '';
  endDate = '';
  statusFilter = 'ALL';
  salesLoadError = '';
  selectedSale = signal<any>(null);

  // Annulation modal (Pharmacien)
  showCancelModal = false;
  saleToCancel: any = null;
  cancelReason = '';
  cancelRestock = true;
  returnLines: { saleItemId: string; productName?: string; lotNumber: string; maxQuantity: number; returnQuantity: number }[] = [];

  // Demande modal (Caissier)
  showRequestModal = false;
  saleToRequest: any = null;
  requestReason = '';

  // Conflit modal (Pharmacien)
  showConflictModal = false;
  conflictToResolve: any = null;
  conflictAction: ConflictResolutionAction = 'ANNULER_VENTE';
  conflictReason = '';

  isSubmitting = false;
  actionError = '';

  ngOnInit(): void {
    this.refreshAll();
  }

  refreshAll(): void {
    this.loadSales();
    this.loadConflicts();
    this.loadCancellationRequests();
  }

  loadSales(): void {
    this.salesApi
      .getSales({
        query: this.searchQuery.trim() || undefined,
        startDate: this.startDate || undefined,
        endDate: this.endDate || undefined,
        status: this.statusFilter !== 'ALL' ? this.statusFilter : undefined,
      })
      .subscribe({
        next: (list) => {
          this.salesLoadError = '';
          this.sales.set(list || []);
        },
        error: (err) => {
          this.sales.set([]);
          this.salesLoadError = err?.error?.message || 'Impossible de charger l’historique des ventes.';
        },
      });
  }

  loadConflicts(): void {
    this.salesApi.listConflicts().subscribe({
      next: (list) => this.conflicts.set(list || []),
      error: () => this.conflicts.set([]),
    });
  }

  loadCancellationRequests(): void {
    this.salesApi.listCancellationRequests().subscribe({
      next: (list) => this.cancellationRequests.set(list || []),
      error: () => this.cancellationRequests.set([]),
    });
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.startDate = '';
    this.endDate = '';
    this.statusFilter = 'ALL';
    this.loadSales();
  }

  selectSale(sale: Sale): void {
    this.salesApi.getSaleById(sale.id).subscribe({
      next: (full) => this.selectedSale.set(full),
      error: () => this.selectedSale.set(sale),
    });
  }

  printDocument(invoiceNumber: string, ticket = false, duplicate = false): void {
    this.salesApi.getInvoiceHtml(invoiceNumber, ticket, duplicate).subscribe({
      next: (html) => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(html);
          printWindow.document.close();
          setTimeout(() => printWindow.print(), 250);
        }
      },
      error: () => {
        // Fallback PDF blob
        this.salesApi.getInvoiceDocument(invoiceNumber, ticket, duplicate).subscribe({
          next: (blob) => {
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
          },
        });
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
          productName: it.productName,
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
        items: lines as any,
      })
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.showCancelModal = false;
          this.refreshAll();
          this.selectedSale.set(null);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.actionError = err?.error?.message || 'Erreur lors de l’émission de l’avoir.';
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
          alert('Demande d’annulation transmise au Pharmacien Responsable.');
        },
        error: (err) => {
          this.isSubmitting = false;
          this.actionError = err?.error?.message || 'Erreur lors de l’envoi de la demande.';
        },
      });
  }

  acceptCancellationRequest(req: any): void {
    if (!req?.id) return;
    this.isSubmitting = true;
    this.actionError = '';
    this.salesApi.approveCancellationRequest(req.id).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.refreshAll();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.actionError = err?.error?.message || 'Erreur lors de l’émission de l’avoir.';
      },
    });
  }

  rejectCancellationRequest(req: any): void {
    if (!req?.id) return;
    const reason = prompt('Motif du refus :');
    if (!reason?.trim()) return;
    this.isSubmitting = true;
    this.salesApi.rejectCancellationRequest(req.id, reason.trim()).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.refreshAll();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.actionError = err?.error?.message || 'Erreur lors du refus de la demande.';
      },
    });
  }

  openResolveConflictModal(conflict: any): void {
    this.conflictToResolve = conflict;
    this.conflictAction = 'ANNULER_VENTE';
    this.conflictReason = '';
    this.actionError = '';
    this.showConflictModal = true;
  }

  submitConflictResolution(): void {
    if (!this.conflictToResolve || !this.conflictReason.trim()) return;
    this.isSubmitting = true;
    this.actionError = '';

    const dto: ResolveConflictDto = {
      action: this.conflictAction,
      reason: this.conflictReason.trim(),
    };

    this.salesApi.resolveConflict(this.conflictToResolve.id, dto).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.showConflictModal = false;
        this.refreshAll();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.actionError = err?.error?.message || 'Erreur lors de la résolution du conflit.';
      },
    });
  }
}
