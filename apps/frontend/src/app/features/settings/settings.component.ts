import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';

import { SettingsApiService } from '../../core/api/services/settings-api.service';
import { AlertService } from '../../core/services/alert.service';
import { I18N_FR } from '../../core/i18n/translations.fr';
import {
  PharmacyIdentity,
  FinancialRules,
  AlertThresholds,
  PrintTemplates,
  TaxItem,
  RoundingRule,
  CurrencyCode,
} from '@vhp/shared';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  template: `
    <div class="settings-page">
      <header class="page-header">
        <div>
          <h2>{{ i18n.settings.title }}</h2>
          <p class="subtitle">{{ i18n.settings.subtitle }}</p>
        </div>

        <!-- Raccourcis modules d'administration -->
        <div class="header-shortcuts">
          <a mat-stroked-button color="primary" routerLink="/settings/exchange-rates">
            <mat-icon>currency_exchange</mat-icon> Taux de change
          </a>
          <a mat-stroked-button color="accent" routerLink="/settings/import">
            <mat-icon>upload_file</mat-icon> Assistant d'import
          </a>
        </div>
      </header>

      @if (isLoading()) {
        <div class="loading-state">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Chargement des paramètres de l’officine...</p>
        </div>
      } @else {
        <mat-card class="settings-tabs-card">
          <mat-tab-group animationDuration="200ms">
            <!-- ── ONGLET 1 : IDENTITÉ OFFICINE (PAR-01) ── -->
            <mat-tab>
              <ng-template mat-tab-label>
                <mat-icon class="tab-icon">storefront</mat-icon>
                {{ i18n.settings.identityTab }}
              </ng-template>

              <div class="tab-content">
                <form (ngSubmit)="saveIdentity()" class="tab-form">
                  <div class="identity-layout">
                    <!-- Données textuelles -->
                    <div class="identity-fields">
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{ i18n.settings.pharmacyName }}</mat-label>
                        <input matInput [(ngModel)]="identity.name" name="name" required />
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{ i18n.settings.address }}</mat-label>
                        <textarea matInput rows="2" [(ngModel)]="identity.address" name="address"></textarea>
                      </mat-form-field>

                      <div class="form-row">
                        <mat-form-field appearance="outline" class="col">
                          <mat-label>{{ i18n.settings.phone }}</mat-label>
                          <input matInput [(ngModel)]="identity.phone" name="phone" />
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="col">
                          <mat-label>{{ i18n.settings.email }}</mat-label>
                          <input matInput [(ngModel)]="identity.email" name="email" type="email" />
                        </mat-form-field>
                      </div>

                      <div class="form-row">
                        <mat-form-field appearance="outline" class="col">
                          <mat-label>{{ i18n.settings.rccm }}</mat-label>
                          <input matInput [(ngModel)]="identity.rccm" name="rccm" placeholder="CD/KIN/RCCM/..." />
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="col">
                          <mat-label>{{ i18n.settings.idNat }}</mat-label>
                          <input matInput [(ngModel)]="identity.idNat" name="idNat" placeholder="01-..." />
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="col">
                          <mat-label>{{ i18n.settings.nif }}</mat-label>
                          <input matInput [(ngModel)]="identity.nif" name="nif" placeholder="A1234567B" />
                        </mat-form-field>
                      </div>

                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{ i18n.settings.legalNotice }}</mat-label>
                        <textarea matInput rows="2" [(ngModel)]="identity.legalNotice" name="legalNotice"></textarea>
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{ i18n.settings.invoiceFooter }}</mat-label>
                        <input matInput [(ngModel)]="identity.invoiceFooter" name="invoiceFooter" />
                      </mat-form-field>
                    </div>

                    <!-- Upload Logo -->
                    <div class="logo-box">
                      <h4>{{ i18n.settings.logoUpload }}</h4>
                      <div class="logo-preview">
                        @if (identity.logoUrl) {
                          <img [src]="identity.logoUrl" alt="Logo de l'officine" class="logo-img" />
                        } @else {
                          <mat-icon class="placeholder-icon">local_pharmacy</mat-icon>
                          <span>Aucun logo</span>
                        }
                      </div>

                      <input
                        #logoInput
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        (change)="onLogoSelected($event)"
                        style="display: none;"
                      />

                      <button
                        mat-stroked-button
                        color="primary"
                        type="button"
                        (click)="logoInput.click()"
                        [disabled]="isUploadingLogo()"
                      >
                        @if (isUploadingLogo()) {
                          <mat-spinner diameter="16"></mat-spinner>
                        } @else {
                          <ng-container>
                            <mat-icon>upload</mat-icon>
                            <span>Choisir un logo</span>
                          </ng-container>
                        }
                      </button>
                      <span class="logo-help">{{ i18n.settings.logoHelp }}</span>
                    </div>
                  </div>

                  <div class="tab-actions">
                    <button mat-flat-button color="primary" type="submit" [disabled]="isSaving()">
                      @if (isSaving()) {
                        <mat-spinner diameter="18" class="btn-spinner"></mat-spinner>
                      }
                      {{ i18n.actions.save }}
                    </button>
                  </div>
                </form>
              </div>
            </mat-tab>

            <!-- ── ONGLET 2 : DEVISES, ARRONDIS & TAXES (PAR-02, FIN-04, RG-07) ── -->
            <mat-tab>
              <ng-template mat-tab-label>
                <mat-icon class="tab-icon">payments</mat-icon>
                {{ i18n.settings.financialTab }}
              </ng-template>

              <div class="tab-content">
                <form (ngSubmit)="saveFinancial()" class="tab-form">
                  <!-- Monnaies & Arrondis -->
                  <div class="section-block">
                    <h3 class="section-title">Règles monétaires et arrondis</h3>
                    
                    <div class="form-row">
                      <mat-form-field appearance="outline" class="col">
                        <mat-label>{{ i18n.settings.defaultCurrency }}</mat-label>
                        <mat-select [(ngModel)]="financial.defaultCurrency" name="defaultCurrency">
                          <mat-option value="CDF">Franc Congolais (CDF)</mat-option>
                          <mat-option value="USD">Dollar Américain (USD)</mat-option>
                        </mat-select>
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="col">
                        <mat-label>{{ i18n.settings.roundingRuleCdf }}</mat-label>
                        <mat-select [(ngModel)]="financial.cdfRoundingRule" name="cdfRoundingRule">
                          <mat-option value="ENTIER">À l'unité supérieure (1 CDF)</mat-option>
                          <mat-option value="CINQUANTE">Au multiple de 50 CDF</mat-option>
                          <mat-option value="CENT">Au multiple de 100 CDF</mat-option>
                        </mat-select>
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="col">
                        <mat-label>{{ i18n.settings.roundingRuleUsd }}</mat-label>
                        <mat-select [(ngModel)]="financial.usdRoundingRule" name="usdRoundingRule">
                          <mat-option value="DECIMAL_2">2 décimales (0.01 USD)</mat-option>
                        </mat-select>
                      </mat-form-field>
                    </div>

                    <!-- Simulateur interactif d'arrondi -->
                    <div class="rounding-simulator">
                      <mat-icon color="primary">calculate</mat-icon>
                      <span>Simulateur d'arrondi CDF :</span>
                      <input
                        type="number"
                        [(ngModel)]="simAmount"
                        name="simAmount"
                        class="sim-input"
                        placeholder="Ex : 12345"
                      />
                      <span>CDF devient</span>
                      <strong class="sim-result">{{ getSimulatedRounding() }} CDF</strong>
                      <span class="sim-badge">Règle {{ financial.cdfRoundingRule }}</span>
                    </div>
                  </div>

                  <mat-divider></mat-divider>

                  <!-- Modes de paiement -->
                  <div class="section-block">
                    <h3 class="section-title">{{ i18n.settings.paymentMethods }}</h3>
                    <div class="payment-methods-grid">
                      @for (method of availablePaymentMethods; track method.code) {
                        <mat-checkbox
                          [checked]="isPaymentMethodActive(method.code)"
                          (change)="togglePaymentMethod(method.code, $event.checked)"
                          color="primary"
                        >
                          {{ method.label }}
                        </mat-checkbox>
                      }
                    </div>
                  </div>

                  <mat-divider></mat-divider>

                  <!-- Tableau des taxes éditable -->
                  <div class="section-block">
                    <div class="block-header">
                      <h3 class="section-title">{{ i18n.settings.taxesTitle }}</h3>
                      <button mat-stroked-button color="primary" type="button" (click)="addTax()">
                        <mat-icon>add</mat-icon> {{ i18n.settings.addTax }}
                      </button>
                    </div>

                    <div class="table-container">
                    <table mat-table [dataSource]="financial.taxes" class="taxes-table">
                      <ng-container matColumnDef="code">
                        <th mat-header-cell *matHeaderCellDef>{{ i18n.settings.taxCode }}</th>
                        <td mat-cell *matCellDef="let tax; let idx = index">
                          <input matInput [(ngModel)]="tax.code" [name]="'tax_code_' + idx" class="table-input" />
                        </td>
                      </ng-container>

                      <ng-container matColumnDef="label">
                        <th mat-header-cell *matHeaderCellDef>{{ i18n.settings.taxLabel }}</th>
                        <td mat-cell *matCellDef="let tax; let idx = index">
                          <input matInput [(ngModel)]="tax.label" [name]="'tax_label_' + idx" class="table-input" />
                        </td>
                      </ng-container>

                      <ng-container matColumnDef="rate">
                        <th mat-header-cell *matHeaderCellDef>{{ i18n.settings.taxRate }}</th>
                        <td mat-cell *matCellDef="let tax; let idx = index">
                          <input
                            matInput
                            type="number"
                            step="0.1"
                            [(ngModel)]="tax.rate"
                            [name]="'tax_rate_' + idx"
                            class="table-input small"
                          />
                        </td>
                      </ng-container>

                      <ng-container matColumnDef="isDefault">
                        <th mat-header-cell *matHeaderCellDef>{{ i18n.settings.taxDefault }}</th>
                        <td mat-cell *matCellDef="let tax; let idx = index">
                          <mat-checkbox
                            [checked]="tax.isDefault"
                            (change)="setDefaultTax(idx)"
                            color="primary"
                          ></mat-checkbox>
                        </td>
                      </ng-container>

                      <ng-container matColumnDef="actions">
                        <th mat-header-cell *matHeaderCellDef>Action</th>
                        <td mat-cell *matCellDef="let tax; let idx = index">
                          <button
                            mat-icon-button
                            color="warn"
                            type="button"
                            (click)="removeTax(idx)"
                            matTooltip="Supprimer cette taxe"
                          >
                            <mat-icon>delete_outline</mat-icon>
                          </button>
                        </td>
                      </ng-container>

                      <tr mat-header-row *matHeaderRowDef="taxColumns"></tr>
                      <tr mat-row *matRowDef="let row; columns: taxColumns;"></tr>
                    </table>
                    </div>
                  </div>

                  <mat-divider></mat-divider>

                  <!-- Plafonds de remise par rôle -->
                  <div class="section-block">
                    <h3 class="section-title">{{ i18n.settings.discountCapsTitle }}</h3>
                    <div class="form-row">
                      <mat-form-field appearance="outline" class="col">
                        <mat-label>Administrateur (%)</mat-label>
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="financial.discountCapsByRole['ADMIN']"
                          name="discount_ADMIN"
                        />
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="col">
                        <mat-label>Pharmacien Titulaire (%)</mat-label>
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="financial.discountCapsByRole['PHARMACIEN']"
                          name="discount_PHARMACIEN"
                        />
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="col">
                        <mat-label>Caissier / Vendeur (%)</mat-label>
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="financial.discountCapsByRole['CAISSIER']"
                          name="discount_CAISSIER"
                        />
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="col">
                        <mat-label>Gestionnaire de Stock (%)</mat-label>
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="financial.discountCapsByRole['STOCK']"
                          name="discount_STOCK"
                        />
                      </mat-form-field>
                    </div>
                  </div>

                  <div class="tab-actions">
                    <button mat-flat-button color="primary" type="submit" [disabled]="isSaving()">
                      @if (isSaving()) {
                        <mat-spinner diameter="18" class="btn-spinner"></mat-spinner>
                      }
                      {{ i18n.actions.save }}
                    </button>
                  </div>
                </form>
              </div>
            </mat-tab>

            <!-- ── ONGLET 3 : SÉCURITÉ & SEUILS (PAR-03, AUT-03) ── -->
            <mat-tab>
              <ng-template mat-tab-label>
                <mat-icon class="tab-icon">security</mat-icon>
                {{ i18n.settings.securityTab }}
              </ng-template>

              <div class="tab-content">
                <form (ngSubmit)="saveAlerts()" class="tab-form">
                  <div class="section-block">
                    <h3 class="section-title">{{ i18n.settings.expiryAlertsTitle }}</h3>
                    <p class="section-desc">Paliers d’anticipation pour les alertes de péremption des médicaments.</p>

                    <div class="form-row">
                      <mat-form-field appearance="outline" class="col">
                        <mat-label>Seuil critique (Jours)</mat-label>
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="alerts.expiryWarningDays[0]"
                          name="expiry_0"
                          placeholder="30"
                        />
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="col">
                        <mat-label>Seuil intermédiaire (Jours)</mat-label>
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="alerts.expiryWarningDays[1]"
                          name="expiry_1"
                          placeholder="60"
                        />
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="col">
                        <mat-label>Seuil d'anticipation (Jours)</mat-label>
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="alerts.expiryWarningDays[2]"
                          name="expiry_2"
                          placeholder="90"
                        />
                      </mat-form-field>
                    </div>
                  </div>

                  <mat-divider></mat-divider>

                  <div class="section-block">
                    <h3 class="section-title">Sécurité de session & Stocks</h3>
                    
                    <div class="form-row">
                      <mat-form-field appearance="outline" class="col">
                        <mat-label>{{ i18n.settings.inactivityTimeout }}</mat-label>
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="alerts.inactivityTimeoutMinutes"
                          name="inactivityTimeout"
                          min="5"
                          max="120"
                        />
                        <span matSuffix class="suffix">minutes</span>
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="col">
                        <mat-label>{{ i18n.settings.lowStockThreshold }}</mat-label>
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="alerts.lowStockDefaultThreshold"
                          name="lowStockThreshold"
                          min="1"
                        />
                        <span matSuffix class="suffix">unités</span>
                      </mat-form-field>
                    </div>
                  </div>

                  <div class="tab-actions">
                    <button mat-flat-button color="primary" type="submit" [disabled]="isSaving()">
                      @if (isSaving()) {
                        <mat-spinner diameter="18" class="btn-spinner"></mat-spinner>
                      }
                      {{ i18n.actions.save }}
                    </button>
                  </div>
                </form>
              </div>
            </mat-tab>

            <!-- ── ONGLET 4 : MODÈLES D'IMPRESSION (PAR-06) ── -->
            <mat-tab>
              <ng-template mat-tab-label>
                <mat-icon class="tab-icon">print</mat-icon>
                {{ i18n.settings.templatesTab }}
              </ng-template>

              <div class="tab-content">
                <form (ngSubmit)="savePrintTemplates()" class="tab-form">
                  <div class="templates-layout">
                    <!-- Paramètres templates -->
                    <div class="templates-form">
                      <h3 class="section-title">En-têtes et Pieds de page</h3>

                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{ i18n.settings.ticketHeader }}</mat-label>
                        <textarea matInput rows="2" [(ngModel)]="printTemplates.ticketHeader" name="ticketHeader"></textarea>
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{ i18n.settings.ticketFooter }}</mat-label>
                        <textarea matInput rows="2" [(ngModel)]="printTemplates.ticketFooter" name="ticketFooter"></textarea>
                      </mat-form-field>

                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{ i18n.settings.invoiceHeader }}</mat-label>
                        <textarea matInput rows="2" [(ngModel)]="printTemplates.invoiceHeader" name="invoiceHeader"></textarea>
                      </mat-form-field>

                      <div class="checkbox-row">
                        <mat-checkbox [(ngModel)]="printTemplates.showLogoOnTicket" name="showLogoTicket" color="primary">
                          {{ i18n.settings.showLogoTicket }}
                        </mat-checkbox>

                        <mat-checkbox [(ngModel)]="printTemplates.showLogoOnInvoice" name="showLogoInvoice" color="primary">
                          {{ i18n.settings.showLogoInvoice }}
                        </mat-checkbox>
                      </div>

                      <div class="tab-actions">
                        <button mat-flat-button color="primary" type="submit" [disabled]="isSaving()">
                          @if (isSaving()) {
                            <mat-spinner diameter="18" class="btn-spinner"></mat-spinner>
                          }
                          {{ i18n.actions.save }}
                        </button>
                      </div>
                    </div>

                    <!-- Aperçu en direct du ticket thermique 80mm -->
                    <div class="ticket-preview-box">
                      <h4>{{ i18n.settings.previewTicket }}</h4>
                      <div class="thermal-ticket">
                        @if (printTemplates.showLogoOnTicket && identity.logoUrl) {
                          <img [src]="identity.logoUrl" alt="Logo" class="ticket-logo" />
                        }
                        <div class="ticket-store-name">{{ identity.name || 'VOICI L’HOMME PHARMA' }}</div>
                        <div class="ticket-meta">{{ identity.address }}</div>
                        <div class="ticket-meta">Tél: {{ identity.phone }}</div>
                        @if (identity.rccm) {
                          <div class="ticket-meta">RCCM : {{ identity.rccm }}</div>
                        }
                        <div class="ticket-divider">--------------------------------</div>
                        <div class="ticket-custom-header">{{ printTemplates.ticketHeader }}</div>
                        <div class="ticket-divider">--------------------------------</div>
                        <div class="ticket-item">
                          <span>1x Paracétamol 500mg</span>
                          <span>3 000 CDF</span>
                        </div>
                        <div class="ticket-item">
                          <span>1x Amoxicilline 500mg</span>
                          <span>6 000 CDF</span>
                        </div>
                        <div class="ticket-divider">--------------------------------</div>
                        <div class="ticket-total">
                          <strong>TOTAL :</strong>
                          <strong>9 000 CDF</strong>
                        </div>
                        <div class="ticket-subtotal">Soit environ 3.15 USD</div>
                        <div class="ticket-divider">--------------------------------</div>
                        <div class="ticket-footer">{{ printTemplates.ticketFooter || 'Merci pour votre confiance !' }}</div>
                        <div class="ticket-barcode">||| | ||||| ||| |||| || |</div>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </mat-tab>
          </mat-tab-group>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .settings-page {
      display: flex;
      flex-direction: column;
      gap: 20px;
      font-family: var(--vhp-font);
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-header h2 {
      font-size: 20px;
      font-weight: 700;
      color: #1e3a2f;
      margin: 0;
    }
    .subtitle {
      color: #5f6368;
      font-size: 13px;
      margin-top: 4px;
    }
    .header-shortcuts {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .settings-tabs-card {
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .tab-icon {
      margin-right: 8px;
    }
    .tab-content {
      padding: 24px;
    }
    .tab-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .full-width {
      width: 100%;
    }
    .form-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .col {
      flex: 1;
      min-width: 200px;
    }
    .identity-layout {
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 24px;
    }
    @media (max-width: 900px) {
      .identity-layout {
        grid-template-columns: 1fr;
      }
    }
    .logo-box {
      border: 1px dashed #ced4da;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 12px;
      background: #fafafa;
    }
    .logo-box h4 {
      margin: 0;
      font-size: 14px;
      color: #202124;
    }
    .logo-preview {
      width: 140px;
      height: 140px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .logo-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .placeholder-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #bdbdbd;
    }
    .logo-help {
      font-size: 11px;
      color: #5f6368;
    }
    .section-block {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #1e3a2f;
      margin: 0;
    }
    .section-desc {
      font-size: 12px;
      color: #5f6368;
      margin: -6px 0 6px;
    }
    .block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .rounding-simulator {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #e8f5e9;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      color: #1b5e20;
      flex-wrap: wrap;
    }
    .sim-input {
      width: 90px;
      padding: 4px 8px;
      border: 1px solid #81c784;
      border-radius: 4px;
      font-size: 13px;
    }
    .sim-result {
      color: #0f9d58;
      font-size: 14px;
    }
    .sim-badge {
      background: #c8e6c9;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }
    .payment-methods-grid {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    .table-container {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      width: 100%;
    }
    .taxes-table {
      width: 100%;
      min-width: 500px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }
    .table-input {
      width: 90%;
      padding: 4px;
    }
    .table-input.small {
      width: 60px;
    }
    .suffix {
      color: #5f6368;
      font-size: 12px;
      margin-right: 8px;
    }
    .templates-layout {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 24px;
    }
    @media (max-width: 960px) {
      .templates-layout {
        grid-template-columns: 1fr;
      }
    }
    .templates-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .checkbox-row {
      display: flex;
      gap: 24px;
      margin: 8px 0;
    }
    .ticket-preview-box {
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      padding: 16px;
      background: #f8faf9;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .ticket-preview-box h4 {
      margin: 0 0 12px;
      font-size: 13px;
      color: #5f6368;
    }
    .thermal-ticket {
      width: 280px;
      background: #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      padding: 20px 16px;
      border-radius: 4px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: #000000;
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1.4;
    }
    .ticket-logo {
      max-height: 48px;
      max-width: 120px;
      margin-bottom: 8px;
      object-fit: contain;
    }
    .ticket-store-name {
      font-weight: 700;
      font-size: 14px;
      text-align: center;
    }
    .ticket-meta {
      font-size: 10px;
      color: #333333;
      text-align: center;
    }
    .ticket-divider {
      color: #888888;
      letter-spacing: -1px;
      margin: 6px 0;
      font-size: 11px;
    }
    .ticket-custom-header {
      font-size: 11px;
      text-align: center;
      font-style: italic;
    }
    .ticket-item {
      width: 100%;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
    }
    .ticket-total {
      width: 100%;
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    .ticket-subtotal {
      width: 100%;
      text-align: right;
      font-size: 10px;
      color: #555555;
    }
    .ticket-footer {
      font-size: 11px;
      text-align: center;
      margin-top: 4px;
    }
    .ticket-barcode {
      margin-top: 10px;
      font-size: 18px;
      letter-spacing: 2px;
      text-align: center;
    }
    .tab-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
    }
    .btn-spinner {
      margin-right: 6px;
    }
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      gap: 12px;
      color: #5f6368;
    }
    @media (max-width: 768px) {
      .page-header {
        flex-direction: column;
        align-items: stretch;
      }
      .header-shortcuts {
        width: 100%;
        display: flex;
      }
      .header-shortcuts a {
        flex: 1;
        text-align: center;
      }
      .tab-content {
        padding: 14px 8px;
      }
      .form-row {
        flex-direction: column;
      }
      .col {
        width: 100%;
        min-width: 0;
      }
      .tab-actions button {
        width: 100%;
      }
    }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly settingsApi = inject(SettingsApiService);
  private readonly alert = inject(AlertService);

  readonly i18n = I18N_FR;

  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  isUploadingLogo = signal<boolean>(false);

  // Valeurs locales pour les formulaires
  identity: PharmacyIdentity = {
    name: "Voici l'Homme Pharma",
    address: 'Avenue de la Paix N° 12, Gombe, Kinshasa, RDC',
    phone: '+243 81 000 0000',
    email: 'contact@voicilhommepharma.cd',
    rccm: 'CD/KIN/RCCM/2026-B-00123',
    idNat: '01-93-N12345P',
    nif: 'A1234567B',
    legalNotice: 'Facture établie conformément à la législation fiscale en vigueur en RDC.',
    invoiceFooter: 'Marchandises vendues ne sont ni reprises ni échangées.',
  };

  financial: FinancialRules = {
    defaultCurrency: 'CDF',
    activeCurrencies: ['CDF', 'USD'],
    cdfDecimals: 0,
    usdDecimals: 2,
    cdfRoundingRule: 'CINQUANTE',
    usdRoundingRule: 'DECIMAL_2',
    taxes: [
      { code: 'TVA_0', label: 'TVA Exonérée (Médicaments essentiels)', rate: 0, isDefault: true },
      { code: 'TVA_16', label: 'TVA Standard (Parapharmacie / Cosmétique)', rate: 16, isDefault: false },
    ],
    activePaymentMethods: ['ESPECES', 'MOBILE_MONEY', 'CARTE_BANCAIRE'],
    discountCapsByRole: {
      ADMIN: 100,
      PHARMACIEN: 10,
      CAISSIER: 5,
      STOCK: 0,
      COMPTABLE: 0,
    },
  };

  alerts: AlertThresholds = {
    expiryWarningDays: [30, 60, 90],
    inactivityTimeoutMinutes: 15,
    lowStockDefaultThreshold: 10,
  };

  printTemplates: PrintTemplates = {
    ticketHeader: 'Bienvenue chez Voici l’Homme Pharma',
    ticketFooter: 'Conservez ce ticket. Prompt rétablissement !',
    invoiceHeader: 'Facture d’achat - Client Officine',
    invoiceFooter: 'Merci pour votre confiance.',
    showLogoOnTicket: true,
    showLogoOnInvoice: true,
  };

  simAmount = 12345;

  readonly availablePaymentMethods = [
    { code: 'ESPECES', label: 'Espèces (CDF / USD)' },
    { code: 'MOBILE_MONEY', label: 'Mobile Money (M-Pesa, Orange, Airtel)' },
    { code: 'CARTE_BANCAIRE', label: 'Carte bancaire' },
    { code: 'VIREMENT', label: 'Virement Bancaire' },
    { code: 'CREDIT_CLIENT', label: 'Crédit Client / Convention' },
  ];

  readonly taxColumns: string[] = ['code', 'label', 'rate', 'isDefault', 'actions'];

  ngOnInit(): void {
    this.loadAllSettings();
  }

  loadAllSettings(): void {
    this.isLoading.set(true);
    this.settingsApi.getSettings().subscribe({
      next: (data) => {
        if (data.identity) this.identity = { ...this.identity, ...data.identity };
        if (data.financial) this.financial = { ...this.financial, ...data.financial };
        if (data.alerts) this.alerts = { ...this.alerts, ...data.alerts };
        if (data.printTemplates) this.printTemplates = { ...this.printTemplates, ...data.printTemplates };
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) {
      this.alert.error('Le fichier du logo ne doit pas dépasser 2 Mo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      this.isUploadingLogo.set(true);
      this.settingsApi.uploadLogo(dataUrl).subscribe({
        next: (res) => {
          this.isUploadingLogo.set(false);
          this.identity.logoUrl = res.logoUrl;
          this.alert.success('Logo mis à jour avec succès.');
        },
        error: (err) => {
          this.isUploadingLogo.set(false);
          this.alert.error(err?.error?.message || 'Erreur lors de l’upload du logo.');
        },
      });
    };
    reader.readAsDataURL(file);
  }

  saveIdentity(): void {
    this.isSaving.set(true);
    this.settingsApi.updateIdentity(this.identity).subscribe({
      next: (res) => {
        this.identity = res;
        this.isSaving.set(false);
        this.alert.success(this.i18n.settings.saveSuccess);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alert.error(err?.error?.message || 'Erreur lors de l’enregistrement de l’identité.');
      },
    });
  }

  saveFinancial(): void {
    this.isSaving.set(true);
    this.settingsApi.updateFinancial(this.financial).subscribe({
      next: (res) => {
        this.financial = res;
        this.isSaving.set(false);
        this.alert.success(this.i18n.settings.saveSuccess);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alert.error(err?.error?.message || 'Erreur lors de l’enregistrement financier.');
      },
    });
  }

  saveAlerts(): void {
    this.isSaving.set(true);
    this.settingsApi.updateAlerts(this.alerts).subscribe({
      next: (res) => {
        this.alerts = res;
        this.isSaving.set(false);
        this.alert.success(this.i18n.settings.saveSuccess);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alert.error(err?.error?.message || 'Erreur lors de l’enregistrement des seuils.');
      },
    });
  }

  savePrintTemplates(): void {
    this.isSaving.set(true);
    this.settingsApi.updatePrintTemplates(this.printTemplates).subscribe({
      next: (res) => {
        this.printTemplates = res;
        this.isSaving.set(false);
        this.alert.success(this.i18n.settings.saveSuccess);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alert.error(err?.error?.message || 'Erreur lors de l’enregistrement des modèles.');
      },
    });
  }

  isPaymentMethodActive(code: string): boolean {
    return this.financial.activePaymentMethods?.includes(code) ?? false;
  }

  togglePaymentMethod(code: string, active: boolean): void {
    if (!this.financial.activePaymentMethods) {
      this.financial.activePaymentMethods = [];
    }
    if (active) {
      if (!this.financial.activePaymentMethods.includes(code)) {
        this.financial.activePaymentMethods.push(code);
      }
    } else {
      this.financial.activePaymentMethods = this.financial.activePaymentMethods.filter((c) => c !== code);
    }
  }

  addTax(): void {
    const newTax: TaxItem = {
      code: `TVA_${this.financial.taxes.length}`,
      label: 'Nouvelle Taxe',
      rate: 16,
      isDefault: false,
    };
    this.financial.taxes = [...this.financial.taxes, newTax];
  }

  setDefaultTax(index: number): void {
    this.financial.taxes = this.financial.taxes.map((t, i) => ({
      ...t,
      isDefault: i === index,
    }));
  }

  removeTax(index: number): void {
    this.financial.taxes = this.financial.taxes.filter((_, i) => i !== index);
  }

  getSimulatedRounding(): number {
    const amt = Number(this.simAmount) || 0;
    const rule = this.financial.cdfRoundingRule;
    if (rule === 'ENTIER') return Math.ceil(amt);
    if (rule === 'CINQUANTE') return Math.ceil(amt / 50) * 50;
    if (rule === 'CENT') return Math.ceil(amt / 100) * 100;
    return amt;
  }
}
