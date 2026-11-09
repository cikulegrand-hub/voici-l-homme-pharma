import { Component, signal, computed, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  Product,
  PaymentMethod,
  Customer,
  CurrencyCode,
  POS_SHORTCUTS,
  POS_ERROR_MESSAGES,
  OfflineSalePayload,
} from '@vhp/shared';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { QuickCustomerFormComponent } from '../customers/quick-customer-form.component';
import { PrescriptionSelectorComponent } from '../customers/prescription-selector.component';
import { CustomersApiService } from '../../core/api/services/customers-api.service';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { SalesApiService } from '../../core/api/services/sales-api.service';
import { CashApiService } from '../../core/api/services/cash-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { CreateSaleRequestDto } from '../../core/api/generated/models';

export interface CartItem {
  product: Product;
  quantity: number;
  discountCdf: number;
  lotId?: string;
  lotNumber?: string;
  expiryDate?: string;
  availableStock?: number;
  isNearExpiry?: boolean;
  isControlled?: boolean;
  requiresPrescription?: boolean;
  stockWarning?: boolean;
}

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
  currency: CurrencyCode;
  mobileMoneyProvider?: 'M-PESA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY';
  transactionReference?: string;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    CurrencyFormatPipe,
    QuickCustomerFormComponent,
    PrescriptionSelectorComponent,
  ],
  providers: [DatePipe],
  template: `
    <div class="pos-container" (window:keydown)="handleShortcut($event)">
      @if (!cashSession()) {
        <div class="cash-required" role="alert">
          <mat-icon class="cash-alert-icon">point_of_sale</mat-icon>
          <h2>Session de caisse requise</h2>
          <p>Vous devez ouvrir votre session de caisse pour vendre et encaisser au comptoir.</p>
          <a routerLink="/cash" class="btn-open-cash">Ouvrir ma session de caisse</a>
        </div>
      } @else {
        <!-- 1. Barre supérieure d'état complète (CDC V2) -->
        <header class="pos-header">
          <div class="header-main-info">
            <div class="pharmacy-title">
              <span class="pharmacy-name">Pharmacie Voici l'Homme Pharma</span>
              <span class="user-badge"><mat-icon>person</mat-icon> {{ currentUser()?.fullName || 'Vendeur' }}</span>
              <span class="session-badge"><mat-icon>lock_open</mat-icon> Caisse active</span>
            </div>

            <div class="status-indicators">
              <!-- Indicateur de connexion permanent -->
              <span class="network-badge" [class.online]="offlineSync.isOnline()" [class.offline]="!offlineSync.isOnline()">
                <mat-icon>{{ offlineSync.isOnline() ? 'wifi' : 'wifi_off' }}</mat-icon>
                {{ offlineSync.connectionLabel() }}
              </span>

              <!-- Badge synchronisation manuelle si ventes en attente -->
              @if (offlineSync.pendingSalesCount() > 0) {
                <button type="button" class="btn-sync-now" (click)="triggerSync()" [disabled]="offlineSync.isSyncing()">
                  <mat-icon [class.spin]="offlineSync.isSyncing()">sync</mat-icon>
                  Synchroniser ({{ offlineSync.pendingSalesCount() }})
                </button>
              }

              <!-- Taux de change et Sélecteur de Devise -->
              <span class="rate-badge">1 USD = {{ activeRate() | currencyFormat:'CDF' }}</span>
              <span class="currency-toggle">
                Devise :
                <button type="button" [class.active]="selectedCurrency === 'CDF'" (click)="setCurrency('CDF')">CDF</button>
                <button type="button" [class.active]="selectedCurrency === 'USD'" (click)="setCurrency('USD')">USD</button>
              </span>
            </div>
          </div>

          <div class="pos-quick-actions">
            <button mat-stroked-button (click)="newSale()" title="[F2] Nouvelle vente">
              <mat-icon>add_shopping_cart</mat-icon>
              Nouvelle vente (F2)
            </button>
            <button mat-stroked-button (click)="holdCart()" [disabled]="!cart().length" title="[F8] Mettre en attente">
              <mat-icon>pause_circle</mat-icon>
              En attente (F8)
            </button>
            <button mat-stroked-button (click)="openHeldCartsModal()" title="[F10] Paniers en attente">
              <mat-icon>restore</mat-icon>
              Paniers (F10)
            </button>
          </div>
        </header>

        <!-- 2. Bandeau d'aide raccourcis clavier normalisés V2 (F1 à F10 + Échap) -->
        <div class="shortcuts-bar">
          <span class="shortcut-pill" (click)="focusBarcodeInput()"><kbd>F1</kbd> Scan/Chercher</span>
          <span class="shortcut-pill" (click)="newSale()"><kbd>F2</kbd> Nouvelle vente</span>
          <span class="shortcut-pill" (click)="openDiscountModal()"><kbd>F3</kbd> Remise ({{ globalDiscountPercent() }}%)</span>
          <span class="shortcut-pill" (click)="showCustomerSearch = true"><kbd>F4</kbd> Client</span>
          <span class="shortcut-pill" (click)="showPrescriptionModal = true"><kbd>F5</kbd> Ordonnance</span>
          <span class="shortcut-pill" (click)="toggleCurrency()"><kbd>F6</kbd> Devise ({{ selectedCurrency }})</span>
          <span class="shortcut-pill" (click)="openStockLotsModal()"><kbd>F7</kbd> Stock / Lots</span>
          <span class="shortcut-pill" (click)="holdCart()"><kbd>F8</kbd> En attente</span>
          <span class="shortcut-pill" (click)="focusCheckout()"><kbd>F9</kbd> Encaisser</span>
          <span class="shortcut-pill" (click)="printLastTicket()"><kbd>F10</kbd> Dernier ticket</span>
          <span class="shortcut-pill" (click)="closeModals()"><kbd>Échap</kbd> Fermer</span>
        </div>

        <div class="pos-layout">
          <!-- Section gauche : Scan, Recherche tolérante, Client et Panier -->
          <section class="cart-section">
            <!-- Barre client (CLI-01 / CLI-02) -->
            <div class="customer-bar">
              <div class="customer-info" *ngIf="selectedCustomer; else noCustomer">
                <span class="badge badge-client">Client : <strong>{{ selectedCustomer.fullName }}</strong> ({{ selectedCustomer.code }})</span>
                <span class="customer-type-hint">{{ selectedCustomer.customerType === 'ASSURANCE' ? 'Assurance' : selectedCustomer.customerType === 'ENTREPRISE' ? 'Entreprise' : 'Particulier' }}</span>
                <span class="customer-warning" *ngIf="selectedCustomer.insuranceStatus === 'EXPIRED'">Assurance expirée</span>
                <span class="customer-warning" *ngIf="selectedCustomer.insuranceStatus === 'INCOMPLETE'">Fiche assurance incomplète</span>
                <span class="credit-hint" *ngIf="selectedCustomer.creditLimitCdf > 0">
                  Plafond : {{ selectedCustomer.creditLimitCdf | currencyFormat:'CDF' }} · Encours dû : {{ selectedCustomer.currentBalanceCdf | currencyFormat:'CDF' }}
                </span>
                <button type="button" class="btn-clear-customer" (click)="selectedCustomer = null; onCartChanged()">Changer</button>
              </div>
              <ng-template #noCustomer>
                <div class="customer-info">
                  <span class="text-muted">Client : <strong>Comptoir (Anonyme)</strong></span>
                  <button type="button" class="btn-customer-action" (click)="showCustomerSearch = !showCustomerSearch">[F4] Rechercher</button>
                  <button type="button" class="btn-customer-action primary" (click)="showQuickCustomerModal = true">+ Nouveau particulier rapide</button>
                </div>
              </ng-template>

              <!-- Recherche rapide client avec autocomplétion -->
              <div class="customer-search-dropdown" *ngIf="showCustomerSearch">
                <input
                  type="text"
                  placeholder="Rechercher client par nom, code ou téléphone..."
                  [(ngModel)]="customerSearchQuery"
                  (input)="searchCustomers()"
                  autofocus
                />
                <ul *ngIf="foundCustomers.length">
                  <li *ngFor="let c of foundCustomers" (click)="selectCustomer(c)">
                    <small class="customer-result-type">{{ c.customerType === 'ASSURANCE' ? 'Assurance' : c.customerType === 'ENTREPRISE' ? 'Entreprise' : 'Particulier' }}<span *ngIf="c.insuranceStatus === 'EXPIRED'"> Assurance expirée</span></small>
                    <strong>{{ c.fullName }}</strong> ({{ c.code }}) · {{ c.phone || 'Sans tel' }}
                  </li>
                </ul>
                <div class="customer-search-empty" *ngIf="customerSearchQuery.trim() && !foundCustomers.length">Client non trouvé. Créez sa fiche complète dans Gestion des clients.</div>
              </div>
            </div>

            <!-- Champ de scan douchette / Recherche rapide tolérante [F1] -->
            <div class="barcode-input-wrapper">
              <mat-icon class="scan-icon">qr_code_scanner</mat-icon>
              <input
                type="text"
                #barcodeInput
                placeholder="Scanner le code-barres (EAN-13) ou chercher un médicament / DCI [F1]..."
                [(ngModel)]="searchQuery"
                (keydown.enter)="onBarcodeScanned(searchQuery); searchQuery = ''"
                (input)="onSearchInput(searchQuery)"
                autofocus
              />
              @if (isSearchingCatalog()) {
                <span class="search-spinner">Recherche...</span>
              }

              <!-- Résultats d'autocomplétion enrichis avec FEFO & alertes -->
              @if (searchResults.length > 0) {
                <div class="search-results-dropdown">
                  @for (prod of searchResults; track prod.id) {
                    <div class="search-result-item" (click)="addProductToCart(prod)">
                      <div class="result-info">
                        <strong class="result-name">{{ prod.name }}</strong>
                        <span class="result-meta">{{ prod.dci }} · {{ prod.galenicForm }} {{ prod.dosage }}</span>
                      </div>
                      <div class="result-badges">
                        <span class="badge-stock" [class.badge-low]="(prod.totalStock || 0) <= 5">
                          Stock : {{ prod.totalStock }}
                        </span>
                        @if (prod.requiresPrescription) {
                          <span class="badge-rx">Sur ordonnance</span>
                        }
                      </div>
                      <div class="result-pricing">
                        <strong>{{ prod.sellingPriceCdf | currencyFormat:'CDF' }}</strong>
                        <small>{{ prod.sellingPriceUsd | currencyFormat:'USD' }}</small>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>

            <!-- Tableau du panier avec déstockage FEFO & alertes claires -->
            <div class="cart-table-container">
            <table class="cart-table" aria-label="Panier de vente">
              <thead>
                <tr>
                  <th>Produit & Détails FEFO</th>
                  <th style="width: 140px; text-align: center;">Quantité</th>
                  <th style="width: 110px; text-align: right;">P.U.</th>
                  <th style="width: 90px; text-align: center;">Remise</th>
                  <th style="width: 120px; text-align: right;">Total</th>
                  <th style="width: 44px; text-align: center;">✕</th>
                </tr>
              </thead>
              <tbody>
                @for (item of cart(); track item.product.id; let i = $index) {
                  <tr>
                    <td>
                      <strong>{{ item.product.name }}</strong>
                      <span class="dci-subtitle">{{ item.product.dci }} · {{ item.product.galenicForm }} {{ item.product.dosage }}</span>

                      <!-- Informations FEFO assignées -->
                      <div class="fefo-details">
                        <span class="lot-pill">
                          <mat-icon>event_available</mat-icon> Lot : {{ item.lotNumber || 'Attribution auto' }}
                          <span class="lot-date" *ngIf="item.expiryDate">(Exp. {{ item.expiryDate | date:'dd/MM/yyyy' }})</span>
                        </span>
                        <span class="available-hint" *ngIf="item.availableStock !== undefined">
                          Dispo : {{ item.availableStock }}
                        </span>
                      </div>

                      <!-- Badges d'alerte -->
                      <div class="item-badges">
                        @if (item.product.requiresPrescription) {
                          <span class="badge-rx" [class.unfulfilled]="!selectedPrescription">
                            {{ selectedPrescription ? 'Ordonnance jointe' : 'Ordonnance requise [F5]' }}
                          </span>
                        }
                        @if (item.isNearExpiry) {
                          <span class="badge-expiry">Péremption proche</span>
                        }
                        @if (item.stockWarning) {
                          <span class="badge-stock-alert">Stock limité</span>
                        }
                      </div>
                    </td>

                    <td style="text-align: center;">
                      <div class="qty-control">
                        <button type="button" class="btn-qty" (click)="decreaseQuantity(i)" aria-label="Diminuer">-</button>
                        <input
                          type="number"
                          class="qty-input"
                          min="1"
                          [ngModel]="item.quantity"
                          (ngModelChange)="updateQuantity(i, $event)"
                          aria-label="Quantité"
                        />
                        <button type="button" class="btn-qty" (click)="increaseQuantity(i)" aria-label="Augmenter">+</button>
                      </div>
                    </td>

                    <td style="text-align: right;">
                      <strong>{{ item.product.sellingPriceCdf | currencyFormat:'CDF' }}</strong>
                      <small class="dci-subtitle">{{ item.product.sellingPriceUsd | currencyFormat:'USD' }}</small>
                    </td>

                    <td style="text-align: center;">
                      <input
                        type="number"
                        class="discount-input"
                        min="0"
                        placeholder="0"
                        [ngModel]="item.discountCdf"
                        (ngModelChange)="updateLineDiscount(i, $event)"
                        title="Remise ligne en CDF"
                      />
                    </td>

                    <td style="text-align: right;">
                      <strong>{{ (serverLineTotals()[item.product.id] || (item.quantity * item.product.sellingPriceCdf - (item.discountCdf || 0))) | currencyFormat:'CDF' }}</strong>
                    </td>

                    <td style="text-align: center;">
                      <button type="button" class="btn-remove-item" (click)="removeFromCart(i)" title="Retirer la ligne">✕</button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="empty-cart-message">
                      <mat-icon class="empty-icon">shopping_cart</mat-icon>
                      <p>Panier vide. Scannez un code-barres ou recherchez un produit (Touche [F1]).</p>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            </div>

            <!-- Ordonnance attachée si médicaments sous prescription -->
            @if (requiresPrescription()) {
              <div class="prescription-box">
                <div class="prescription-alert">
                  <mat-icon>warning</mat-icon>
                  <span>Certains médicaments du panier exigent une ordonnance médicale conforme.</span>
                </div>
                @if (selectedPrescription) {
                  <div class="selected-rx-banner">
                    Ordonnance active : <strong>Dr {{ selectedPrescription.prescriberName }}</strong>
                    ({{ selectedPrescription.healthCenter || 'Cabinet médical' }} · {{ selectedPrescription.prescriptionDate }})
                    <button type="button" class="btn-clear-rx" (click)="selectedPrescription = null; onCartChanged()">Retirer</button>
                  </div>
                } @else {
                  <p class="rx-missing-warning">Veuillez rattacher ou scanner une ordonnance (Raccourci [F5]) avant de valider l'encaissement.</p>
                  <button type="button" class="btn-attach-rx" (click)="showPrescriptionModal = true">+ Ajouter / Lier ordonnance [F5]</button>
                }
              </div>
            }
          </section>

          <!-- Section droite : Encaissement, Totaux, Devises et Validation -->
          <aside class="checkout-panel">
            <h3 class="checkout-title">Encaissement comptoir</h3>

            <div class="total-display">
              <span class="total-label">Total à payer</span>
              <div class="total-primary">
                {{ selectedCurrency === 'CDF' ? (totalCdf() | currencyFormat:'CDF') : (totalUsd() | currencyFormat:'USD') }}
              </div>
              <span class="total-secondary">
                Soit : {{ selectedCurrency === 'CDF' ? (totalUsd() | currencyFormat:'USD') : (totalCdf() | currencyFormat:'CDF') }}
              </span>
              <small class="server-note">Calculé et certifié côté serveur au taux officiel</small>
            </div>

            <!-- Mode de paiement (restreint aux espèces si hors-ligne) -->
            <div class="payments-container">
              <div class="payments-header">
                <label>Lignes de règlement :</label>
                <button type="button" class="btn-add-payment" (click)="addPaymentLine()" [disabled]="!offlineSync.isOnline()">
                  + Ajouter règlement
                </button>
              </div>

              @if (!offlineSync.isOnline()) {
                <div class="offline-pay-alert">
                  <mat-icon>info</mat-icon>
                  <span>Mode hors-ligne : seuls les règlements en <strong>Espèces (CDF ou USD)</strong> sont autorisés.</span>
                </div>
              }

              @for (p of paymentLines; track $index; let idx = $index) {
                <div class="payment-row">
                  <div class="pay-method-select">
                    <select [(ngModel)]="p.method" (change)="onPaymentChanged()" [disabled]="!offlineSync.isOnline()">
                      <option value="ESPECES">Espèces (Cash)</option>
                      <option value="MOBILE_MONEY" [disabled]="!offlineSync.isOnline()">Mobile Money (M-Pesa/Orange/Airtel)</option>
                      <option value="CARTE_BANCAIRE" [disabled]="!offlineSync.isOnline()">Carte Bancaire / TPE</option>
                      <option value="VIREMENT" [disabled]="!offlineSync.isOnline()">Virement Bancaire</option>
                      <option value="CREDIT_CLIENT" [disabled]="!offlineSync.isOnline() || !selectedCustomer || selectedCustomer.creditLimitCdf <= 0">Crédit client</option>
                    </select>

                    <select [(ngModel)]="p.currency" (change)="onPaymentChanged()" class="pay-currency">
                      <option value="CDF">CDF</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>

                  <div class="pay-amount-input">
                    <input
                      type="number"
                      [(ngModel)]="p.amount"
                      (input)="onPaymentChanged()"
                      placeholder="Montant perçu"
                      min="0"
                    />
                    @if (paymentLines.length > 1) {
                      <button type="button" class="btn-remove-pay" (click)="removePaymentLine(idx)" title="Supprimer">✕</button>
                    }
                  </div>

                  <!-- Champs obligatoires pour mobile money & cartes -->
                  @if (p.method === 'MOBILE_MONEY') {
                    <div class="mobile-money-fields">
                      <select [(ngModel)]="p.mobileMoneyProvider">
                        <option value="M-PESA">Vodacom M-Pesa</option>
                        <option value="ORANGE_MONEY">Orange Money</option>
                        <option value="AIRTEL_MONEY">Airtel Money</option>
                      </select>
                      <input type="text" [(ngModel)]="p.transactionReference" placeholder="Réf. transaction reçue (obligatoire)" />
                    </div>
                  }
                  @if (p.method === 'CARTE_BANCAIRE' || p.method === 'VIREMENT') {
                    <div class="mobile-money-fields">
                      <input type="text" [(ngModel)]="p.transactionReference" placeholder="Réf. autorisation / bordereau (obligatoire)" />
                    </div>
                  }
                </div>
              }

              <!-- Synthèse règlement -->
              <div class="tender-summary">
                <div class="summary-line">
                  <span>Total versé :</span>
                  <strong>{{ totalPaidCdf() | currencyFormat:'CDF' }}</strong>
                </div>
                @if (changeDue() > 0) {
                  <div class="summary-line change">
                    <span>Rendu de monnaie :</span>
                    <strong class="text-success">{{ changeDue() | currencyFormat:'CDF' }}</strong>
                  </div>
                }
                @if (outstandingCdf() > 0) {
                  <div class="summary-line balance">
                    <span>Solde restant (créance) :</span>
                    <strong class="text-warning">{{ outstandingCdf() | currencyFormat:'CDF' }}</strong>
                  </div>
                }
              </div>
            </div>

            <!-- PIN Superviseur si nécessaire -->
            @if (needsSupervisorPin()) {
              <div class="supervisor-pin-box">
                <label>PIN Superviseur (Remise > plafond autorisée) :</label>
                <input type="password" [(ngModel)]="supervisorPin" placeholder="PIN à 4 chiffres" maxlength="6" />
              </div>
            }

            <button
              mat-flat-button
              color="primary"
              class="btn-checkout"
              [disabled]="isCheckoutDisabled()"
              (click)="validateSale()"
            >
              @if (isProcessing()) {
                <span>Validation en cours...</span>
              } @else {
                <span>Valider & Imprimer Ticket [F9]</span>
              }
            </button>
          </aside>
        </div>

        <!-- Bannière d'erreur métier explicite -->
        @if (errorMessage()) {
          <div class="error-banner" role="alert">
            <mat-icon>error_outline</mat-icon>
            <div class="error-content">
              <strong>{{ errorTitle() || 'Attention' }}</strong>
              <span>{{ errorMessage() }}</span>
              <small *ngIf="errorAction()">{{ errorAction() }}</small>
            </div>
            <button type="button" class="btn-close-err" (click)="errorMessage.set('')">✕</button>
          </div>
        }

        <!-- Modale de confirmation de vente réussie & impression [F10] -->
        @if (completedSale()) {
          <div class="modal-backdrop">
            <div class="modal-dialog success-dialog">
              <div class="success-header">
                <mat-icon class="icon-success">check_circle</mat-icon>
                <h3>Vente validée avec succès !</h3>
                <p class="invoice-number">{{ completedSale().invoiceNumber }}</p>
                <span class="offline-tag" *ngIf="completedSale().isOffline">Vente enregistrée en mode hors-ligne</span>
              </div>
              <div class="success-body">
                <p>Total réglé : <strong>{{ completedSale().totalAmountCdf | currencyFormat:'CDF' }}</strong> ({{ completedSale().totalAmountUsd | currencyFormat:'USD' }})</p>
                @if (lastChangeGiven() > 0) {
                  <p class="change-highlight">Rendu de monnaie : <strong>{{ lastChangeGiven() | currencyFormat:'CDF' }}</strong></p>
                }
              </div>
              <div class="success-actions">
                <button mat-flat-button color="primary" (click)="printTicket(completedSale().invoiceNumber)">
                  <mat-icon>print</mat-icon> Imprimer Ticket 80 mm [F10]
                </button>
                <button mat-stroked-button (click)="downloadPdf(completedSale().invoiceNumber)">
                  <mat-icon>picture_as_pdf</mat-icon> Télécharger Facture PDF
                </button>
                <button mat-button (click)="closeSuccessModalAndReset()">
                  Nouvelle vente [Entrée / Échap]
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Modale de reprise des paniers en attente [F10] -->
        @if (showHeldCartsModal) {
          <div class="modal-backdrop">
            <div class="modal-dialog held-carts-dialog">
              <div class="modal-title-bar">
                <h3>Paniers en attente (Conservation 24h)</h3>
                <button type="button" class="btn-close-modal" (click)="showHeldCartsModal = false">✕</button>
              </div>
              <div class="held-carts-list">
                @for (hc of heldCartsList; track hc.id) {
                  <div class="held-cart-item">
                    <div>
                      <strong>{{ hc.referenceName }}</strong>
                      <small>{{ hc.savedAt | date:'short' }} · {{ hc.items?.length || 0 }} article(s)</small>
                    </div>
                    <button mat-flat-button color="primary" (click)="resumeHeldCart(hc.id)">
                      Reprendre
                    </button>
                  </div>
                } @empty {
                  <p class="empty-text">Aucun panier en attente.</p>
                }
              </div>
            </div>
          </div>
        }

        <!-- Modale de remise globale [F3] -->
        @if (showDiscountModal) {
          <div class="modal-backdrop">
            <div class="modal-dialog discount-dialog">
              <div class="modal-title-bar">
                <h3>Appliquer une remise globale [F3]</h3>
                <button type="button" class="btn-close-modal" (click)="showDiscountModal = false">✕</button>
              </div>
              <div class="discount-modal-body">
                <label>Pourcentage de remise (%) :</label>
                <input type="number" [(ngModel)]="tempDiscountPercent" min="0" max="100" />
                <p class="role-ceiling-hint">Plafond sans PIN superviseur : {{ userDiscountCeiling() }}%</p>
                @if (tempDiscountPercent > userDiscountCeiling()) {
                  <label>Code PIN Superviseur (requis au-delà de {{ userDiscountCeiling() }}%) :</label>
                  <input type="password" [(ngModel)]="supervisorPin" placeholder="PIN superviseur" />
                }
                <div class="modal-actions">
                  <button mat-stroked-button (click)="showDiscountModal = false">Annuler [Échap]</button>
                  <button mat-flat-button color="primary" (click)="applyGlobalDiscount()">Appliquer</button>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Modale de consultation du Stock et des Lots [F7] -->
        @if (showStockLotsModal) {
          <div class="modal-backdrop">
            <div class="modal-dialog stock-dialog">
              <div class="modal-title-bar">
                <h3>Consultation du Stock & des Lots FEFO [F7]</h3>
                <button type="button" class="btn-close-modal" (click)="showStockLotsModal = false">✕</button>
              </div>
              <div class="stock-modal-body">
                @if (cart().length > 0) {
                  <table class="stock-info-table">
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th>Lot FEFO</th>
                        <th>Péremption</th>
                        <th>Stock dispo</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of cart(); track item.product.id) {
                        <tr>
                          <td><strong>{{ item.product.name }}</strong></td>
                          <td><span class="lot-pill">{{ item.lotNumber || 'Attribution auto' }}</span></td>
                          <td>{{ (item.expiryDate | date:'dd/MM/yyyy') || 'N/A' }}</td>
                          <td><strong>{{ item.availableStock ?? 'Vérifié' }}</strong></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                } @else {
                  <p class="empty-text">Ajoutez un produit au panier pour inspecter ses lots FEFO en temps réel.</p>
                }
                <div class="modal-actions">
                  <button mat-flat-button color="primary" (click)="showStockLotsModal = false">Fermer [Échap]</button>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Modale de Sélection / Rattachement d'Ordonnance [F5] -->
        @if (showPrescriptionModal) {
          <div class="modal-backdrop">
            <div class="modal-dialog prescription-dialog">
              <div class="modal-title-bar">
                <h3>Ajouter ou rattacher une ordonnance [F5]</h3>
                <button type="button" class="btn-close-modal" (click)="showPrescriptionModal = false">✕</button>
              </div>
              <app-prescription-selector
                [customerId]="selectedCustomer?.id || ''"
                (selected)="onPrescriptionSelected($event); showPrescriptionModal = false"
              ></app-prescription-selector>
            </div>
          </div>
        }

        <!-- Modale de Création Rapide de Client [F4] -->
        @if (showQuickCustomerModal) {
          <div class="modal-backdrop">
            <app-quick-customer-form
              (created)="onQuickCustomerCreated($event)"
              (cancelled)="showQuickCustomerModal = false"
            ></app-quick-customer-form>
          </div>
        }
      }
    </div>
  `,
  styleUrl: './pos.component.scss',
})
export class PosComponent implements OnInit {
  @ViewChild('barcodeInput') barcodeInputRef!: ElementRef<HTMLInputElement>;

