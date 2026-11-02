import { Component, signal, computed, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Product, PaymentMethod, Customer, CurrencyCode } from '@vhp/shared';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { QuickCustomerFormComponent } from '../customers/quick-customer-form.component';
import { PrescriptionSelectorComponent } from '../customers/prescription-selector.component';
import { CustomersApiService } from '../../core/api/services/customers-api.service';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { SalesApiService } from '../../core/api/services/sales-api.service';
import { CashApiService } from '../../core/api/services/cash-api.service';
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
  template: `
    <div class="pos-container" (window:keydown)="handleShortcut($event)">
      @if (!cashSession()) {
        <div class="cash-required" role="alert">
          <h2>Caisse fermée</h2>
          <p>Une session de caisse ouverte est obligatoire pour vendre et encaisser au comptoir (RG-12).</p>
          <a routerLink="/cash" class="btn-open-cash">Ouvrir ma session de caisse</a>
        </div>
      } @else {
        <!-- Barre supérieure d'état et raccourcis clavier -->
        <header class="pos-header">
          <div class="header-left">
            <h2>Point de Vente (POS) · Caisse Comptoir</h2>
            <div class="header-badges">
              <span class="rate-badge">Taux du jour : 1 USD = {{ activeRate() | currencyFormat:'CDF' }}</span>
              <span class="currency-toggle">
                Devise :
                <button type="button" [class.active]="selectedCurrency === 'CDF'" (click)="setCurrency('CDF')">CDF</button>
                <button type="button" [class.active]="selectedCurrency === 'USD'" (click)="setCurrency('USD')">USD</button>
              </span>
            </div>
          </div>
          <div class="pos-actions">
            <button mat-stroked-button (click)="openHeldCartsModal()" title="[F10] Reprendre un panier">
              <mat-icon>restore</mat-icon>
              Reprendre panier (F10)
            </button>
            <button mat-stroked-button (click)="holdCart()" [disabled]="!cart().length" title="[F9] Mettre en attente">
              <mat-icon>pause_circle</mat-icon>
              Mettre en attente (F9)
            </button>
          </div>
        </header>

        <!-- Bandeau d'aide raccourcis clavier -->
        <div class="shortcuts-bar">
          <span class="shortcut-pill"><kbd>F2</kbd> Scan / Recherche</span>
          <span class="shortcut-pill"><kbd>F4</kbd> Remise ({{ globalDiscountPercent() }}%)</span>
          <span class="shortcut-pill"><kbd>F8</kbd> Encaisser</span>
          <span class="shortcut-pill"><kbd>F9</kbd> En attente</span>
          <span class="shortcut-pill"><kbd>F10</kbd> Reprendre</span>
          <span class="shortcut-pill"><kbd>Échap</kbd> Fermer dialogue</span>
        </div>

        <div class="pos-layout">
          <!-- Section gauche : Recherche, Client et Panier -->
          <section class="cart-section">
            <!-- Barre client (CLI-01 / CLI-02) -->
            <div class="customer-bar">
              <div class="customer-info" *ngIf="selectedCustomer; else noCustomer">
                <span class="badge badge-client">Client : {{ selectedCustomer.fullName }}</span>
                <span class="credit-hint" *ngIf="selectedCustomer.creditLimitCdf > 0">
                  Plafond : {{ selectedCustomer.creditLimitCdf | currencyFormat:'CDF' }} · Solde : {{ selectedCustomer.currentBalanceCdf | currencyFormat:'CDF' }}
                </span>
                <button type="button" class="btn-clear-customer" (click)="selectedCustomer = null; onCartChanged()">Changer</button>
              </div>
              <ng-template #noCustomer>
                <div class="customer-info">
                  <span class="text-muted">Client : Comptoir (Anonyme)</span>
                  <button type="button" class="btn-customer-action" (click)="showCustomerSearch = !showCustomerSearch">Rechercher</button>
                  <button type="button" class="btn-customer-action primary" (click)="showQuickCustomerModal = true">+ Création Rapide (CLI-02)</button>
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
                    <strong>{{ c.fullName }}</strong> ({{ c.code }}) - {{ c.customerType }}
                  </li>
                </ul>
              </div>
            </div>

            <!-- Champ de scan douchette / saisie rapide -->
            <div class="barcode-input-wrapper">
              <mat-icon class="scan-icon">qr_code_scanner</mat-icon>
              <input
                type="text"
                #barcodeInput
                placeholder="Scanner le code-barres (EAN-13) ou chercher un médicament / DCI [F2]..."
                (keydown.enter)="onBarcodeScanned(barcodeInput.value); barcodeInput.value = ''"
                autofocus
              />
            </div>

            <!-- Tableau du panier avec FEFO et alertes -->
            <table class="cart-table">
              <thead>
                <tr>
                  <th>Médicament (DCI)</th>
                  <th>Lot FEFO & Péremption</th>
                  <th style="width: 80px;">Qté</th>
                  <th style="width: 100px;">PU (CDF)</th>
                  <th style="width: 90px;">Remise</th>
                  <th style="width: 110px;">Total (CDF)</th>
                  <th style="width: 40px;"></th>
                </tr>
              </thead>
              <tbody>
                @for (item of cart(); track item.product.id; let i = $index) {
                  <tr [class.warning-row]="item.stockWarning || item.isNearExpiry">
                    <td>
                      <strong>{{ item.product.name }}</strong>
                      <small class="dci-subtitle">{{ item.product.dci }}</small>
                      <div class="item-badges">
                        <span *ngIf="item.requiresPrescription || item.product.requiresPrescription" class="badge-rx">Ordonnance (RG-09)</span>
                        <span *ngIf="item.isControlled || item.product.isControlledSubstance" class="badge-controlled">Stupéfiant</span>
                        <span *ngIf="item.isNearExpiry" class="badge-expiry">Péremption &lt; 90j</span>
                        <span *ngIf="item.stockWarning" class="badge-stock-alert">Stock insuffisant !</span>
                      </div>
                    </td>
                    <td>
                      <span class="lot-pill" *ngIf="item.lotNumber">
                        {{ item.lotNumber }}
                        <small class="lot-date">({{ item.expiryDate }})</small>
                      </span>
                      <span class="lot-pill auto" *ngIf="!item.lotNumber">Auto-FEFO</span>
                    </td>
                    <td>
                      <input
                        type="number"
                        class="qty-input"
                        [value]="item.quantity"
                        min="1"
                        (input)="updateQuantity(i, $any($event.target).value)"
                      />
                    </td>
                    <td>{{ item.product.sellingPriceCdf | currencyFormat:'CDF' }}</td>
                    <td>
                      <input
                        type="number"
                        class="discount-input"
                        [value]="item.discountCdf"
                        min="0"
                        placeholder="0"
                        (input)="updateLineDiscount(i, $any($event.target).value)"
                      />
                    </td>
                    <td><strong>{{ serverLineTotal(item.product.id) | currencyFormat:'CDF' }}</strong></td>
                    <td>
                      <button mat-icon-button color="warn" (click)="removeFromCart(i)" title="Retirer">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="empty-cart-message">
                      <mat-icon class="empty-icon">shopping_cart</mat-icon>
                      <p>Le panier est vide. Scannez un code-barres ou recherchez un médicament [F2].</p>
                    </td>
                  </tr>
                }
              </tbody>
            </table>

            <!-- Sélecteur d'ordonnance réutilisable si nécessaire (VTE-15, RG-09) -->
            <div class="prescription-box" *ngIf="requiresPrescription()">
              <div class="prescription-alert">
                ⚠️ Ce panier contient des médicaments nécessitant une ordonnance médicale enregistrée (RG-09).
              </div>
              <app-prescription-selector
                [customerId]="selectedCustomer?.id"
                [selectedPrescriptionId]="selectedPrescription?.id"
                (selected)="onPrescriptionSelected($event)"
              ></app-prescription-selector>
              <div *ngIf="selectedPrescription" class="selected-rx-banner">
                ✓ Ordonnance liée : <strong>{{ selectedPrescription.prescriberName }}</strong> ({{ selectedPrescription.prescriptionDate }})
              </div>
              <div *ngIf="!selectedPrescription" class="rx-missing-warning">
                La vente ne pourra pas être validée sans sélectionner une ordonnance.
              </div>
            </div>
          </section>

          <!-- Section droite : Règlement, multi-paiements et totaux -->
          <aside class="checkout-panel">
            <h3>Total à régler</h3>
            <div class="total-display">
              <span class="total-primary" *ngIf="selectedCurrency === 'CDF'">
                {{ totalCdf() | currencyFormat:'CDF' }}
              </span>
              <span class="total-primary" *ngIf="selectedCurrency === 'USD'">
                {{ totalUsd() | currencyFormat:'USD' }}
              </span>
              <span class="total-secondary">
                {{ selectedCurrency === 'CDF' ? ('≈ ' + (totalUsd() | currencyFormat:'USD')) : ('≈ ' + (totalCdf() | currencyFormat:'CDF')) }}
              </span>
            </div>
            <div class="server-note">Calculs serveur certifiés (RG-07) · Arrondi et taxes inclus.</div>

            <!-- Multi-paiements (VTE-07, VTE-08) -->
            <div class="payments-container">
              <div class="payments-header">
                <label>Lignes de règlement</label>
                <button type="button" class="btn-add-payment" (click)="addPaymentLine()">+ Ajouter mode</button>
              </div>

              @for (pay of paymentLines; track $index; let pi = $index) {
                <div class="payment-row">
                  <div class="pay-method-select">
                    <select [(ngModel)]="pay.method" (change)="onPaymentChanged()">
                      <option value="ESPECES">Espèces</option>
                      <option value="MOBILE_MONEY">Mobile Money</option>
                      <option value="CARTE_BANCAIRE">Carte bancaire</option>
                      <option value="VIREMENT">Virement</option>
                      <option value="CREDIT_CLIENT" [disabled]="!selectedCustomer">
                        {{ selectedCustomer ? 'Crédit client (' + selectedCustomer.fullName + ')' : 'Crédit client (Client requis)' }}
                      </option>
                    </select>
                    <select [(ngModel)]="pay.currency" class="pay-currency" (change)="onPaymentChanged()">
                      <option value="CDF">CDF</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>

                  <div class="pay-amount-input">
                    <input
                      type="number"
                      [(ngModel)]="pay.amount"
                      placeholder="Montant versé"
                      (input)="onPaymentChanged()"
                    />
                    <button type="button" class="btn-remove-pay" *ngIf="paymentLines.length > 1" (click)="removePaymentLine(pi)">✕</button>
                  </div>

                  <!-- Champs obligatoires Mobile Money -->
                  <div class="mobile-money-fields" *ngIf="pay.method === 'MOBILE_MONEY'">
                    <select [(ngModel)]="pay.mobileMoneyProvider">
                      <option value="M-PESA">M-Pesa</option>
                      <option value="ORANGE_MONEY">Orange Money</option>
                      <option value="AIRTEL_MONEY">Airtel Money</option>
                    </select>
                    <input
                      type="text"
                      [(ngModel)]="pay.transactionReference"
                      placeholder="Réf. transaction obligatoire"
                    />
                  </div>
                </div>
              }

              <!-- Synthèse règlement -->
              <div class="tender-summary">
                <div class="summary-line">
                  <span>Total versé :</span>
                  <strong>{{ totalPaidCdf() | currencyFormat:'CDF' }}</strong>
                </div>
                <div class="summary-line change" *ngIf="changeDue() > 0">
                  <span>Rendu de monnaie :</span>
                  <strong class="text-success">{{ changeDue() | currencyFormat:'CDF' }}</strong>
                </div>
                <div class="summary-line balance" *ngIf="outstandingCdf() > 0">
                  <span>Solde restant (créance) :</span>
                  <strong class="text-warning">{{ outstandingCdf() | currencyFormat:'CDF' }}</strong>
                </div>
              </div>
            </div>

            <!-- PIN Superviseur si nécessaire -->
            <div class="supervisor-pin-box" *ngIf="needsSupervisorPin()">
              <label>Code PIN Superviseur requis (Remise / Dérogation) :</label>
              <input type="password" [(ngModel)]="supervisorPin" placeholder="PIN à 4 chiffres" maxlength="6" />
            </div>

            <button
              mat-flat-button
              color="primary"
              class="btn-checkout"
              [disabled]="isCheckoutDisabled()"
              (click)="validateSale()"
            >
              {{ isProcessing() ? 'Validation en cours...' : 'Valider & Imprimer Ticket [F8]' }}
            </button>
          </aside>
        </div>

        <!-- Bannière d'erreur métier -->
        <div class="error-banner" *ngIf="errorMessage()" role="alert">
          <mat-icon>error_outline</mat-icon>
          <span>{{ errorMessage() }}</span>
          <button type="button" class="btn-close-err" (click)="errorMessage.set('')">✕</button>
        </div>

        <!-- Modale de succès de vente & impression rapide (REC-01) -->
        <div class="modal-backdrop" *ngIf="completedSale()">
          <div class="modal-dialog success-dialog">
            <div class="success-header">
              <mat-icon class="icon-success">check_circle</mat-icon>
              <h3>Vente validée avec succès !</h3>
              <p class="invoice-number">{{ completedSale().invoiceNumber }}</p>
            </div>
            <div class="success-body">
              <p>Total réglé : <strong>{{ completedSale().totalAmountCdf | currencyFormat:'CDF' }}</strong> ({{ completedSale().totalAmountUsd | currencyFormat:'USD' }})</p>
              <p *ngIf="lastChangeGiven() > 0" class="change-highlight">Rendu : <strong>{{ lastChangeGiven() | currencyFormat:'CDF' }}</strong></p>
            </div>
            <div class="success-actions">
              <button mat-flat-button color="primary" (click)="printTicket(completedSale().invoiceNumber)">
                <mat-icon>print</mat-icon> Imprimer Ticket 80 mm
              </button>
              <button mat-stroked-button (click)="downloadPdf(completedSale().invoiceNumber)">
                <mat-icon>picture_as_pdf</mat-icon> Facture A4
              </button>
              <button mat-stroked-button (click)="closeSuccessModalAndReset()" class="btn-new-sale">
                Nouvelle vente [Entrée]
              </button>
            </div>
          </div>
        </div>

        <!-- Modale de reprise des paniers en attente (VTE-11) -->
        <div class="modal-backdrop" *ngIf="showHeldCartsModal">
          <div class="modal-dialog held-carts-dialog">
            <div class="modal-title-bar">
              <h3>Paniers en attente (VTE-11)</h3>
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

        <!-- Modale de remise globale (F4) -->
        <div class="modal-backdrop" *ngIf="showDiscountModal">
          <div class="modal-dialog discount-dialog">
            <div class="modal-title-bar">
              <h3>Remise globale sur le panier (F4)</h3>
              <button type="button" class="btn-close-modal" (click)="showDiscountModal = false">✕</button>
            </div>
            <div class="discount-modal-body">
              <label>Pourcentage de remise (%) :</label>
              <input type="number" [(ngModel)]="tempDiscountPercent" min="0" max="100" />
              <label>PIN Superviseur (si dépassement de plafond) :</label>
              <input type="password" [(ngModel)]="supervisorPin" placeholder="PIN superviseur" />
              <div class="modal-actions">
                <button mat-stroked-button (click)="showDiscountModal = false">Annuler</button>
                <button mat-flat-button color="primary" (click)="applyGlobalDiscount()">Appliquer</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Dialogue Modal de Création Rapide de Client (CLI-02) -->
        <div class="modal-backdrop" *ngIf="showQuickCustomerModal">
          <app-quick-customer-form
            (created)="onQuickCustomerCreated($event)"
            (cancelled)="showQuickCustomerModal = false"
          ></app-quick-customer-form>
        </div>
      }
    </div>
  `,
  styles: [`
    .pos-container { padding: 12px; font-family: var(--vhp-font); }
    .cash-required { padding: 48px; text-align: center; background: #fff8e1; border: 1px solid #f2c94c; border-radius: 12px; }
    .btn-open-cash { display: inline-block; margin-top: 16px; background: #116149; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 700; }
    .pos-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .header-left { display: flex; flex-direction: column; gap: 6px; }
    .header-badges { display: flex; align-items: center; gap: 12px; }
    .rate-badge { background: #e6f4ea; color: #137333; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 13px; }
    .currency-toggle { font-size: 13px; font-weight: 600; }
    .currency-toggle button { margin-left: 4px; padding: 3px 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; border-radius: 4px; }
    .currency-toggle button.active { background: #116149; color: #fff; border-color: #116149; }
    .pos-actions { display: flex; gap: 8px; }
    .shortcuts-bar { display: flex; gap: 12px; background: #f1f3f4; padding: 6px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 12px; color: #444; flex-wrap: wrap; }
    .shortcut-pill kbd { background: #fff; border: 1px solid #ccc; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 11px; }
    .pos-layout { display: grid; grid-template-columns: 1fr 380px; gap: 20px; }
    .customer-bar { background: #f8faf9; border: 1px solid #d5ded9; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; position: relative; }
    .customer-info { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .badge-client { background: #116149; color: white; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 13px; }
    .credit-hint { color: #556960; font-size: 12px; }
    .btn-clear-customer { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; border-radius: 4px; padding: 2px 8px; font-size: 12px; cursor: pointer; }
    .btn-customer-action { background: #fff; border: 1px solid #cbd5d0; border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
    .btn-customer-action.primary { background: #116149; color: white; border-color: #116149; }
    .customer-search-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #cbd5d0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; padding: 8px; }
    .customer-search-dropdown input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #cbd5d0; border-radius: 4px; margin-bottom: 6px; }
    .customer-search-dropdown ul { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto; }
    .customer-search-dropdown li { padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; font-size: 13px; }
    .customer-search-dropdown li:hover { background: #f0fdf4; }
    .barcode-input-wrapper { position: relative; margin-bottom: 12px; }
    .scan-icon { position: absolute; left: 12px; top: 12px; color: #0f9d58; }
    .barcode-input-wrapper input { width: 100%; box-sizing: border-box; height: 48px; font-size: 16px; padding-left: 44px; padding-right: 16px; border: 2px solid #0f9d58; border-radius: 8px; }
    .cart-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .cart-table th { background: #f8faf9; padding: 10px; border-bottom: 1px solid #e0e0e0; text-align: left; font-size: 13px; }
    .cart-table td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: middle; }
    .dci-subtitle { display: block; color: #666; font-size: 11px; }
    .item-badges { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
    .badge-rx { background: #fce8e6; color: #c5221f; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
    .badge-controlled { background: #fff3e0; color: #e65100; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
    .badge-expiry { background: #fef3c7; color: #92400e; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
    .badge-stock-alert { background: #fee2e2; color: #991b1b; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
    .lot-pill { background: #e8f0fe; color: #1967d2; font-size: 11px; padding: 3px 8px; border-radius: 12px; font-weight: 600; display: inline-block; }
    .lot-pill.auto { background: #f1f3f4; color: #5f6368; }
    .lot-date { font-weight: normal; font-size: 10px; }
    .qty-input, .discount-input { width: 60px; padding: 6px; border: 1px solid #ccc; border-radius: 4px; text-align: center; }
    .empty-cart-message { text-align: center !important; color: #757575; padding: 36px !important; }
    .empty-icon { font-size: 48px; width: 48px; height: 48px; color: #ccc; margin-bottom: 8px; }
    .prescription-box { margin-top: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; }
    .prescription-alert { color: #b45309; font-weight: 600; font-size: 13px; margin-bottom: 8px; }
    .selected-rx-banner { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 6px 12px; border-radius: 4px; font-size: 13px; margin-top: 6px; }
    .rx-missing-warning { color: #b91c1c; font-size: 12px; font-weight: 600; margin-top: 6px; }
    .checkout-panel { background: #f8f9fa; border: 1px solid #dadce0; border-radius: 12px; padding: 20px; }
    .total-display { margin: 12px 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 12px; }
    .total-primary { display: block; font-size: 30px; font-weight: 800; color: #1e3a2f; }
    .total-secondary { display: block; font-size: 16px; color: #5f6368; font-weight: 600; }
    .server-note { font-size: 11px; color: #5f6368; margin-bottom: 12px; }
    .payments-container { margin-top: 12px; }
    .payments-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .payments-header label { font-size: 13px; font-weight: 700; }
    .btn-add-payment { background: none; border: none; color: #116149; font-weight: 700; font-size: 12px; cursor: pointer; }
    .payment-row { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px; margin-bottom: 8px; }
    .pay-method-select { display: flex; gap: 6px; margin-bottom: 6px; }
    .pay-method-select select { flex: 1; height: 36px; padding: 0 8px; border: 1px solid #ccc; border-radius: 4px; }
    .pay-currency { width: 70px !important; flex: none !important; }
    .pay-amount-input { display: flex; gap: 6px; align-items: center; }
    .pay-amount-input input { flex: 1; height: 36px; padding: 0 8px; border: 1px solid #ccc; border-radius: 4px; font-weight: 700; }
    .btn-remove-pay { background: #fee2e2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 4px; width: 32px; height: 32px; cursor: pointer; }
    .mobile-money-fields { display: flex; gap: 6px; margin-top: 6px; }
    .mobile-money-fields select, .mobile-money-fields input { flex: 1; height: 32px; padding: 0 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; }
    .tender-summary { background: #eef2f0; padding: 10px; border-radius: 6px; margin: 12px 0; }
    .summary-line { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
    .text-success { color: #137333; }
    .text-warning { color: #b45309; }
    .supervisor-pin-box { margin-bottom: 12px; }
    .supervisor-pin-box label { display: block; font-size: 12px; font-weight: 600; color: #b45309; margin-bottom: 4px; }
    .supervisor-pin-box input { width: 100%; box-sizing: border-box; height: 36px; padding: 0 8px; border: 1px solid #b45309; border-radius: 4px; }
    .btn-checkout { width: 100%; height: 52px; font-size: 16px; font-weight: 700; margin-top: 12px; }
    .error-banner { margin-top: 12px; padding: 12px; border-radius: 6px; background: #fee2e2; color: #991b1b; display: flex; align-items: center; gap: 8px; }
    .btn-close-err { margin-left: auto; background: none; border: none; cursor: pointer; color: #991b1b; font-weight: 700; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 1200; }
    .modal-dialog { background: white; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; box-shadow: 0 8px 24px rgba(0,0,0,0.25); }
    .success-dialog { text-align: center; }
    .icon-success { font-size: 56px; width: 56px; height: 56px; color: #0f9d58; margin-bottom: 8px; }
    .invoice-number { font-size: 20px; font-weight: 800; color: #116149; margin: 6px 0; }
    .change-highlight { font-size: 18px; color: #137333; font-weight: 700; }
    .success-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
    .modal-title-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .btn-close-modal { background: none; border: none; font-size: 18px; cursor: pointer; }
    .held-carts-list { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .held-cart-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8faf9; border: 1px solid #e0e0e0; border-radius: 6px; }
    .discount-modal-body input { width: 100%; box-sizing: border-box; height: 38px; padding: 0 10px; margin-bottom: 12px; border: 1px solid #ccc; border-radius: 6px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  `],
})
export class PosComponent implements OnInit {
  @ViewChild('barcodeInput') barcodeInputRef!: ElementRef<HTMLInputElement>;

