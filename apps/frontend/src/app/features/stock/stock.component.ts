import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
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
import { MatCardModule } from '@angular/material/card';
import { StockApiService, ProductStockSummary } from '../../core/api/services/stock-api.service';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { AlertService } from '../../core/services/alert.service';
import { PermissionService } from '../../core/permissions/permission.service';
import { HasPermissionDirective } from '../../core/permissions/has-permission.directive';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PinReauthDialogComponent } from '../../shared/components/pin-reauth-dialog/pin-reauth-dialog.component';
import { CreateInventoryDialogComponent } from './create-inventory-dialog.component';
import { InventoryCountDialogComponent } from './inventory-count-dialog.component';
import {
  Product,
  ProductLot,
  StockMovement,
  MovementType,
  PendingAdjustment,
  StockAlertsSummary,
  CumpValuationSummary,
  ControlledSubstanceRegisterEntry,
  InventorySession,
} from '@vhp/shared';

@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
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
    MatCardModule,
    HasPermissionDirective,
  ],
  template: `
    <div class="page-container">
      <!-- En-tête -->
      <div class="page-header">
        <div class="header-titles">
          <h1>Gestion des Stocks & Lots</h1>
          <p class="subtitle">Lots, inventaires, traçabilité, valorisation du stock et alertes</p>
        </div>
        <div class="header-actions">
          <a mat-stroked-button color="primary" routerLink="/reception">
            <mat-icon>input</mat-icon>
            <span>Nouvelle Réception</span>
          </a>
        </div>
      </div>

      <!-- Navigation par Onglets -->
      <mat-tab-group [(selectedIndex)]="activeTab" (selectedIndexChange)="onTabChanged($event)" class="stock-tabs">
        <!-- ========================================== -->
        <!-- 1. VUE STOCK & LOTS EN TEMPS RÉEL (STK-02) -->
        <!-- ========================================== -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon">inventory_2</mat-icon>
            <span>État des Stocks & Lots</span>
          </ng-template>

          <div class="tab-body">
            <div class="toolbar-card">
              <mat-form-field appearance="outline" class="search-field">
                <mat-label>Rechercher un produit (Nom, DCI, Code-barres)...</mat-label>
                <mat-icon matPrefix>search</mat-icon>
                <input matInput [(ngModel)]="stockSearch" (ngModelChange)="filterStockProducts()" />
              </mat-form-field>
              <button mat-icon-button (click)="loadProductsWithStock()" matTooltip="Actualiser">
                <mat-icon>refresh</mat-icon>
              </button>
            </div>

            <div class="table-card">
              @if (loadingStock()) {
                <div class="loading-state">
                  <mat-spinner diameter="40"></mat-spinner>
                  <p>Chargement des stocks et lots...</p>
                </div>
              } @else if (filteredStockProducts().length === 0) {
                <div class="empty-state">
                  <mat-icon>shelves</mat-icon>
                  <p>Aucun produit ne correspond à la recherche.</p>
                </div>
              } @else {
                <div class="products-accordion">
                  @for (prod of filteredStockProducts(); track prod.id) {
                    <div class="product-stock-card" [class.expanded]="isExpanded(prod.id)">
                      <div class="product-stock-header" (click)="toggleExpand(prod.id)">
                        <div class="prod-col main">
                          <mat-icon class="expand-arrow">{{ isExpanded(prod.id) ? 'expand_more' : 'chevron_right' }}</mat-icon>
                          <div>
                            <span class="prod-name">{{ prod.name }}</span>
                            <span class="prod-dci">{{ prod.dci }} {{ prod.dosage }}</span>
                          </div>
                        </div>

                        <div class="prod-col">
                          <span class="col-label">Emplacement</span>
                          <span class="col-val">{{ prod.storageLocation || 'Rayon général' }}</span>
                        </div>

                        <div class="prod-col">
                          <span class="col-label">Coût moyen unitaire</span>
                          <span class="col-val">{{ prod.cumpCdf | number:'1.0-0' }} CDF</span>
                        </div>

                        <div class="prod-col">
                          <span class="col-label">Stock total</span>
                          <span class="stock-total-badge" [class.low]="prod.totalStock <= prod.minAlertThreshold" [class.zero]="prod.totalStock === 0">
                            {{ prod.totalStock }} {{ prod.sellingUnit }}
                          </span>
                        </div>
                      </div>

                      <!-- Détail des lots du produit -->
                      @if (isExpanded(prod.id)) {
                        <div class="product-lots-detail">
                          @if (!prod.lots || prod.lots.length === 0) {
                            <div class="empty-lots">
                              <span>Aucun lot en stock pour cette référence.</span>
                            </div>
                          } @else {
                            <table class="lots-table">
                              <thead>
                                <tr>
                                  <th>N° de Lot</th>
                                  <th>Date de Péremption</th>
                                  <th>Quantité Disponible</th>
                                  <th>Emplacement</th>
                                  <th>Prix d'Achat unitaire</th>
                                  <th>Statut</th>
                                  <th class="text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                @for (lot of prod.lots; track lot.id) {
                                  <tr [class.lot-quarantined]="lot.isQuarantined">
                                    <td>
                                      <span class="lot-number">{{ lot.lotNumber }}</span>
                                    </td>
                                    <td>
                                      <div class="expiry-cell">
                                        <span>{{ lot.expiryDate | date:'dd/MM/yyyy' }}</span>
                                        <span class="expiry-pill" [attr.data-color]="getExpiryColor(lot.expiryDate)">
                                          {{ getExpiryLabel(lot.expiryDate) }}
                                        </span>
                                      </div>
                                    </td>
                                    <td>
                                      <span class="lot-qty">{{ lot.currentQuantity }} / {{ lot.initialQuantity }}</span>
                                    </td>
                                    <td>{{ lot.purchasePriceCdf | number:'1.0-0' }} CDF</td>
                                    <td>
                                      @if (lot.isQuarantined) {
                                        <span class="quarantine-badge">
                                          <mat-icon>shield</mat-icon> En quarantaine
                                        </span>
                                      } @else {
                                        <span class="available-badge">Disponible selon la date de péremption</span>
                                      }
                                    </td>
                                    <td class="text-right">
                                      <button
                                        mat-stroked-button
                                        [color]="lot.isQuarantined ? 'primary' : 'warn'"
                                        class="btn-sm"
                                        *hasPermission="'stock.ajuster'"
                                        (click)="toggleQuarantine(lot)"
                                      >
                                        <mat-icon>{{ lot.isQuarantined ? 'lock_open' : 'lock' }}</mat-icon>
                                        <span>{{ lot.isQuarantined ? 'Débloquer' : 'Mettre en Quarantaine' }}</span>
                                      </button>
                                    </td>
                                  </tr>
                                }
                              </tbody>
                            </table>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </mat-tab>

        <!-- ========================================== -->
        <!-- 2. JOURNAL DES MOUVEMENTS (STK-06)         -->
        <!-- ========================================== -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon">history</mat-icon>
            <span>Journal des Mouvements</span>
          </ng-template>

          <div class="tab-body">
            <div class="toolbar-card">
              <mat-form-field appearance="outline" class="filter-select">
                <mat-label>Type de Mouvement</mat-label>
                <mat-select [(ngModel)]="movementTypeFilter" (selectionChange)="loadMovements()">
                  <mat-option value="">Tous les types</mat-option>
                  <mat-option value="RECEPTION_FOURNISSEUR">Réception Fournisseur</mat-option>
                  <mat-option value="SORTIE_VENTE">Sortie Vente</mat-option>
                  <mat-option value="CASSE_PERTE">Casse / Perte</mat-option>
                  <mat-option value="PEREMPTION">Péremption</mat-option>
                  <mat-option value="DON">Don</mat-option>
                  <mat-option value="USAGE_INTERNE">Usage Interne</mat-option>
                  <mat-option value="AJUSTEMENT_POSITIF">Ajustement Positif</mat-option>
                  <mat-option value="AJUSTEMENT_NEGATIF">Ajustement Négatif</mat-option>
                </mat-select>
              </mat-form-field>
              <button mat-icon-button (click)="loadMovements()" matTooltip="Actualiser">
                <mat-icon>refresh</mat-icon>
              </button>
            </div>

            <div class="table-card">
              @if (loadingMovements()) {
                <div class="loading-state">
                  <mat-spinner diameter="40"></mat-spinner>
                  <p>Chargement du journal inaltérable...</p>
                </div>
              } @else if (movements().length === 0) {
                <div class="empty-state">
                  <mat-icon>event_note</mat-icon>
                  <p>Aucun mouvement trouvé.</p>
                </div>
              } @else {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Date & Heure</th>
                      <th>Produit & Lot</th>
                      <th>Type de Mouvement</th>
                      <th>Sens & Quantité</th>
                      <th>Utilisateur</th>
                      <th>Motif / Réf</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (m of movements(); track m.id) {
                      <tr>
                        <td>{{ m.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
                        <td>
                          <div class="move-prod-info">
                            <span class="prod-name">{{ m.productName }}</span>
                            <span class="lot-badge">Lot {{ m.lotNumber }}</span>
                          </div>
                        </td>
                        <td>
                          <span class="move-type-pill">{{ formatMovementType(m.type) }}</span>
                        </td>
                        <td>
                          <span class="qty-pill" [class.in]="m.direction === 'IN'" [class.out]="m.direction === 'OUT'">
                            {{ m.direction === 'IN' ? '+' : '-' }}{{ m.quantity }}
                          </span>
                        </td>
                        <td>{{ m.userName }}</td>
                        <td>{{ m.reason }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        </mat-tab>

        <!-- ========================================== -->
        <!-- 3. SORTIES & AJUSTEMENTS (STK-05, RG-11)   -->
        <!-- ========================================== -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon">rule</mat-icon>
            <span>Sorties & Ajustements</span>
          </ng-template>

          <div class="tab-body">
            <div class="adjustments-layout">
              <!-- Formulaire de sortie ou demande d'ajustement -->
              <mat-card class="form-card">
                <mat-card-header>
                  <mat-card-title>Déclarer une sortie ou un ajustement</mat-card-title>
                </mat-card-header>
                <mat-card-content class="form-content">
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Sélectionner le lot concerné</mat-label>
                    <mat-select [(ngModel)]="adjLotId" required>
                      @for (l of allLots(); track l.id) {
                        <mat-option [value]="l.id">
                          {{ l.lotNumber }} (Disp: {{ l.currentQuantity }}, Exp: {{ l.expiryDate | date:'MM/yy' }})
                        </mat-option>
                      }
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Type d'opération</mat-label>
                    <mat-select [(ngModel)]="adjType">
                      <mat-option value="DEMANDE_AJUSTEMENT">Demande d'ajustement (soumise à validation du pharmacien)</mat-option>
                      <mat-option value="CASSE_PERTE">Casse ou Perte</mat-option>
                      <mat-option value="PEREMPTION">Mise au rebut pour péremption</mat-option>
                      <mat-option value="DON">Don caritatif</mat-option>
                      <mat-option value="USAGE_INTERNE">Usage interne officine</mat-option>
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Quantité</mat-label>
                    <input matInput type="number" min="1" [(ngModel)]="adjQuantity" required />
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Motif obligatoire *</mat-label>
                    <textarea matInput rows="2" [(ngModel)]="adjReason" placeholder="Expliquez la cause exacte du mouvement..." required></textarea>
                  </mat-form-field>

                  <button
                    mat-flat-button
                    color="primary"
                    [disabled]="!adjLotId || adjQuantity < 1 || !adjReason.trim() || submittingAdjustment()"
                    (click)="submitAdjustmentForm()"
                  >
                    @if (submittingAdjustment()) {
                      <mat-spinner diameter="18" class="inline-spinner"></mat-spinner>
                    }
                    <span>Soumettre l'opération</span>
                  </button>
                </mat-card-content>
              </mat-card>

              <!-- Section Pharmacien : Ajustements en attente de validation -->
              <div class="pending-section">
                <h3>Ajustements en attente de validation du pharmacien</h3>
                @if (loadingPending()) {
                  <mat-spinner diameter="30"></mat-spinner>
                } @else if (pendingAdjustments().length === 0) {
                  <div class="empty-state-sm">
                    <mat-icon>check_circle</mat-icon>
                    <span>Aucune demande d'ajustement en attente.</span>
                  </div>
                } @else {
                  <div class="pending-list">
                    @for (adj of pendingAdjustments(); track adj.id) {
                      <mat-card class="pending-card">
                        <div class="pending-header">
                          <div>
                            <span class="pending-prod">{{ adj.productName }}</span>
                            <span class="pending-lot">Lot {{ adj.lotNumber }}</span>
                          </div>
                          <span class="variance-tag" [class.pos]="adj.variance > 0" [class.neg]="adj.variance < 0">
                            Écart: {{ adj.variance > 0 ? '+' : '' }}{{ adj.variance }}
                          </span>
                        </div>

                        <div class="pending-meta">
                          <span>Demandé par <strong>{{ adj.requestedByName }}</strong> le {{ adj.requestedAt | date:'dd/MM/yyyy HH:mm' }}</span>
                          <span class="pending-reason">« {{ adj.reason }} »</span>
                        </div>

                        <div class="pending-actions" *hasPermission="'stock.valider_ajustement'">
                          <button mat-flat-button color="primary" class="btn-sm" (click)="approveAdjustment(adj, true)">
                            <mat-icon>check</mat-icon> Valider
                          </button>
                          <button mat-stroked-button color="warn" class="btn-sm" (click)="approveAdjustment(adj, false)">
                            <mat-icon>close</mat-icon> Rejeter
                          </button>
                        </div>
                      </mat-card>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- ========================================== -->
        <!-- 4. ALERTES & RÉAPPROVISIONNEMENT (STK-08)  -->
        <!-- ========================================== -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon">notifications_active</mat-icon>
            <span>Alertes & Réapprovisionnement</span>
          </ng-template>

          <div class="tab-body">
            @if (loadingAlerts()) {
              <div class="loading-state"><mat-spinner diameter="40"></mat-spinner></div>
            } @else {
              <!-- Cartes des compteurs -->
              <div class="alerts-summary-grid">
                <div class="alert-stat-card danger">
                  <span class="stat-number">{{ alertsSummary()?.outOfStock?.length || 0 }}</span>
                  <span class="stat-title">Ruptures de stock</span>
                </div>
                <div class="alert-stat-card warning">
                  <span class="stat-number">{{ alertsSummary()?.lowStock?.length || 0 }}</span>
                  <span class="stat-title">Stocks sous le seuil</span>
                </div>
                <div class="alert-stat-card exp-30">
                  <span class="stat-number">{{ alertsSummary()?.expiringIn30Days?.length || 0 }}</span>
                  <span class="stat-title">Péremption &lt; 30 jours</span>
                </div>
                <div class="alert-stat-card exp-60">
                  <span class="stat-number">{{ alertsSummary()?.expiringIn60Days?.length || 0 }}</span>
                  <span class="stat-title">Péremption &lt; 60 jours</span>
                </div>
                <div class="alert-stat-card exp-90">
                  <span class="stat-number">{{ alertsSummary()?.expiringIn90Days?.length || 0 }}</span>
                  <span class="stat-title">Péremption &lt; 90 jours</span>
                </div>
              </div>

              <div class="table-card mt-4">
                <div class="card-header-bar">
                  <h3>Lots proches de la péremption</h3>
                </div>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Lot</th>
                      <th>Péremption</th>
                      <th>Qté</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (lot of expiryActionLots(); track lot.id) {
                      <tr>
                        <td>{{ lot.productName || 'Produit' }}</td>
                        <td>{{ lot.lotNumber }}</td>
                        <td>{{ lot.expiryDate | date:'dd/MM/yyyy' }}</td>
                        <td>{{ lot.currentQuantity }}</td>
                        <td class="text-right">
                          <button mat-button (click)="handleExpiryAction(lot, 'PROMOTION')">Promotion</button>
                          <button mat-button (click)="handleExpiryAction(lot, 'RETOUR')">Retour fournisseur</button>
                          <button mat-button color="warn" (click)="handleExpiryAction(lot, 'PERTE')">Sortie en perte</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <!-- Liste de réapprovisionnement -->
              <div class="table-card mt-4">
                <div class="card-header-bar">
                  <h3>Suggestions de réapprovisionnement</h3>
                  <button mat-stroked-button color="primary" (click)="exportReorderCsv()">
                    <mat-icon>download</mat-icon>
                    <span>Exporter les données</span>
                  </button>
                </div>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>DCI / Dosage</th>
                      <th>Stock Actuel</th>
                      <th>Seuil Minimal</th>
                      <th>Stock Sécurité</th>
                      <th>Quantité suggérée</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of reorderList(); track item.id) {
                      <tr>
                        <td><strong>{{ item.name }}</strong></td>
                        <td>{{ item.dci }} {{ item.dosage }}</td>
                        <td>
                          <span class="stock-num" [class.zero]="item.currentStock === 0">{{ item.currentStock }}</span>
                        </td>
                        <td>{{ item.minAlertThreshold }}</td>
                        <td>{{ item.securityStock }}</td>
                        <td>
                          <span class="suggested-num">{{ item.suggestedOrderQuantity }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </mat-tab>

        <!-- ========================================== -->
        <!-- 5. INVENTAIRES PHYSIQUES (STK-11, STK-12)  -->
        <!-- ========================================== -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon">checklist</mat-icon>
            <span>Inventaire Physique</span>
          </ng-template>

          <div class="tab-body">
            <div class="toolbar-card">
              <button mat-flat-button color="primary" *hasPermission="'stock.inventaire'" (click)="openCreateInventory()">
                <mat-icon>add</mat-icon>
                <span>Nouvel Inventaire</span>
              </button>
            </div>

            <div class="table-card">
              @if (loadingInventories()) {
                <div class="loading-state"><mat-spinner diameter="40"></mat-spinner></div>
              } @else if (inventories().length === 0) {
                <div class="empty-state">
                  <mat-icon>inventory</mat-icon>
                  <p>Aucun inventaire enregistré.</p>
                </div>
              } @else {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Type</th>
                      <th>Date début</th>
                      <th>Lignes comptées</th>
                      <th>Statut</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (inv of inventories(); track inv.id) {
                      <tr>
                        <td><strong>{{ inv.reference }}</strong></td>
                        <td>{{ inv.type || 'COMPLET' }}</td>
                        <td>{{ (inv.createdAt || inv.validatedAt) | date:'dd/MM/yyyy HH:mm' }}</td>
                        <td>{{ inv.linesCount || inv.lines.length }} réf(s)</td>
                        <td>
                          <span class="order-status-badge" [attr.data-status]="inv.status">{{ inv.status }}</span>
                        </td>
                        <td class="text-right">
                          @if (inv.status === 'EN_COURS') {
                            <button mat-button *hasPermission="'stock.inventaire'" (click)="openInventoryCount(inv)">
                              Saisir le comptage
                            </button>
                            <button mat-button color="primary" *hasPermission="'stock.valider_inventaire'" (click)="validateInventory(inv)">
                              Valider (Pharmacien)
                            </button>
                            <button mat-button color="warn" *hasPermission="'stock.valider_inventaire'" (click)="cancelInventory(inv)">
                              Annuler
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

        <!-- ========================================== -->
        <!-- 6. REGISTRE DES CONTRÔLÉS (STK-14)         -->
        <!-- ========================================== -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon">menu_book</mat-icon>
            <span>Registre des produits contrôlés</span>
          </ng-template>

          <div class="tab-body">
            <div class="table-card">
              @if (loadingControlled()) {
                <div class="loading-state"><mat-spinner diameter="40"></mat-spinner></div>
              } @else if (controlledRegister().length === 0) {
                <div class="empty-state">
                  <mat-icon>assignment</mat-icon>
                  <p>Aucun mouvement de produit stupéfiant ou contrôlé enregistré.</p>
                </div>
              } @else {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Produit & Dosage</th>
                      <th>N° Lot</th>
                      <th>Opération</th>
                      <th>Entrées</th>
                      <th>Sorties</th>
                      <th>Solde en stock</th>
                      <th>Bénéficiaire / Réf</th>
                      <th>Pharmacien</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (reg of controlledRegister(); track reg.id) {
                      <tr>
                        <td>{{ reg.date | date:'dd/MM/yyyy HH:mm' }}</td>
                        <td><strong>{{ reg.productName }}</strong> {{ reg.dosage }}</td>
                        <td>{{ reg.lotNumber }}</td>
                        <td>{{ formatMovementType(reg.movementType) }}</td>
                        <td class="text-success">{{ reg.quantityIn > 0 ? '+' + reg.quantityIn : '—' }}</td>
                        <td class="text-danger">{{ reg.quantityOut > 0 ? '-' + reg.quantityOut : '—' }}</td>
                        <td><strong>{{ reg.balance }}</strong></td>
                        <td>{{ reg.partyName }} ({{ reg.referenceNumber }})</td>
                        <td>{{ reg.userName }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        </mat-tab>

        <!-- ========================================== -->
        <!-- 7. VALORISATION AU CUMP (STK-10)          -->
        <!-- ========================================== -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon">account_balance_wallet</mat-icon>
            <span>Valorisation du stock</span>
          </ng-template>

          <div class="tab-body">
            @if (loadingValuation()) {
              <div class="loading-state"><mat-spinner diameter="40"></mat-spinner></div>
            } @else if (valuationSummary()) {
              <div class="valuation-cards-grid">
                <div class="val-card">
                  <span class="val-title">Valeur Totale du Stock (CDF)</span>
                  <span class="val-amount cdf">{{ valuationSummary()?.totalValuationCdf | number:'1.0-0' }} CDF</span>
                  <span class="val-sub">Recalculée selon le coût moyen du stock</span>
                </div>
                <div class="val-card">
                  <span class="val-title">Contre-valeur indicative (USD)</span>
                  <span class="val-amount usd">~ {{ valuationSummary()?.totalValuationUsd | number:'1.2-2' }} USD</span>
                  <span class="val-sub">Taux du jour</span>
                </div>
                <div class="val-card">
                  <span class="val-title">Quantité Totale en Rayon</span>
                  <span class="val-amount">{{ valuationSummary()?.totalStockUnits }} unités</span>
                  <span class="val-sub">{{ valuationSummary()?.lotsCount }} lots actifs</span>
                </div>
              </div>

              <div class="table-card mt-4">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Stock Actuel</th>
                      <th>Coût moyen unitaire (CDF)</th>
                      <th>Prix de Vente (CDF)</th>
                      <th>Valorisation Totale</th>
                      <th>Marge Estimée</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of valuationSummary()?.products; track item.productId) {
                      <tr>
                        <td><strong>{{ item.productName }}</strong></td>
                        <td>{{ item.totalStock }}</td>
                        <td>{{ item.cumpCdf | number:'1.0-0' }} CDF</td>
                        <td>{{ item.sellingPriceCdf | number:'1.0-0' }} CDF</td>
                        <td><strong>{{ item.totalValuationCdf | number:'1.0-0' }} CDF</strong></td>
                        <td>
                          <span class="margin-pill">{{ item.marginPercent | number:'1.1-1' }}%</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
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
      gap: 16px;
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
      align-items: center;
      gap: 16px;
      background: white;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .search-field {
      flex: 1;
    }
    .filter-select {
      width: 260px;
    }
    .table-card {
      background: white;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .products-accordion {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
    }
    .product-stock-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.2s ease;
    }
    .product-stock-card:hover {
      border-color: #cbd5e1;
    }
    .product-stock-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      cursor: pointer;
      user-select: none;
    }
    .prod-col {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .prod-col.main {
      flex: 2;
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }
    .prod-name {
      font-weight: 600;
      color: #0f172a;
    }
    .prod-dci {
      font-size: 0.8rem;
      color: #64748b;
    }
    .col-label {
      font-size: 0.75rem;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .col-val {
      font-weight: 500;
      color: #334155;
    }
    .stock-total-badge {
      font-weight: 700;
      color: #0f766e;
    }
    .stock-total-badge.low {
      color: #b45309;
    }
    .stock-total-badge.zero {
      color: #b91c1c;
    }
    .product-lots-detail {
      background: #f8fafc;
      padding: 12px 16px 16px;
      border-top: 1px solid #e2e8f0;
    }
    .lots-table {
      width: 100%;
      min-width: 650px;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .lots-table th {
      padding: 8px 12px;
      text-align: left;
      color: #475569;
      font-weight: 600;
      border-bottom: 1px solid #e2e8f0;
    }
    .lots-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .expiry-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .expiry-pill {
      font-size: 0.75rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .expiry-pill[data-color="red"] {
      background: #fee2e2;
      color: #b91c1c;
    }
    .expiry-pill[data-color="orange"] {
      background: #ffedd5;
      color: #c2410c;
    }
    .expiry-pill[data-color="yellow"] {
      background: #fef9c3;
      color: #a16207;
    }
    .expiry-pill[data-color="green"] {
      background: #dcfce7;
      color: #15803d;
    }
    .quarantine-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: #fee2e2;
      color: #991b1b;
      border-radius: 4px;
      font-weight: 600;
    }
    .available-badge {
      display: inline-block;
      padding: 3px 8px;
      background: #dcfce7;
      color: #166534;
      border-radius: 4px;
      font-weight: 600;
    }
    .lot-quarantined {
      background: #fff1f2;
    }
    .data-table {
      width: 100%;
      min-width: 650px;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    .data-table th {
      background: #f8fafc;
      padding: 12px 14px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
    }
    .data-table td {
      padding: 10px 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .qty-pill {
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .qty-pill.in {
      background: #dcfce7;
      color: #15803d;
    }
    .qty-pill.out {
      background: #fee2e2;
      color: #b91c1c;
    }
    .move-type-pill {
      background: #f1f5f9;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .lot-badge {
      display: inline-block;
      font-size: 0.75rem;
      color: #64748b;
    }
    .adjustments-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .form-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px !important;
    }
    .pending-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .pending-section h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: #0f172a;
    }
    .pending-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .pending-card {
      padding: 12px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .pending-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pending-prod {
      font-weight: 600;
      color: #1e293b;
      margin-right: 8px;
    }
    .pending-lot {
      font-size: 0.8rem;
      color: #64748b;
    }
    .variance-tag {
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .variance-tag.pos { background: #dcfce7; color: #15803d; }
    .variance-tag.neg { background: #fee2e2; color: #b91c1c; }
    .pending-meta {
      font-size: 0.85rem;
      color: #475569;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pending-actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    .alerts-summary-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
    }
    .alert-stat-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .alert-stat-card.danger { border-left: 4px solid #ef4444; }
    .alert-stat-card.warning { border-left: 4px solid #f59e0b; }
    .alert-stat-card.exp-30 { border-left: 4px solid #f97316; }
    .alert-stat-card.exp-60 { border-left: 4px solid #eab308; }
    .alert-stat-card.exp-90 { border-left: 4px solid #84cc16; }
    .stat-number {
      font-size: 1.8rem;
      font-weight: 700;
      color: #0f172a;
    }
    .stat-title {
      font-size: 0.85rem;
      color: #64748b;
    }
    .card-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #e2e8f0;
    }
    .card-header-bar h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }
    .valuation-cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .val-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .val-title {
      font-size: 0.9rem;
      color: #64748b;
    }
    .val-amount {
      font-size: 1.6rem;
      font-weight: 700;
      color: #0f172a;
    }
    .val-amount.cdf { color: #0f766e; }
    .val-amount.usd { color: #0284c7; }
    .val-sub {
      font-size: 0.8rem;
      color: #94a3b8;
    }
    .margin-pill {
      background: #f0fdf4;
      color: #166534;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .btn-sm {
      padding: 0 10px;
      font-size: 0.8rem;
      height: 32px;
      line-height: 32px;
    }
    .text-right { text-align: right; }
    .w-full { width: 100%; }
    .mt-4 { margin-top: 16px; }
    .loading-state, .empty-state {
      padding: 48px;
      text-align: center;
      color: #64748b;
    }
    .empty-state-sm {
      padding: 24px;
      text-align: center;
      color: #64748b;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    @media (max-width: 1024px) {
      .alerts-summary-grid {
        grid-template-columns: repeat(3, 1fr);
      }
      .valuation-cards-grid {
        grid-template-columns: 1fr;
      }
      .adjustments-layout {
        grid-template-columns: 1fr;
      }
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
      .header-actions a {
        width: 100%;
        text-align: center;
      }
      .toolbar-card {
        flex-direction: column;
        align-items: stretch;
      }
      .filter-select {
        width: 100%;
      }
      .product-stock-header {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      .prod-col.main {
        flex-direction: column;
        align-items: flex-start;
      }
      .alerts-summary-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 480px) {
      .alerts-summary-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class StockComponent implements OnInit {
  private readonly stockApi = inject(StockApiService);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly alert = inject(AlertService);
  private readonly dialog = inject(MatDialog);
  public readonly perm = inject(PermissionService);

  activeTab = 0;
  expandedProductIds = new Set<string>();

  // Onglet 1: Stock & Lots
  readonly stockProducts = signal<any[]>([]);
  readonly filteredStockProducts = signal<any[]>([]);
  readonly loadingStock = signal<boolean>(false);
  stockSearch = '';

  // Onglet 2: Mouvements
  readonly movements = signal<StockMovement[]>([]);
  readonly loadingMovements = signal<boolean>(false);
  movementTypeFilter = '';

  // Onglet 3: Sorties & Ajustements
  readonly allLots = signal<ProductLot[]>([]);
  readonly pendingAdjustments = signal<PendingAdjustment[]>([]);
  readonly loadingPending = signal<boolean>(false);
  readonly submittingAdjustment = signal<boolean>(false);
  adjLotId = '';
  adjType = 'DEMANDE_AJUSTEMENT';
  adjQuantity = 1;
  adjReason = '';

  // Onglet 4: Alertes
  readonly alertsSummary = signal<StockAlertsSummary | null>(null);
  readonly reorderList = signal<any[]>([]);
  readonly loadingAlerts = signal<boolean>(false);

  // Onglet 5: Inventaires
  readonly inventories = signal<InventorySession[]>([]);
  readonly loadingInventories = signal<boolean>(false);

  // Onglet 6: Registre contrôlés
  readonly controlledRegister = signal<ControlledSubstanceRegisterEntry[]>([]);
  readonly loadingControlled = signal<boolean>(false);

  // Onglet 7: CUMP Valuation
  readonly valuationSummary = signal<CumpValuationSummary | null>(null);
  readonly loadingValuation = signal<boolean>(false);

  ngOnInit() {
    this.loadProductsWithStock();
    this.loadAllLots();
  }

  onTabChanged(index: number) {
    if (index === 1 && this.movements().length === 0) this.loadMovements();
    if (index === 2) this.loadPendingAdjustments();
    if (index === 3 && !this.alertsSummary()) this.loadAlerts();
    if (index === 4 && this.inventories().length === 0) this.loadInventories();
    if (index === 5 && this.controlledRegister().length === 0) this.loadControlledRegister();
    if (index === 6 && !this.valuationSummary()) this.loadValuation();
  }

  // ==========================================
  // STOCKS & LOTS
  // ==========================================

  loadProductsWithStock() {
    this.loadingStock.set(true);
    this.catalogApi.getProducts({ page: 1, limit: 100 }).subscribe({
      next: (res: any) => {
        const prods: any[] = res.items || res.data || [];
        this.stockApi.getLots().subscribe({
          next: (lots) => {
            const mapped = prods.map((p: any) => {
              const prodLots = lots.filter((l) => l.productId === p.id);
              const totalStock = prodLots.reduce((sum, l) => sum + (l.currentQuantity || 0), 0);
              return {
                ...p,
                lots: prodLots,
                totalStock,
              };
            });
            this.stockProducts.set(mapped);
            this.filterStockProducts();
            this.loadingStock.set(false);
          },
          error: () => this.loadingStock.set(false),
        });
      },
      error: () => this.loadingStock.set(false),
    });
  }

  filterStockProducts() {
    const term = this.stockSearch.trim().toLowerCase();
    if (!term) {
      this.filteredStockProducts.set(this.stockProducts());
      return;
    }
    const filtered = this.stockProducts().filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.dci && p.dci.toLowerCase().includes(term)) ||
        (p.barcodes && p.barcodes.some((b: any) => (b.barcode || b).includes(term))),
    );
    this.filteredStockProducts.set(filtered);
  }

  toggleExpand(id: string) {
    if (this.expandedProductIds.has(id)) {
      this.expandedProductIds.delete(id);
    } else {
      this.expandedProductIds.add(id);
    }
  }

  isExpanded(id: string): boolean {
    return this.expandedProductIds.has(id);
  }

  getExpiryColor(dateStr: string): 'red' | 'orange' | 'yellow' | 'green' {
    const exp = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (exp <= today) return 'red';
    const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (diff < 30) return 'orange';
    if (diff < 60) return 'yellow';
    return 'green';
  }

  getExpiryLabel(dateStr: string): string {
    const exp = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (exp <= today) return 'Périmé';
    const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (diff < 30) return `< ${diff} j`;
    if (diff < 60) return `< 60 j`;
    return 'Conforme';
  }

  toggleQuarantine(lot: ProductLot) {
    const action = lot.isQuarantined ? 'débloquer' : 'mettre en quarantaine';
    const confirm = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `${action.toUpperCase()} le lot ${lot.lotNumber}`,
        message: `Voulez-vous ${action} ce lot ? ${lot.isQuarantined ? 'Il sera à nouveau sélectionnable à la vente.' : 'Il sera exclu de toute vente.'}`,
      },
    });

    confirm.afterClosed().subscribe((res) => {
      if (res) {
        this.stockApi.quarantineLot(lot.id, { quarantined: !lot.isQuarantined, reason: 'Action utilisateur' }).subscribe({
          next: () => {
            this.alert.success(`Lot ${lot.lotNumber} mis à jour.`);
            this.loadProductsWithStock();
          },
          error: (err) => this.alert.error(err.error?.message || 'Erreur lors de la mise en quarantaine.'),
        });
      }
    });
  }

  // ==========================================
  // MOUVEMENTS
  // ==========================================

  loadMovements() {
    this.loadingMovements.set(true);
    const query = this.movementTypeFilter ? { type: this.movementTypeFilter, limit: 100 } : { limit: 100 };
    this.stockApi.getMovements(query).subscribe({
      next: (res: any) => {
        this.movements.set(res.items || res.data || res.movements || []);
        this.loadingMovements.set(false);
      },
      error: () => this.loadingMovements.set(false),
    });
  }

  formatMovementType(type: MovementType): string {
    switch (type) {
      case 'RECEPTION_FOURNISSEUR': return 'Réception Fournisseur';
      case 'SORTIE_VENTE': return 'Sortie Vente';
      case 'CASSE_PERTE': return 'Casse / Perte';
      case 'PEREMPTION': return 'Péremption';
      case 'DON': return 'Don Caritatif';
      case 'USAGE_INTERNE': return 'Usage Interne';
      case 'AJUSTEMENT_POSITIF': return 'Ajustement (+)';
      case 'AJUSTEMENT_NEGATIF': return 'Ajustement (-)';
      case 'RETOUR_CLIENT': return 'Retour Client';
      default: return type;
    }
  }

  // ==========================================
  // SORTIES & AJUSTEMENTS
  // ==========================================

  loadAllLots() {
    this.stockApi.getLots().subscribe({
      next: (lots) => this.allLots.set(lots),
    });
  }

  loadPendingAdjustments() {
    this.loadingPending.set(true);
    this.stockApi.getPendingAdjustments().subscribe({
      next: (data) => {
        this.pendingAdjustments.set(data);
        this.loadingPending.set(false);
      },
      error: () => this.loadingPending.set(false),
    });
  }

  submitAdjustmentForm() {
    if (!this.adjLotId || this.adjQuantity < 1 || !this.adjReason.trim()) return;

    this.submittingAdjustment.set(true);

    if (this.adjType === 'DEMANDE_AJUSTEMENT') {
      // Demande d'ajustement soumise à validation pharmacien (RG-11)
      this.stockApi.requestAdjustment({
        lotId: this.adjLotId,
        variance: -Number(this.adjQuantity),
        reason: this.adjReason.trim(),
      }).subscribe({
        next: () => {
          this.submittingAdjustment.set(false);
          this.alert.success("Demande d'ajustement créée avec statut DEMANDE. Le pharmacien doit valider.");
          this.adjReason = '';
          this.loadPendingAdjustments();
        },
        error: (err) => {
          this.submittingAdjustment.set(false);
          this.alert.error(err.error?.message || 'Erreur lors de la demande.');
        },
      });
    } else {
      // Sortie directe motivée (CASSE, PERTE, DON, etc.)
      this.stockApi.createMovement({
        lotId: this.adjLotId,
        type: this.adjType as MovementType,
        quantity: Number(this.adjQuantity),
        reason: this.adjReason.trim(),
      }).subscribe({
        next: () => {
          this.submittingAdjustment.set(false);
          this.alert.success(`Sortie de stock enregistrée avec succès.`);
          this.adjReason = '';
          this.loadProductsWithStock();
          this.loadMovements();
        },
        error: (err) => {
          this.submittingAdjustment.set(false);
          this.alert.error(err.error?.message || 'Erreur lors de la sortie.');
        },
      });
    }
  }

  approveAdjustment(adj: PendingAdjustment, approve: boolean) {
    const pinRef = this.dialog.open(PinReauthDialogComponent, {
      data: {
        action: approve ? 'VALIDER_AJUSTEMENT_STOCK' : 'REJETER_AJUSTEMENT_STOCK',
        actionLabel: approve ? 'Valider l’ajustement' : 'Rejeter l’ajustement',
      },
    });
    pinRef.afterClosed().subscribe((result) => {
      if (!result?.valid) return;
      this.stockApi.approveAdjustment(adj.id, {
        action: approve ? 'APPROVE' : 'REJECT',
        pharmacistComment: approve ? 'Validé par le pharmacien' : 'Rejeté par le pharmacien',
      }).subscribe({
        next: () => {
          this.alert.success(approve ? 'Ajustement validé et mouvement généré.' : 'Ajustement rejeté.');
          this.loadPendingAdjustments();
          this.loadProductsWithStock();
        },
        error: (err) => this.alert.error(err.error?.message || 'Erreur lors du traitement.'),
      });
    });
  }

  // ==========================================
  // ALERTES
  // ==========================================

  loadAlerts() {
    this.loadingAlerts.set(true);
    this.stockApi.getAlerts().subscribe({
      next: (summary: any) => {
        this.alertsSummary.set(summary);
        this.reorderList.set(summary.reorderList || summary.lowStock || []);
        this.loadingAlerts.set(false);
      },
      error: () => this.loadingAlerts.set(false),
    });
  }

  exportReorderCsv() {
    const list = this.reorderList();
    if (list.length === 0) {
      this.alert.info('Aucun article à commander.');
      return;
    }
    const headers = 'Produit,DCI,Dosage,Stock Actuel,Seuil Alerte,Stock Sécurité,Quantité Suggérée\n';
    const rows = list
      .map((i: any) => {
        const name = i.name || i.productName || 'Produit';
        const dci = i.dci || '';
        const dosage = i.dosage || '';
        const currentStock = i.currentStock ?? i.totalStock ?? 0;
        const minAlert = i.minAlertThreshold ?? 0;
        const secStock = i.securityStock ?? 0;
        const sugg = i.suggestedOrderQuantity ?? i.reorderQuantity ?? 0;
        return `"${name}","${dci}","${dosage}",${currentStock},${minAlert},${secStock},${sugg}`;
      })
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reapprovisionnement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ==========================================
  // INVENTAIRES
  // ==========================================

  loadInventories() {
    this.loadingInventories.set(true);
    this.stockApi.getInventories().subscribe({
      next: (data) => {
        this.inventories.set(data);
        this.loadingInventories.set(false);
      },
      error: () => this.loadingInventories.set(false),
    });
  }

  openCreateInventory() {
    const ref = this.dialog.open(CreateInventoryDialogComponent, { width: '520px' });
    ref.afterClosed().subscribe((dto) => {
      if (!dto) return;
      this.stockApi.createInventory(dto).subscribe({
        next: (inv) => {
          this.alert.success(`Inventaire ${inv.reference} créé (${inv.type || dto.type}).`);
          this.loadInventories();
          this.openInventoryCount(inv);
        },
        error: (err) => this.alert.error(err.error?.message || "Erreur de création de l'inventaire."),
      });
    });
  }

  openInventoryCount(inv: InventorySession) {
    this.dialog.open(InventoryCountDialogComponent, {
      width: '920px',
      data: { inventoryId: inv.id },
    }).afterClosed().subscribe((saved) => {
      if (saved) this.loadInventories();
    });
  }

  expiryActionLots(): ProductLot[] {
    const s = this.alertsSummary();
    if (!s) return [];
    return [...(s.expiringIn30Days || []), ...(s.expiringIn60Days || []), ...(s.expiringIn90Days || [])];
  }

  handleExpiryAction(lot: ProductLot, action: 'PROMOTION' | 'RETOUR' | 'PERTE') {
    if (action === 'PROMOTION') {
      this.alert.info(`Lot ${lot.lotNumber} marqué pour promotion. Ajustez le prix dans le catalogue.`);
      return;
    }
    const type = action === 'RETOUR' ? 'RETOUR_FOURNISSEUR' : 'PEREMPTION';
    const reason =
      action === 'RETOUR'
        ? `Retour fournisseur suite à péremption proche (UC-07) — lot ${lot.lotNumber}`
        : `Sortie en perte pour péremption (UC-07) — lot ${lot.lotNumber}`;
    this.stockApi.createMovement({
      lotId: lot.id,
      type,
      quantity: lot.currentQuantity,
      reason,
    }).subscribe({
      next: () => {
        this.alert.success(`Mouvement ${type} enregistré pour le lot ${lot.lotNumber}.`);
        this.loadAlerts();
        this.loadProductsWithStock();
      },
      error: (err) => this.alert.error(err.error?.message || 'Action impossible sur ce lot.'),
    });
  }

  validateInventory(inv: InventorySession) {
    const pinRef = this.dialog.open(PinReauthDialogComponent, {
      data: { action: 'VALIDER_INVENTAIRE', actionLabel: `Valider ${inv.reference}` },
    });
    pinRef.afterClosed().subscribe((result) => {
      if (!result?.valid) return;
      this.stockApi.validateInventory(inv.id, { justification: 'Comptage validé par le pharmacien' }).subscribe({
        next: () => {
          this.alert.success(`Inventaire ${inv.reference} validé. Les ajustements ont été générés.`);
          this.loadInventories();
          this.loadProductsWithStock();
        },
        error: (err) => this.alert.error(err.error?.message || "Erreur de validation de l'inventaire."),
      });
    });
  }

  cancelInventory(inv: InventorySession) {
    this.stockApi.cancelInventory(inv.id, 'Annulation par le pharmacien sans aucun mouvement').subscribe({
      next: () => {
        this.alert.info(`Inventaire ${inv.reference} annulé. Aucun mouvement n’a été généré.`);
        this.loadInventories();
      },
      error: (err) => this.alert.error(err.error?.message || "Erreur d'annulation."),
    });
  }

  // ==========================================
  // REGISTRE CONTRÔLÉ (STK-14)
  // ==========================================

  loadControlledRegister() {
    this.loadingControlled.set(true);
    this.stockApi.getControlledRegister().subscribe({
      next: (data) => {
        this.controlledRegister.set(data);
        this.loadingControlled.set(false);
      },
      error: () => this.loadingControlled.set(false),
    });
  }

  // ==========================================
  // VALORISATION AU CUMP (STK-10)
  // ==========================================

  loadValuation() {
    this.loadingValuation.set(true);
    this.stockApi.getCumpValuation().subscribe({
      next: (data) => {
        this.valuationSummary.set(data);
        this.loadingValuation.set(false);
      },
      error: () => this.loadingValuation.set(false),
    });
  }
}