  private readonly customersApi = inject(CustomersApiService);
  private readonly salesApi = inject(SalesApiService);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly cashApi = inject(CashApiService);
  readonly authService = inject(AuthService);
  readonly offlineSync = inject(OfflineSyncService);

  readonly currentUser = computed(() => this.authService.currentUser());
  cashSession = signal<any>(null);
  activeRate = signal<number>(0);
  selectedCurrency: CurrencyCode = 'CDF';

  searchQuery = '';
  isSearchingCatalog = signal<boolean>(false);
  searchResults: Product[] = [];

  cart = signal<CartItem[]>([]);
  paymentLines: PaymentLine[] = [{ method: 'ESPECES', amount: 0, currency: 'CDF' }];
  supervisorPin = '';
  isProcessing = signal<boolean>(false);

  // Messages d'erreurs guidés
  errorTitle = signal<string>('');
  errorMessage = signal<string>('');
  errorAction = signal<string>('');

  currentIdempotencyKey = signal<string>(crypto.randomUUID());

  selectedCustomer: Customer | null = null;
  selectedPrescription: { id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string } | null = null;
  showQuickCustomerModal = false;
  showCustomerSearch = false;
  customerSearchQuery = '';
  foundCustomers: Customer[] = [];

  showHeldCartsModal = false;
  heldCartsList: any[] = [];
  showDiscountModal = false;
  showStockLotsModal = false;
  showPrescriptionModal = false;
  tempDiscountPercent = 0;
  globalDiscountPercent = signal<number>(0);