  private readonly customersApi = inject(CustomersApiService);
  private readonly salesApi = inject(SalesApiService);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly cashApi = inject(CashApiService);

  cashSession = signal<any>(null);
  activeRate = signal<number>(2850.0);
  selectedCurrency: CurrencyCode = 'CDF';

  cart = signal<CartItem[]>([]);
  paymentLines: PaymentLine[] = [{ method: 'ESPECES', amount: 0, currency: 'CDF' }];
  supervisorPin = '';
  isProcessing = signal<boolean>(false);
  errorMessage = signal('');

  // Clé d'idempotence persistée par tentative (VTE-18, RG-16)
  currentIdempotencyKey = signal<string>(crypto.randomUUID());

  // Client & Ordonnance (CLI-02 / VTE-15)
  selectedCustomer: Customer | null = null;
  selectedPrescription: { id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string } | null = null;
  showQuickCustomerModal = false;
  showCustomerSearch = false;
  customerSearchQuery = '';
  foundCustomers: Customer[] = [];

  // Modales
  showHeldCartsModal = false;
  heldCartsList: any[] = [];
  showDiscountModal = false;
  tempDiscountPercent = 0;
  globalDiscountPercent = signal<number>(0);

  // Vente complétée pour affichage / impression (REC-01)
  completedSale = signal<any>(null);
  lastChangeGiven = signal<number>(0);

