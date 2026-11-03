import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product, CurrencyCode, PaymentMethod } from '@vhp/shared';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="pos-container">
      <header class="pos-header">
        <div>
          <h2>Point de vente · comptoir</h2>
          <span class="rate-badge">Taux du jour : 1 USD = {{ activeRate() }} CDF</span>
        </div>
        <div class="pos-actions">
          <button (click)="holdCart()" class="btn-outline">Mettre en attente</button>
        </div>
      </header>

      <div class="pos-layout">
        <!-- Recherche et Panier -->
        <section class="cart-section">
          <div class="barcode-input-wrapper">
            <input
              type="text"
              #barcodeInput
              placeholder="Scanner le code-barres (EAN-13) ou chercher un médicament / DCI..."
              (keydown.enter)="onBarcodeScanned(barcodeInput.value); barcodeInput.value = ''"
              autofocus
            />
          </div>

          <table class="cart-table">
            <thead>
              <tr>
                <th>Médicament (DCI)</th>
                <th>Qté</th>
                <th>Prix Unitaire (CDF)</th>
                <th>Total (CDF)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of cart(); let i = index">
                <td>
                  <strong>{{ item.product.name }}</strong>
                  <small>{{ item.product.dci }}</small>
                  <span *ngIf="item.product.requiresPrescription" class="badge-rx">Ordonnance requise</span>
                </td>
                <td>
                  <input
                    type="number"
                    [value]="item.quantity"
                    min="1"
                    (input)="updateQuantity(i, $any($event.target).value)"
                  />
                </td>
                <td>{{ item.product.sellingPriceCdf | number }} CDF</td>
                <td><strong>{{ item.quantity * item.product.sellingPriceCdf | number }} CDF</strong></td>
                <td><button (click)="removeFromCart(i)" class="btn-remove">×</button></td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Règlement & Encaissement -->
        <aside class="checkout-panel">
          <h3>Total à régler</h3>
          <div class="total-display">
            <span class="total-cdf">{{ totalCdf() | number }} CDF</span>
            <span class="total-usd">≈ {{ totalUsd() | number:'1.2-2' }} USD</span>
          </div>

          <div class="payment-method-selector">
            <label>Mode de paiement</label>
            <select [(ngModel)]="selectedPaymentMethod">
              <option value="ESPECES">Espèces (CDF / USD)</option>
              <option value="MOBILE_MONEY">Mobile Money (M-Pesa / Orange / Airtel)</option>
              <option value="CARTE_BANCAIRE">Carte bancaire</option>
              <option value="CREDIT_CLIENT">Crédit partenaire</option>
            </select>
          </div>

          <div class="tender-section" *ngIf="selectedPaymentMethod === 'ESPECES'">
            <label>Montant reçu (CDF)</label>
            <input type="number" [(ngModel)]="amountTendered" />
            <div class="change-due" *ngIf="changeDue() > 0">
              Rendu monnaie : <strong>{{ changeDue() | number }} CDF</strong>
            </div>
          </div>

          <button
            class="btn-checkout"
            [disabled]="cart().length === 0 || isProcessing()"
            (click)="validateSale()"
          >
            {{ isProcessing() ? 'Validation en cours...' : 'Valider et imprimer le ticket' }}
          </button>
        </aside>
      </div>
    </div>
  `,
  styles: [`
    .pos-container { padding: 24px; font-family: 'DM Sans', sans-serif; }
    .pos-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .rate-badge { background: #e6f4ea; color: #137333; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 13px; }
    .pos-layout { display: grid; grid-template-columns: 1fr 360px; gap: 24px; }
    .barcode-input-wrapper input { width: 100%; height: 48px; font-size: 16px; padding: 0 16px; border: 2px solid #0f9d58; border-radius: 8px; margin-bottom: 16px; }
    .cart-table { width: 100%; border-collapse: collapse; }
    .cart-table th, .cart-table td { padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: left; }
    .badge-rx { display: inline-block; background: #fce8e6; color: #c5221f; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 8px; }
    .checkout-panel { background: #f8f9fa; border: 1px solid #dadce0; border-radius: 12px; padding: 24px; }
    .total-display { margin: 16px 0; border-bottom: 1px solid #e0e0e0; padding-bottom: 16px; }
    .total-cdf { display: block; font-size: 32px; font-weight: 800; color: #1e3a2f; }
    .total-usd { display: block; font-size: 18px; color: #5f6368; font-weight: 600; }
    .btn-checkout { width: 100%; height: 52px; background: #0f9d58; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 20px; }
    .btn-checkout:disabled { background: #ccc; cursor: not-allowed; }
  `],
})
export class PosComponent {
  activeRate = signal<number>(2850.0); // Taux de change du jour (RG-08)
  cart = signal<{ product: Product; quantity: number }[]>([]);
  selectedPaymentMethod: PaymentMethod = 'ESPECES';
  amountTendered = 0;
  isProcessing = signal<boolean>(false);

  totalCdf = computed(() =>
    this.cart().reduce((sum, item) => sum + item.quantity * item.product.sellingPriceCdf, 0),
  );

  totalUsd = computed(() =>
    this.totalCdf() > 0 ? Number((this.totalCdf() / this.activeRate()).toFixed(2)) : 0,
  );

  changeDue = computed(() =>
    this.amountTendered > this.totalCdf() ? this.amountTendered - this.totalCdf() : 0,
  );

  onBarcodeScanned(code: string) {
    if (!code) return;
    console.log('[POS] Scan code-barres reçu :', code);
  }

  updateQuantity(index: number, quantity: number) {
    const current = [...this.cart()];
    if (quantity > 0) {
      current[index].quantity = Number(quantity);
      this.cart.set(current);
    }
  }

  removeFromCart(index: number) {
    const current = [...this.cart()];
    current.splice(index, 1);
    this.cart.set(current);
  }

  holdCart() {
    console.log('[POS] Mise en attente panier (VTE-11)');
  }

  validateSale() {
    this.isProcessing.set(true);
    console.log('[POS] Validation de vente initiée selon FEFO (RG-01)...');
    setTimeout(() => {
      this.isProcessing.set(false);
      this.cart.set([]);
      this.amountTendered = 0;
      alert('Vente validée avec succès ! Ticket imprimé.');
    }, 800);
  }
}