  completedSale = signal<any>(null);
  lastChangeGiven = signal<number>(0);

  serverTotalCdf = signal<number>(0);
  serverTotalUsd = signal<number>(0);
  serverChangeCdf = signal<number>(0);
  serverOutstandingCdf = signal<number>(0);
  serverLineTotals = signal<Record<string, number>>({});

  totalCdf = () => this.serverTotalCdf();
  totalUsd = () => this.serverTotalUsd();
  changeDue = () => this.serverChangeCdf();
  outstandingCdf = () => this.serverOutstandingCdf();

  totalPaidCdf = computed(() => {
    return this.paymentLines.reduce((sum, p) => {
      const amt = Number(p.amount) || 0;
      return sum + (p.currency === 'USD' ? amt * this.activeRate() : amt);
    }, 0);
  });

  requiresPrescription = computed(() => {
    return this.cart().some((line) => line.product.requiresPrescription);
  });

  userDiscountCeiling = computed(() => {
    const role = this.authService.userRole();
    if (role === 'ADMIN') return 100;
    if (role === 'PHARMACIEN') return 15;
    return 5;
  });

  needsSupervisorPin(): boolean {
    return this.globalDiscountPercent() > this.userDiscountCeiling();
  }

  ngOnInit() {
    this.loadActiveCashSession();
    this.loadCurrentRate();
    this.focusBarcodeInput();
    this.preloadOfflineCatalog();
  }