  // Valeurs calculées côté serveur (RG-07)
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

  serverLineTotal(productId: string): number {
    return this.serverLineTotals()[productId] || 0;
  }

  requiresPrescription = computed(() => {
    return this.cart().some((i) => i.requiresPrescription || i.product.requiresPrescription);
  });

  needsSupervisorPin = computed(() => {
    return this.globalDiscountPercent() > 5 || this.cart().some((i) => i.discountCdf > 0);
  });

  ngOnInit(): void {
    this.cashApi.getActiveSession().subscribe({
      next: (session) => this.cashSession.set(session),
      error: () => this.cashSession.set(null),
    });
  }

  setCurrency(c: CurrencyCode) {
    this.selectedCurrency = c;
    this.onCartChanged();
  }

  handleShortcut(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.showCustomerSearch = false;
      this.showQuickCustomerModal = false;
      this.showHeldCartsModal = false;
      this.showDiscountModal = false;
      if (this.completedSale()) this.closeSuccessModalAndReset();
    }
    if (event.key === 'F2') {
      event.preventDefault();
      this.focusBarcodeInput();
    }
    if (event.key === 'F4') {
      event.preventDefault();
      this.tempDiscountPercent = this.globalDiscountPercent();
      this.showDiscountModal = true;
    }
    if (event.key === 'F8') {
      event.preventDefault();
      if (!this.isCheckoutDisabled()) this.validateSale();
    }
    if (event.key === 'F9') {
      event.preventDefault();
      this.holdCart();
    }
    if (event.key === 'F10') {
      event.preventDefault();
      this.openHeldCartsModal();
    }
    if (event.key === 'Enter' && this.completedSale()) {
      event.preventDefault();
      this.closeSuccessModalAndReset();
    }
  }

  focusBarcodeInput() {
    setTimeout(() => {
      this.barcodeInputRef?.nativeElement?.focus();
    }, 100);
  }

  onBarcodeScanned(code: string) {
    if (!code?.trim()) return;
    this.catalogApi.autocomplete(code.trim()).subscribe({
      next: (matches) => {
        const match: any = matches[0];
        if (!match?.id) {
          this.errorMessage.set(`Aucun produit trouvé pour « ${code} ».`);
          return;
        }
        this.catalogApi.getProductById(match.id).subscribe({
          next: (product) => {
            const current = [...this.cart()];
            const existing = current.find((line) => line.product.id === product.id);
            if (existing) {
              existing.quantity += 1;
              this.cart.set(current);
            } else {
              this.cart.set([...current, { product, quantity: 1, discountCdf: 0 }]);
            }
            this.onCartChanged();
            this.focusBarcodeInput();
          },
        });
      },
    });
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

    const dto = this.buildSaleDto();
    this.salesApi.previewSale(dto).subscribe({
      next: (p) => {
        this.serverTotalCdf.set(Number(p.totalCdf));
        this.serverTotalUsd.set(Number(p.totalUsd));
        this.activeRate.set(Number(p.exchangeRate));
        this.serverChangeCdf.set(Number(p.changeCdf || 0));
        this.serverOutstandingCdf.set(Number(p.outstandingCdf || 0));

        // Mettre à jour les informations de lot FEFO reçues du serveur
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

        // Si 1 seule ligne de paiement avec montant à 0, pré-remplir le montant total
        if (this.paymentLines.length === 1 && (!this.paymentLines[0].amount || this.paymentLines[0].amount === 0)) {
          this.paymentLines[0].amount = this.selectedCurrency === 'USD' ? p.totalUsd : p.totalCdf;
        }
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Erreur lors du calcul de la prévisualisation.');
      },
    });
  }

  buildSaleDto(): CreateSaleRequestDto {
    return {
      currency: this.selectedCurrency,
      customerId: this.selectedCustomer?.id,
      prescriptionId: this.selectedPrescription?.id,
      supervisorPin: this.supervisorPin.trim() || undefined,
      items: this.cart().map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        discountCdf: i.discountCdf || 0,
        lotId: i.lotId,
      })),
      payments: this.paymentLines.map((p) => ({
        method: p.method,
        amountPaid: Number(p.amount) || 0,
        currency: p.currency,
        mobileMoneyProvider: p.method === 'MOBILE_MONEY' ? p.mobileMoneyProvider : undefined,
        transactionReference: p.method === 'MOBILE_MONEY' ? p.transactionReference?.trim() : undefined,
      })),
    };
  }

  isCheckoutDisabled(): boolean {
    if (this.cart().length === 0 || this.isProcessing()) return true;
    if (this.requiresPrescription() && !this.selectedPrescription) return true;
    const hasCredit = this.paymentLines.some((p) => p.method === 'CREDIT_CLIENT') || this.outstandingCdf() > 0;
    if (hasCredit && !this.selectedCustomer) return true;
    return false;
  }

  validateSale() {
    if (this.isCheckoutDisabled()) return;
    this.isProcessing.set(true);
    this.errorMessage.set('');

    const dto = this.buildSaleDto();
    // Conserver la même clé d'idempotence pour cette tentative
    const key = this.currentIdempotencyKey();

    this.salesApi.createSale(dto, key).subscribe({
      next: (sale) => {
        this.isProcessing.set(false);
        this.lastChangeGiven.set(this.serverChangeCdf());
        this.completedSale.set(sale);

        // Vente réussie : générer une NOUVELLE clé d'idempotence pour la future vente
        this.currentIdempotencyKey.set(crypto.randomUUID());
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.errorMessage.set(
          err?.error?.message || 'La vente a été refusée. Vérifiez les règles métier et vos autorisations.',
        );
      },
    });
  }

  closeSuccessModalAndReset() {
    this.completedSale.set(null);
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
    this.focusBarcodeInput();
  }

  printTicket(invoiceNumber: string) {
    this.salesApi.getInvoiceDocument(invoiceNumber, true).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) {
          win.onload = () => {
            win.print();
          };
        }
      },
      error: () => this.errorMessage.set('Erreur lors de la génération du ticket thermique 80 mm.'),
    });
  }

  downloadPdf(invoiceNumber: string) {
    this.salesApi.getInvoiceDocument(invoiceNumber, false).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceNumber}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.errorMessage.set('Erreur lors du téléchargement du document PDF.'),
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
      })
      .subscribe({
        next: () => {
          this.closeSuccessModalAndReset();
        },
        error: () => this.errorMessage.set('Erreur lors de la mise en attente du panier.'),
      });
  }

  openHeldCartsModal() {
    this.salesApi.listHeldCarts().subscribe({
      next: (list) => {
        this.heldCartsList = list || [];
        this.showHeldCartsModal = true;
      },
      error: () => this.errorMessage.set('Impossible de charger les paniers en attente.'),
    });
  }

  resumeHeldCart(id: string) {
    this.salesApi.resumeHeldCart(id).subscribe({
      next: (held) => {
        this.showHeldCartsModal = false;
        if (held?.items?.length) {
          // Recharger les articles
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
      error: () => this.errorMessage.set('Erreur lors de la reprise du panier.'),
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