  private loadActiveCashSession() {
    this.cashApi.getActiveSession().subscribe({
      next: (session: any) => this.cashSession.set(session),
      error: () => this.cashSession.set(null),
    });
  }

  private loadCurrentRate() {
    this.cashApi.getActiveRate?.()?.subscribe?.({
      next: (rate) => {
        if (rate?.rate) this.activeRate.set(Number(rate.rate));
      },
      error: () => {},
    });
  }

  private preloadOfflineCatalog() {
    if (this.offlineSync?.isOnline?.()) {
      this.catalogApi?.getProducts?.({ limit: 300, isActive: true })?.subscribe?.({
        next: (res) => {
          if (res?.data?.length) {
            this.offlineSync.cacheCatalog(res.data);
          }
        },
        error: () => {},
      });
    }
  }

  // GESTION DES RACCOURCIS CLAVIER NORMALISÉS F1 À F10 + ÉCHAP
  handleShortcut(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.closeModals();
      return;
    }

    if (event.key === 'F1') {
      event.preventDefault();
      this.focusBarcodeInput();
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      this.newSale();
      return;
    }

    if (event.key === 'F3') {
      event.preventDefault();
      this.openDiscountModal();
      return;
    }

    if (event.key === 'F4') {
      event.preventDefault();
      this.showCustomerSearch = true;
      return;
    }

    if (event.key === 'F5') {
      event.preventDefault();
      this.showPrescriptionModal = true;
      return;
    }

    if (event.key === 'F6') {
      event.preventDefault();
      this.toggleCurrency();
      return;
    }

    if (event.key === 'F7') {
      event.preventDefault();
      this.openStockLotsModal();
      return;
    }

    if (event.key === 'F8') {
      event.preventDefault();
      this.holdCart();
      return;
    }

    if (event.key === 'F9') {
      event.preventDefault();
      this.validateSale();
      return;
    }

    if (event.key === 'F10') {
      event.preventDefault();
      this.printLastTicket();
      return;
    }

    if (event.key === 'Enter' && this.completedSale()) {
      event.preventDefault();
      this.closeSuccessModalAndReset();
    }
  }

  focusBarcodeInput() {
    setTimeout(() => {
      this.barcodeInputRef?.nativeElement?.focus();
      this.barcodeInputRef?.nativeElement?.select();
    }, 50);
  }

  closeModals() {
    this.showCustomerSearch = false;
    this.showQuickCustomerModal = false;
    this.showHeldCartsModal = false;
    this.showDiscountModal = false;
    this.showStockLotsModal = false;
    this.showPrescriptionModal = false;
    this.searchResults = [];
    if (this.completedSale()) this.closeSuccessModalAndReset();
  }

  toggleCurrency() {
    this.setCurrency(this.selectedCurrency === 'CDF' ? 'USD' : 'CDF');
  }

  setCurrency(curr: CurrencyCode) {
    this.selectedCurrency = curr;
    if (this.paymentLines.length === 1) {
      this.paymentLines[0].currency = curr;
      this.paymentLines[0].amount = curr === 'USD' ? this.totalUsd() : this.totalCdf();
    }
    this.onCartChanged();
  }

  newSale() {
    if (this.cart().length > 0) {
      if (confirm('Voulez-vous vider le panier en cours pour commencer une nouvelle vente ?')) {
        this.resetCart();
      }
    } else {
      this.resetCart();
    }
  }

  resetCart() {
    this.cart.set([]);
    this.serverTotalCdf.set(0);
    this.serverTotalUsd.set(0);
    this.serverLineTotals.set({});
    this.serverChangeCdf.set(0);
    this.serverOutstandingCdf.set(0);
    this.selectedPrescription = null;
    this.supervisorPin = '';
    this.globalDiscountPercent.set(0);
    this.paymentLines = [{ method: 'ESPECES', amount: 0, currency: this.selectedCurrency }];
    this.currentIdempotencyKey.set(crypto.randomUUID());
    this.focusBarcodeInput();
  }

  openDiscountModal() {
    this.tempDiscountPercent = this.globalDiscountPercent();
    this.showDiscountModal = true;
  }

  openStockLotsModal() {
    this.showStockLotsModal = true;
  }

  focusCheckout() {
    if (!this.isCheckoutDisabled()) {
      this.validateSale();
    }
  }

  printLastTicket() {
    if (this.completedSale()) {
      this.printTicket(this.completedSale().invoiceNumber);
    } else {
      this.openHeldCartsModal();
    }
  }

  triggerSync() {
    this.offlineSync.synchronizeNow().then((res) => {
      if (res && res.synchronizedCount > 0) {
        alert(`${res.synchronizedCount} vente(s) synchronisée(s) avec succès !`);
      }
    });
  }

  onSearchInput(query: string) {
    if (!query || query.trim().length < 2) {
      this.searchResults = [];
      return;
    }

    const q = query.trim();
    this.isSearchingCatalog.set(true);

    if (!this.offlineSync.isOnline()) {
      // Recherche dans le cache IndexedDB hors-ligne
      this.offlineSync.searchOfflineCatalog(q).then((results) => {
        this.searchResults = results;
        this.isSearchingCatalog.set(false);
      });
      return;
    }

    this.catalogApi.autocomplete(q).subscribe({
      next: (matches) => {
        this.isSearchingCatalog.set(false);
        this.searchResults = matches as any[];
      },
      error: () => {
        this.isSearchingCatalog.set(false);
        this.searchResults = [];
      },
    });
  }

  onBarcodeScanned(code: string) {
    if (!code?.trim()) return;
    const c = code.trim();

    if (!this.offlineSync.isOnline()) {
      this.offlineSync.searchOfflineCatalog(c).then((matches) => {
        if (matches?.length) {
          this.addProductToCart(matches[0]);
        } else {
          this.setGuidedError(POS_ERROR_MESSAGES.STOCK_INSUFFICIENT(c, 0));
        }
      });
      return;
    }

    this.catalogApi.autocomplete(c).subscribe({
      next: (matches) => {
        const match: any = matches[0];
        if (!match?.id) {
          this.setGuidedError(POS_ERROR_MESSAGES.STOCK_INSUFFICIENT(c, 0));
          return;
        }
        this.catalogApi.getProductById(match.id).subscribe({
          next: (product) => {
            this.addProductToCart(product);
          },
        });
      },
    });
  }

  addProductToCart(product: Product) {
    const current = [...this.cart()];
    const existing = current.find((line) => line.product.id === product.id);
    if (existing) {
      existing.quantity += 1;
      this.cart.set(current);
    } else {
      this.cart.set([...current, { product, quantity: 1, discountCdf: 0 }]);
    }
    this.searchResults = [];
    this.searchQuery = '';
    this.onCartChanged();
    this.focusBarcodeInput();
  }

  increaseQuantity(index: number) {
    const current = [...this.cart()];
    current[index].quantity += 1;
    this.cart.set(current);
    this.onCartChanged();
  }

  decreaseQuantity(index: number) {
    const current = [...this.cart()];
    if (current[index].quantity > 1) {
      current[index].quantity -= 1;
      this.cart.set(current);
      this.onCartChanged();
    } else {
      this.removeFromCart(index);
    }
  }

  updateQuantity(index: number, quantity: any) {
    const q = Number(quantity);
    if (q > 0) {
      const current = [...this.cart()];
      current[index].quantity = q;
      this.cart.set(current);
      this.onCartChanged();
    }
  }

  updateLineDiscount(index: number, discount: any) {
    const d = Math.max(0, Number(discount) || 0);
    const current = [...this.cart()];
    current[index].discountCdf = d;
    this.cart.set(current);
    this.onCartChanged();
  }

  removeFromCart(index: number) {
    const current = [...this.cart()];
    current.splice(index, 1);
    this.cart.set(current);
    this.onCartChanged();
    this.focusBarcodeInput();
  }

  applyGlobalDiscount() {
    const pct = Math.max(0, Math.min(100, Number(this.tempDiscountPercent) || 0));
    this.globalDiscountPercent.set(pct);
    const current = [...this.cart()];
    for (const item of current) {
      const lineRaw = item.quantity * Number(item.product.sellingPriceCdf);
      item.discountCdf = Math.round((lineRaw * pct) / 100);
    }
    this.cart.set(current);
    this.showDiscountModal = false;
    this.onCartChanged();
  }

  addPaymentLine() {
    this.paymentLines.push({ method: 'ESPECES', amount: 0, currency: this.selectedCurrency });
  }

  removePaymentLine(index: number) {
    if (this.paymentLines.length > 1) {
      this.paymentLines.splice(index, 1);
      this.onPaymentChanged();
    }
  }

  onPaymentChanged() {
    this.onCartChanged();
  }

  onCartChanged() {
    if (!this.cart().length) {
      this.serverTotalCdf.set(0);
      this.serverTotalUsd.set(0);
      this.serverLineTotals.set({});
      this.serverChangeCdf.set(0);
      this.serverOutstandingCdf.set(0);
      return;
    }

    if (!this.offlineSync.isOnline()) {
      // Calcul local estimatif en mode hors-ligne
      let sumCdf = 0;
      const lineMap: Record<string, number> = {};
      for (const item of this.cart()) {
        const lineTotal = item.quantity * Number(item.product.sellingPriceCdf) - (item.discountCdf || 0);
        lineMap[item.product.id] = Math.max(0, lineTotal);
        sumCdf += lineMap[item.product.id];
      }
      this.serverLineTotals.set(lineMap);
      this.serverTotalCdf.set(sumCdf);
      const rate = this.activeRate();
      this.serverTotalUsd.set(rate > 0 ? Number((sumCdf / rate).toFixed(2)) : 0);

      const paidCdf = this.totalPaidCdf();
      if (paidCdf >= sumCdf) {
        this.serverChangeCdf.set(paidCdf - sumCdf);
        this.serverOutstandingCdf.set(0);
      } else {
        this.serverChangeCdf.set(0);
        this.serverOutstandingCdf.set(sumCdf - paidCdf);
      }

      if (this.paymentLines.length === 1 && (!this.paymentLines[0].amount || this.paymentLines[0].amount === 0)) {
        this.paymentLines[0].amount = this.selectedCurrency === 'USD' ? this.serverTotalUsd() : sumCdf;
      }
      return;
    }

    const dto = this.buildSaleDto();
    this.salesApi.previewSale(dto).subscribe({
      next: (p) => {
        this.serverTotalCdf.set(Number(p.totalCdf));
        this.serverTotalUsd.set(Number(p.totalUsd));
        this.activeRate.set(Number(p.exchangeRate));
        this.serverChangeCdf.set(Number(p.changeCdf || 0));
        this.serverOutstandingCdf.set(Number(p.outstandingCdf || 0));

        const lineMap: Record<string, number> = {};
        const updatedCart = [...this.cart()];
        for (const item of (p.items || [])) {
          lineMap[item.productId] = Number(item.lineTotalCdf || 0);
          const cartItem = updatedCart.find((ci) => ci.product.id === item.productId);
          if (cartItem) {
            cartItem.lotId = item.lotId;
            cartItem.lotNumber = item.lotNumber;
            cartItem.expiryDate = item.expiryDate;
            cartItem.availableStock = item.availableStock;
            cartItem.isNearExpiry = item.isNearExpiry;
            cartItem.isControlled = item.isControlled;
            cartItem.requiresPrescription = item.requiresPrescription;
            cartItem.stockWarning = item.stockWarning;
          }
        }
        this.serverLineTotals.set(lineMap);
        this.cart.set(updatedCart);

        if (this.paymentLines.length === 1 && (!this.paymentLines[0].amount || this.paymentLines[0].amount === 0)) {
          this.paymentLines[0].amount = this.selectedCurrency === 'USD' ? p.totalUsd : p.totalCdf;
        }
      },
      error: (err) => {
        this.setGuidedError({
          title: 'Erreur de calcul',
          message: err?.error?.message || 'Erreur lors du calcul de la prévisualisation serveur.',
          action: 'Vérifiez la quantité demandée et la disponibilité des lots.',
        });
      },
    });
  }

  buildSaleDto(): CreateSaleRequestDto {
    return {
      currency: this.selectedCurrency,
      customerId: this.selectedCustomer?.id,
      prescriptionId: this.selectedPrescription?.id,
      supervisorPin: this.supervisorPin.trim() || undefined,
      idempotencyKey: this.currentIdempotencyKey(),
      items: this.cart().map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        unitPriceCdf: Number(i.product.sellingPriceCdf),
        discountCdf: i.discountCdf || 0,
        lotId: i.lotId,
      })),
      payments: this.paymentLines.map((p) => ({
        method: p.method,
        amountPaid: Number(p.amount) || 0,
        currency: p.currency,
        mobileMoneyProvider: p.method === 'MOBILE_MONEY' ? p.mobileMoneyProvider : undefined,
        transactionReference: (p.method === 'MOBILE_MONEY' || p.method === 'CARTE_BANCAIRE' || p.method === 'VIREMENT') ? p.transactionReference?.trim() : undefined,
      })),
    };
  }

  isCheckoutDisabled(): boolean {
    if (this.cart().length === 0 || this.isProcessing()) return true;
    if (this.requiresPrescription() && !this.selectedPrescription) return true;
    const hasCredit = this.paymentLines.some((p) => p.method === 'CREDIT_CLIENT') || this.outstandingCdf() > 0;
    if (hasCredit && !this.selectedCustomer) return true;
    if (!this.offlineSync.isOnline() && (hasCredit || this.paymentLines.some((p) => p.method !== 'ESPECES'))) return true;
    return false;
  }

  validateSale() {
    if (this.isCheckoutDisabled()) return;
    this.isProcessing.set(true);
    this.clearError();

    // Cas Hors-ligne
    if (!this.offlineSync.isOnline()) {
      const offlineSale: OfflineSalePayload = {
        idempotencyKey: this.currentIdempotencyKey(),
        localCreatedAt: new Date().toISOString(),
        userId: this.authService.currentUser()?.id || 'offline-caissier',
        pharmacyId: this.authService.currentUser()?.pharmacyId || '11111111-1111-1111-1111-111111111111',
        cashSessionId: this.cashSession()?.id || 'offline-session',
        customerId: this.selectedCustomer?.id,
        currency: this.selectedCurrency,
        exchangeRateIndicative: this.activeRate(),
        items: this.cart().map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          lotId: item.lotId || '',
          lotNumber: item.lotNumber || 'FEFO-AUTO',
          expiryDate: item.expiryDate || '',
          quantity: item.quantity,
          unitPriceCdf: Number(item.product.sellingPriceCdf),
          discountCdf: item.discountCdf || 0,
        })),
        paymentMethod: 'ESPECES',
        amountPaid: Number(this.paymentLines[0]?.amount) || (this.selectedCurrency === 'USD' ? this.totalUsd() : this.totalCdf()),
        changeGivenCdf: this.serverChangeCdf(),
        syncStatus: 'EN_ATTENTE',
      };

      this.offlineSync.saveOfflineSale(offlineSale).then(() => {
        this.isProcessing.set(false);
        this.lastChangeGiven.set(this.serverChangeCdf());
        this.completedSale.set({
          invoiceNumber: `HL-${Date.now().toString().slice(-6)}`,
          totalAmountCdf: this.totalCdf(),
          totalAmountUsd: this.totalUsd(),
          isOffline: true,
        });
        this.currentIdempotencyKey.set(crypto.randomUUID());
      });
      return;
    }

    // Cas En ligne
    const dto = this.buildSaleDto();
    const key = this.currentIdempotencyKey();

    this.salesApi.createSale(dto, key).subscribe({
      next: (sale) => {
        this.isProcessing.set(false);
        this.lastChangeGiven.set(this.serverChangeCdf());
        this.completedSale.set(sale);
        this.currentIdempotencyKey.set(crypto.randomUUID());
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.setGuidedError({
          title: 'Refus de vente',
          message: err?.error?.message || 'La vente a été refusée par le serveur.',
          action: 'Vérifiez le stock disponible des lots ou les autorisations de remise.',
        });
      },
    });
  }

  setGuidedError(err: { title: string; message: string; action: string }) {
    this.errorTitle.set(err.title);
    this.errorMessage.set(err.message);
    this.errorAction.set(err.action);
  }

  clearError() {
    this.errorTitle.set('');
    this.errorMessage.set('');
    this.errorAction.set('');
  }

  closeSuccessModalAndReset() {
    this.completedSale.set(null);
    this.resetCart();
  }

  printTicket(invoiceNumber: string) {
    if (this.completedSale()?.isOffline) {
      window.print();
      return;
    }

    this.salesApi.getInvoiceDocument(invoiceNumber, true).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) {
          win.onload = () => win.print();
        }
      },
      error: () => this.setGuidedError({
        title: 'Impression impossible',
        message: 'Impossible de contacter le serveur pour générer le ticket.',
        action: 'Vérifiez votre connexion et l’imprimante thermique 80 mm.',
      }),
    });
  }

  downloadPdf(invoiceNumber: string) {
    if (this.completedSale()?.isOffline) {
      alert('La facture PDF officielle sera disponible dès la synchronisation de la vente.');
      return;
    }

    this.salesApi.getInvoiceDocument(invoiceNumber, false).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceNumber}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.setGuidedError({
        title: 'Téléchargement échoué',
        message: 'Erreur lors de la récupération du PDF officiel.',
        action: 'Réessayez dans quelques instants.',
      }),
    });
  }

  holdCart() {
    if (!this.cart().length) return;
    const ref = prompt('Nom ou référence du panier en attente :', `Comptoir ${new Date().toLocaleTimeString('fr-FR')}`);
    if (!ref) return;

    this.salesApi
      .holdCart({
        referenceName: ref,
        items: this.cart().map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        customerId: this.selectedCustomer?.id,
      })
      .subscribe({
        next: () => {
          this.closeSuccessModalAndReset();
        },
        error: () => this.setGuidedError({
          title: 'Mise en attente échouée',
          message: 'Impossible d’enregistrer le panier en attente sur le serveur.',
          action: 'Réessayez ou finalisez la vente immédiatement.',
        }),
      });
  }

  openHeldCartsModal() {
    this.salesApi.listHeldCarts().subscribe({
      next: (list) => {
        this.heldCartsList = list || [];
        this.showHeldCartsModal = true;
      },
      error: () => this.setGuidedError({
        title: 'Erreur de chargement',
        message: 'Impossible de récupérer la liste des paniers en attente.',
        action: 'Vérifiez la connexion au serveur.',
      }),
    });
  }

  resumeHeldCart(id: string) {
    this.salesApi.resumeHeldCart(id).subscribe({
      next: (held) => {
        this.showHeldCartsModal = false;
        if (held?.items?.length) {
          Promise.all(
            held.items.map((it: any) =>
              this.catalogApi.getProductById(it.productId).toPromise(),
            ),
          ).then((products) => {
            const newCart: CartItem[] = [];
            products.forEach((prod, index) => {
              if (prod) {
                newCart.push({ product: prod, quantity: held.items[index].quantity, discountCdf: 0 });
              }
            });
            this.cart.set(newCart);
            this.onCartChanged();
          });
        }
      },
      error: () => this.setGuidedError({
        title: 'Reprise impossible',
        message: 'Le panier est peut-être expiré ou a déjà été repris.',
        action: 'Consultez la liste actualisée des paniers en attente.',
      }),
    });
  }

  searchCustomers() {
    if (!this.customerSearchQuery.trim()) {
      this.foundCustomers = [];
      return;
    }
    this.customersApi.getCustomers({ search: this.customerSearchQuery.trim() }).subscribe({
      next: (list) => (this.foundCustomers = list),
      error: () => (this.foundCustomers = []),
    });
  }

  selectCustomer(customer: Customer) {
    this.selectedCustomer = customer;
    this.showCustomerSearch = false;
    this.customerSearchQuery = '';
    this.foundCustomers = [];
    this.onCartChanged();
  }

  onQuickCustomerCreated(customer: Customer) {
    this.selectedCustomer = customer;
    this.showQuickCustomerModal = false;
    this.onCartChanged();
  }

  onPrescriptionSelected(prescription: { id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string }) {
    this.selectedPrescription = prescription;
    this.onCartChanged();
  }
}
