import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Customer } from '@vhp/shared';
import { CustomersApiService, CustomerStatement } from '../../core/api/services/customers-api.service';
import { CashApiService } from '../../core/api/services/cash-api.service';
import { AuthService } from '../../core/auth/auth.service';

interface ReceiptTicket {
  id: string;
  receiptReference: string;
  amountPaidCdf: number;
  currency: string;
  paymentMethod: string;
  createdAt: string;
  customerName?: string;
  customerCode?: string;
  remainingBalanceCdf?: number;
  allocations: Array<{ saleId: string; invoiceNumber: string; amountCdf: number }>;
}

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="customers-module">
      <!-- En-tête du module -->
      <header class="module-header">
        <div>
          <h2>Gestion des Clients, Créances & Ordonnances (CLI)</h2>
          <p class="subtitle">Suivi des comptes clients, encaissements FIFO, relevés et ordonnances sécurisées.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openNewCustomerModal()">
          + Nouveau Client
        </button>
      </header>

      <!-- Message d'erreur général -->
      <div class="alert alert-danger" *ngIf="errorMessage">
        <span>⚠️ {{ errorMessage }}</span>
        <button type="button" class="btn-close" (click)="errorMessage = ''">×</button>
      </div>

      <!-- Barre d'outils et recherche -->
      <section class="toolbar-card">
        <form class="toolbar-form" (ngSubmit)="loadCustomers()">
          <div class="search-input-group">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              name="search"
              placeholder="Rechercher par nom, code (CLI-XXXX) ou téléphone..."
              class="form-control"
            />
          </div>
          <div class="filter-group">
            <select [(ngModel)]="selectedCustomerType" name="type" class="form-control" (change)="loadCustomers()">
              <option value="">Tous les types</option>
              <option value="PARTICULIER">Particulier</option>
              <option value="ENTREPRISE">Entreprise</option>
              <option value="ASSURANCE">Assurance</option>
            </select>
          </div>
          <button type="submit" class="btn btn-secondary">Filtrer</button>
          <button type="button" class="btn btn-outline" (click)="resetFilters()">Réinitialiser</button>
        </form>
      </section>

      <!-- Grille Principale : Liste à gauche + Fiche détaillée à droite -->
      <div class="main-grid">
        <!-- 1. TABLEAU DES CLIENTS -->
        <section class="customers-list-panel">
          <div class="panel-header">
            <h3>Fichier Clients ({{ customers.length }})</h3>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Nom / Raison sociale</th>
                  <th>Type</th>
                  <th>Plafond</th>
                  <th>Solde dû (CDF)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let c of customers"
                  [class.active-row]="selectedCustomer?.id === c.id"
                  (click)="selectCustomer(c)"
                >
                  <td class="font-mono">{{ c.code }}</td>
                  <td>
                    <strong>{{ c.fullName }}</strong>
                    <div class="text-muted small" *ngIf="c.companyName">{{ c.companyName }}</div>
                  </td>
                  <td>
                    <span class="badge" [ngClass]="'badge-' + c.customerType.toLowerCase()">
                      {{ c.customerType }}
                    </span>
                  </td>
                  <td>{{ c.creditLimitCdf | number }} CDF</td>
                  <td>
                    <span [class.text-danger]="c.currentBalanceCdf > 0" [class.font-bold]="c.currentBalanceCdf > 0">
                      {{ c.currentBalanceCdf | number }} CDF
                    </span>
                  </td>
                  <td>
                    <button type="button" class="btn btn-sm btn-outline" (click)="selectCustomer(c); $event.stopPropagation()">
                      Fiche
                    </button>
                  </td>
                </tr>
                <tr *ngIf="!customers.length && !loading">
                  <td colspan="6" class="text-center py-4 text-muted">Aucun client correspondant trouvé.</td>
                </tr>
                <tr *ngIf="loading">
                  <td colspan="6" class="text-center py-4">Chargement des clients...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 2. FICHE CLIENT & ONGLETS DÉTAILLÉS -->
        <section class="customer-details-panel" *ngIf="selectedCustomer">
          <div class="card-details">
            <!-- Entête Fiche Client -->
            <div class="customer-card-header">
              <div>
                <span class="badge badge-type">{{ selectedCustomer.customerType }}</span>
                <h3>{{ selectedCustomer.fullName }}</h3>
                <span class="text-muted font-mono">{{ selectedCustomer.code }}</span>
              </div>
              <!-- Synthèse financière -->
              <div class="financial-summary">
                <div class="metric">
                  <small>Plafond Crédit</small>
                  <strong>{{ selectedCustomer.creditLimitCdf | number }} CDF</strong>
                </div>
                <div class="metric highlight-debt">
                  <small>Solde Dû</small>
                  <strong class="text-danger">{{ (statement?.currentBalanceCdf ?? selectedCustomer.currentBalanceCdf) | number }} CDF</strong>
                </div>
                <div class="metric">
                  <small>Crédit Dispo</small>
                  <strong class="text-success">{{ (statement?.availableCreditCdf ?? 0) | number }} CDF</strong>
                </div>
              </div>
            </div>

            <!-- Barre des Onglets Exigés -->
            <nav class="nav-tabs">
              <button
                type="button"
                class="tab-link"
                [class.active]="activeTab === 'informations'"
                (click)="activeTab = 'informations'"
              >
                📋 Informations
              </button>
              <button
                type="button"
                class="tab-link"
                [class.active]="activeTab === 'achats'"
                (click)="activeTab = 'achats'"
              >
                🛒 Historique Achats
              </button>
              <button
                type="button"
                class="tab-link"
                [class.active]="activeTab === 'paiements'"
                (click)="activeTab = 'paiements'"
              >
                💵 Paiements & Règlements
              </button>
              <button
                type="button"
                class="tab-link"
                [class.active]="activeTab === 'releve'"
                (click)="activeTab = 'releve'"
              >
                📑 Relevé de Compte
              </button>
              <button
                type="button"
                class="tab-link"
                [class.active]="activeTab === 'ordonnances'"
                (click)="activeTab = 'ordonnances'; loadPrescriptions()"
              >
                🏥 Ordonnances ({{ prescriptions.length }})
              </button>
            </nav>

            <div class="tab-content">
              <!-- ================= ONGLET 1 : INFORMATIONS ================= -->
              <div *ngIf="activeTab === 'informations'" class="tab-pane">
                <div class="info-grid">
                  <div class="info-item">
                    <label>Téléphone :</label>
                    <span>{{ selectedCustomer.phone || 'Non renseigné' }}</span>
                  </div>
                  <div class="info-item">
                    <label>Email :</label>
                    <span>{{ selectedCustomer.email || 'Non renseigné' }}</span>
                  </div>
                  <div class="info-item" *ngIf="selectedCustomer.companyName">
                    <label>Entreprise / Employeur :</label>
                    <span>{{ selectedCustomer.companyName }}</span>
                  </div>
                  <div class="info-item">
                    <label>Plafond autorisé (RG-13) :</label>
                    <span>{{ selectedCustomer.creditLimitCdf | number }} CDF</span>
                  </div>
                </div>

                <div class="medical-notes-card mt-3">
                  <h4>⚠️ Notes Médicales & Allergies (CLI-07)</h4>
                  <p *ngIf="selectedCustomer.medicalNotes" class="medical-text">
                    {{ selectedCustomer.medicalNotes }}
                  </p>
                  <p *ngIf="!selectedCustomer.medicalNotes" class="text-muted">
                    Aucune allergie ou contre-indication spécifique enregistrée.
                  </p>
                </div>
              </div>

              <!-- ================= ONGLET 2 : HISTORIQUE DES ACHATS ================= -->
              <div *ngIf="activeTab === 'achats'" class="tab-pane">
                <h4>Historique des Factures d’Achats</h4>
                <table class="data-table mt-2">
                  <thead>
                    <tr>
                      <th>N° Facture</th>
                      <th>Date</th>
                      <th>Total Vente</th>
                      <th>Part Crédit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let p of statement?.purchases">
                      <td class="font-mono"><strong>{{ p.invoiceNumber }}</strong></td>
                      <td>{{ p.date | date:'dd/MM/yyyy HH:mm' }}</td>
                      <td>{{ p.totalCdf | number }} CDF</td>
                      <td>
                        <span [class.badge-credit]="p.creditCdf > 0">
                          {{ p.creditCdf | number }} CDF
                        </span>
                      </td>
                    </tr>
                    <tr *ngIf="!statement?.purchases?.length">
                      <td colspan="4" class="text-center text-muted py-3">Aucun achat enregistré pour ce client.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- ================= ONGLET 3 : PAIEMENTS & ENCAISSEMENT ================= -->
              <div *ngIf="activeTab === 'paiements'" class="tab-pane">
                <div class="section-actions">
                  <h4>Règlements & Encaissement de créance (CLI-04)</h4>
                  <button
                    type="button"
                    class="btn btn-success"
                    *ngIf="!showSettlementForm && (statement?.currentBalanceCdf ?? 0) > 0"
                    (click)="openSettlementForm()"
                  >
                    + Encaisser un règlement
                  </button>
                </div>

                <!-- Formulaire d'encaissement de créance avec imputation visible -->
                <div class="settlement-form-card" *ngIf="showSettlementForm">
                  <h5>Encaisser un règlement (FIFO - Imputation automatique)</h5>
                  <form (ngSubmit)="submitSettlement()">
                    <div class="form-row">
                      <div class="form-group">
                        <label>Montant du règlement *</label>
                        <input
                          type="number"
                          min="1"
                          required
                          [(ngModel)]="settlementModel.amount"
                          name="amount"
                          (input)="calculateImputationPreview()"
                          class="form-control"
                        />
                      </div>
                      <div class="form-group">
                        <label>Devise *</label>
                        <select [(ngModel)]="settlementModel.currency" name="currency" class="form-control" (change)="calculateImputationPreview()">
                          <option value="CDF">CDF</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                      <div class="form-group">
                        <label>Mode de paiement *</label>
                        <select [(ngModel)]="settlementModel.paymentMethod" name="paymentMethod" class="form-control">
                          <option value="ESPECES">Espèces</option>
                          <option value="MOBILE_MONEY">Mobile Money</option>
                          <option value="CARTE_BANCAIRE">Carte Bancaire</option>
                          <option value="VIREMENT">Virement Bancaire</option>
                        </select>
                      </div>
                    </div>

                    <!-- Imputation visible des factures les plus anciennes -->
                    <div class="imputation-box mt-3" *ngIf="imputationPreview.length">
                      <h6>Imputation prévisionnelle sur les factures les plus anciennes (FIFO) :</h6>
                      <table class="data-table preview-table">
                        <thead>
                          <tr>
                            <th>Facture</th>
                            <th>Date</th>
                            <th>Dû Initial</th>
                            <th>Montant Imputé</th>
                            <th>Reste Facture</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr *ngFor="let imp of imputationPreview">
                            <td class="font-mono">{{ imp.invoiceNumber }}</td>
                            <td>{{ imp.date | date:'dd/MM/yyyy' }}</td>
                            <td>{{ imp.dueCdf | number }} CDF</td>
                            <td class="text-success font-bold">+ {{ imp.allocatedCdf | number }} CDF</td>
                            <td>{{ imp.remainingDueCdf | number }} CDF</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div class="form-actions mt-3">
                      <button type="button" class="btn btn-outline" (click)="showSettlementForm = false">Annuler</button>
                      <button type="submit" class="btn btn-primary" [disabled]="submitting || settlementModel.amount <= 0">
                        {{ submitting ? 'Validation...' : 'Valider le paiement & Générer reçu' }}
                      </button>
                    </div>
                  </form>
                </div>

                <!-- Historique des paiements précédents -->
                <h5 class="mt-4">Historique des Paiements Effectués</h5>
                <table class="data-table mt-2">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Réf. Reçu</th>
                      <th>Montant Payé</th>
                      <th>Devise</th>
                      <th>Mode</th>
                      <th>Factures Imputées</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let pay of statement?.payments">
                      <td>{{ pay.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
                      <td class="font-mono"><strong>{{ pay.receiptReference || 'RCL-AUTO' }}</strong></td>
                      <td class="font-bold text-success">{{ pay.amountPaidCdf | number }} CDF</td>
                      <td>{{ pay.currency }}</td>
                      <td>{{ pay.method }}</td>
                      <td>
                        <span class="badge badge-info" *ngFor="let alloc of pay.allocations">
                          Facture: {{ alloc.amountCdf | number }} CDF
                        </span>
                      </td>
                    </tr>
                    <tr *ngIf="!statement?.payments?.length">
                      <td colspan="6" class="text-center text-muted py-3">Aucun règlement antérieur pour ce client.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- ================= ONGLET 4 : RELEVÉ DE COMPTE ================= -->
              <div *ngIf="activeTab === 'releve'" class="tab-pane">
                <div class="statement-card printable-area">
                  <div class="statement-header">
                    <div>
                      <h3>RELEVÉ DE COMPTE CLIENT (CLI-03)</h3>
                      <p><strong>{{ selectedCustomer.fullName }}</strong> ({{ selectedCustomer.code }})</p>
                      <small>Édité le {{ statement?.generatedAt | date:'dd/MM/yyyy à HH:mm' }}</small>
                    </div>
                    <button type="button" class="btn btn-secondary no-print" (click)="printStatement()">
                      🖨️ Imprimer le Relevé
                    </button>
                  </div>

                  <div class="statement-summary-boxes">
                    <div class="s-box">
                      <small>Plafond Autorisé</small>
                      <strong>{{ selectedCustomer.creditLimitCdf | number }} CDF</strong>
                    </div>
                    <div class="s-box">
                      <small>Total Achats Crédit</small>
                      <strong>{{ getTotalCreditPurchases() | number }} CDF</strong>
                    </div>
                    <div class="s-box">
                      <small>Total Règlements</small>
                      <strong>{{ getTotalPayments() | number }} CDF</strong>
                    </div>
                    <div class="s-box highlight">
                      <small>SOLDE NET DÛ</small>
                      <strong class="text-danger">{{ statement?.currentBalanceCdf | number }} CDF</strong>
                    </div>
                  </div>

                  <table class="data-table mt-3">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type d’opération</th>
                        <th>Référence</th>
                        <th>Débit (Achat)</th>
                        <th>Crédit (Règlement)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let row of getStatementOperations()">
                        <td>{{ row.date | date:'dd/MM/yyyy HH:mm' }}</td>
                        <td>{{ row.label }}</td>
                        <td class="font-mono">{{ row.reference }}</td>
                        <td class="text-danger">{{ row.debit ? (row.debit | number) + ' CDF' : '-' }}</td>
                        <td class="text-success">{{ row.credit ? (row.credit | number) + ' CDF' : '-' }}</td>
                      </tr>
                      <tr *ngIf="!getStatementOperations().length">
                        <td colspan="5" class="text-center text-muted py-3">Aucune opération enregistrée.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- ================= ONGLET 5 : ORDONNANCES SÉCURISÉES ================= -->
              <div *ngIf="activeTab === 'ordonnances'" class="tab-pane">
                <div class="section-actions">
                  <h4>Ordonnances Médicales du Patient</h4>
                  <button type="button" class="btn btn-primary" (click)="showPrescriptionUpload = !showPrescriptionUpload">
                    {{ showPrescriptionUpload ? 'Fermer le formulaire' : '+ Nouvelle Ordonnance' }}
                  </button>
                </div>

                <!-- Formulaire de saisie d'ordonnance -->
                <div class="prescription-form-card" *ngIf="showPrescriptionUpload">
                  <h5>Enregistrement d’une Ordonnance (CLI-05, CLI-06)</h5>

                  <!-- Mention d'information confidentialité (CLI-10) -->
                  <div class="privacy-notice-box" *ngIf="privacyNotice">
                    <span class="icon">🔒</span>
                    <small>{{ privacyNotice }}</small>
                  </div>

                  <form (ngSubmit)="submitPrescription()">
                    <div class="form-row">
                      <div class="form-group">
                        <label>Médecin Prescripteur *</label>
                        <input
                          type="text"
                          required
                          [(ngModel)]="prescriptionModel.prescriberName"
                          name="prescriberName"
                          placeholder="Ex: Dr. Kabongo Jean"
                          class="form-control"
                        />
                      </div>
                      <div class="form-group">
                        <label>Centre de Santé / Hôpital</label>
                        <input
                          type="text"
                          [(ngModel)]="prescriptionModel.healthCenter"
                          name="healthCenter"
                          placeholder="Ex: Clinique Ngaliema"
                          class="form-control"
                        />
                      </div>
                      <div class="form-group">
                        <label>Date de prescription *</label>
                        <input
                          type="date"
                          required
                          [(ngModel)]="prescriptionModel.prescriptionDate"
                          name="prescriptionDate"
                          class="form-control"
                        />
                      </div>
                    </div>

                    <div class="form-group mt-2">
                      <label>Photo ou Scan de l’ordonnance (Appareil photo / Tablette supporté) *</label>
                      <input
                        type="file"
                        required
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        (change)="onPrescriptionFileSelected($event)"
                        class="form-control"
                      />
                      <small class="text-muted">Formats acceptés : JPEG, PNG, WebP (Max 8 Mo). Stockage privé sécurisé.</small>
                    </div>

                    <div class="form-group mt-2">
                      <label>Posologie / Notes cliniques :</label>
                      <textarea
                        [(ngModel)]="prescriptionModel.prescriptionText"
                        name="prescriptionText"
                        rows="2"
                        class="form-control"
                        placeholder="Ex: Amoxicilline 500mg 1 gélule 3x/jour pendant 7 jours..."
                      ></textarea>
                    </div>

                    <div class="form-actions mt-3">
                      <button type="button" class="btn btn-outline" (click)="showPrescriptionUpload = false">Annuler</button>
                      <button type="submit" class="btn btn-success" [disabled]="submitting || !selectedFile">
                        {{ submitting ? 'Téléversement...' : 'Téléverser dans le bucket privé' }}
                      </button>
                    </div>
                  </form>
                </div>

                <!-- Liste des ordonnances -->
                <table class="data-table mt-3">
                  <thead>
                    <tr>
                      <th>Date Prescr.</th>
                      <th>Prescripteur</th>
                      <th>Établissement</th>
                      <th>Notes / Traitement</th>
                      <th>Image Privée</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let ord of prescriptions">
                      <td>{{ ord.prescriptionDate }}</td>
                      <td><strong>{{ ord.prescriberName }}</strong></td>
                      <td>{{ ord.healthCenter || 'Non spécifié' }}</td>
                      <td>{{ ord.prescriptionText || '-' }}</td>
                      <td>
                        <button type="button" class="btn btn-sm btn-info" (click)="viewPrescription(ord.id)">
                          👁️ Consulter l'image (Lien sécurisé)
                        </button>
                      </td>
                    </tr>
                    <tr *ngIf="!prescriptions.length">
                      <td colspan="5" class="text-center text-muted py-3">Aucune ordonnance enregistrée.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- MODALE 1 : NOUVEAU CLIENT COMPLET -->
      <div class="modal-backdrop" *ngIf="showNewCustomerModal">
        <div class="modal-dialog">
          <div class="modal-header">
            <h4>Création d'une nouvelle fiche client</h4>
            <button type="button" class="close-btn" (click)="showNewCustomerModal = false">×</button>
          </div>
          <div class="modal-body">
            <!-- Mention de confidentialité (CLI-10) -->
            <div class="privacy-notice-box" *ngIf="privacyNotice">
              <span class="icon">🔒</span>
              <small>{{ privacyNotice }}</small>
            </div>

            <form (ngSubmit)="createCustomer()">
              <div class="form-group">
                <label>Nom complet *</label>
                <input required [(ngModel)]="newCustomerForm.fullName" name="fullName" class="form-control" placeholder="Nom et Prénom">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Type de client *</label>
                  <select [(ngModel)]="newCustomerForm.customerType" name="customerType" class="form-control">
                    <option value="PARTICULIER">Particulier</option>
                    <option value="ENTREPRISE">Entreprise</option>
                    <option value="ASSURANCE">Assurance</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Plafond de crédit (CDF) *</label>
                  <input type="number" min="0" required [(ngModel)]="newCustomerForm.creditLimitCdf" name="creditLimitCdf" class="form-control">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Téléphone</label>
                  <input [(ngModel)]="newCustomerForm.phone" name="phone" class="form-control" placeholder="+243...">
                </div>
                <div class="form-group">
                  <label>Email</label>
                  <input type="email" [(ngModel)]="newCustomerForm.email" name="email" class="form-control" placeholder="client@domaine.cd">
                </div>
              </div>
              <div class="form-group" *ngIf="newCustomerForm.customerType !== 'PARTICULIER'">
                <label>Nom de l'entreprise ou assureur</label>
                <input [(ngModel)]="newCustomerForm.companyName" name="companyName" class="form-control">
              </div>
              <div class="form-group">
                <label>Adresse</label>
                <input [(ngModel)]="newCustomerForm.address" name="address" class="form-control">
              </div>
              <div class="form-group">
                <label>Notes médicales & allergies (CLI-07)</label>
                <textarea [(ngModel)]="newCustomerForm.medicalNotes" name="medicalNotes" class="form-control" rows="2" placeholder="Allergies connues, antécédents..."></textarea>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline" (click)="showNewCustomerModal = false">Annuler</button>
                <button type="submit" class="btn btn-primary" [disabled]="submitting || !newCustomerForm.fullName">
                  {{ submitting ? 'Enregistrement...' : 'Enregistrer le client' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- MODALE 2 : TICKET DE REÇU D'ENCAISSEMENT (CLI-04) -->
      <div class="modal-backdrop" *ngIf="receiptModal">
        <div class="modal-dialog receipt-dialog">
          <div class="modal-header">
            <h4>Ticket de Reçu d'Encaissement</h4>
            <button type="button" class="close-btn" (click)="receiptModal = null">×</button>
          </div>
          <div class="modal-body printable-receipt" id="printable-receipt">
            <div class="receipt-header text-center">
              <h5>VOICI L'HOMME PHARMA</h5>
              <p class="small">Règlement de créance client</p>
              <div class="font-mono bold">RÉF : {{ receiptModal.receiptReference }}</div>
              <small>{{ receiptModal.createdAt | date:'dd/MM/yyyy HH:mm:ss' }}</small>
            </div>
            <hr>
            <div class="receipt-client-info">
              <div><strong>Client :</strong> {{ receiptModal.customerName }} ({{ receiptModal.customerCode }})</div>
              <div><strong>Mode :</strong> {{ receiptModal.paymentMethod }} ({{ receiptModal.currency }})</div>
            </div>
            <hr>
            <div class="receipt-allocations">
              <h6>Imputations factures :</h6>
              <div class="alloc-row" *ngFor="let a of receiptModal.allocations">
                <span>{{ a.invoiceNumber }}</span>
                <span class="font-bold">{{ a.amountCdf | number }} CDF</span>
              </div>
            </div>
            <hr>
            <div class="receipt-total">
              <div class="d-flex justify-between">
                <span>Montant Encaissé :</span>
                <strong>{{ receiptModal.amountPaidCdf | number }} CDF</strong>
              </div>
              <div class="d-flex justify-between text-muted" *ngIf="receiptModal.remainingBalanceCdf !== undefined">
                <span>Solde Dû Restant :</span>
                <span>{{ receiptModal.remainingBalanceCdf | number }} CDF</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" (click)="receiptModal = null">Fermer</button>
            <button type="button" class="btn btn-secondary" (click)="printReceipt()">🖨️ Imprimer Reçu</button>
          </div>
        </div>
      </div>

      <!-- MODALE 3 : APERÇU SÉCURISÉ D'ORDONNANCE AVEC EXPIRATION (CLI-06, RG-17) -->
      <div class="modal-backdrop" *ngIf="previewModalUrl || previewModalExpired">
        <div class="modal-dialog preview-dialog">
          <div class="modal-header">
            <h4>Aperçu d’Ordonnance Médicale (Lien Privé Signé)</h4>
            <button type="button" class="close-btn" (click)="closePreviewModal()">×</button>
          </div>
          <div class="modal-body text-center">
            <div *ngIf="previewModalUrl && !previewModalExpired">
              <img [src]="previewModalUrl" alt="Ordonnance médicale sécurisée" class="preview-img">
              <div class="countdown-badge">
                ⏳ Ce lien temporaire expire dans <strong>{{ previewModalSeconds }}</strong> secondes.
              </div>
            </div>
            <div *ngIf="previewModalExpired" class="alert alert-danger mt-3">
              ⚠️ <strong>Lien temporaire expiré (RG-17).</strong><br>
              Pour préserver la confidentialité médicale, le lien signé a expiré. Veuillez cliquer à nouveau sur "Consulter" pour générer un nouvel accès journalisé.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" (click)="closePreviewModal()">Fermer</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .customers-module { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .module-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .module-header h2 { margin: 0; color: #116149; font-size: 20px; font-weight: 700; }
    .subtitle { margin: 4px 0 0; color: #556960; font-size: 13px; }
    .toolbar-card { background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #d5ded9; }
    .toolbar-form { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .search-input-group { flex: 1; min-width: 250px; }
    .form-control { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #cbd5d0; border-radius: 6px; font-size: 13px; }
    .form-control:focus { outline: none; border-color: #116149; }
    .main-grid { display: grid; grid-template-columns: 1fr 1.3fr; gap: 16px; align-items: start; }
    @media (max-width: 992px) { .main-grid { grid-template-columns: 1fr; } }
    .customers-list-panel, .card-details { background: #fff; border: 1px solid #d5ded9; border-radius: 8px; overflow: hidden; }
    .panel-header { padding: 12px 16px; border-bottom: 1px solid #edf0ee; background: #fbfcfb; }
    .panel-header h3 { margin: 0; font-size: 15px; color: #116149; }
    .table-responsive { overflow-x: auto; max-height: 600px; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th, .data-table td { padding: 10px 12px; border-bottom: 1px solid #edf0ee; text-align: left; }
    .data-table th { background: #f8faf9; color: #475569; font-weight: 600; }
    .data-table tbody tr { cursor: pointer; transition: background 0.15s; }
    .data-table tbody tr:hover { background: #f0fdf4; }
    .active-row { background: #ecfdf5 !important; border-left: 3px solid #116149; }
    .customer-card-header { padding: 16px; border-bottom: 1px solid #edf0ee; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .customer-card-header h3 { margin: 4px 0 2px; color: #116149; font-size: 18px; }
    .financial-summary { display: flex; gap: 16px; }
    .metric { background: #f8faf9; border: 1px solid #e2e8e5; border-radius: 6px; padding: 6px 12px; text-align: right; }
    .metric small { display: block; font-size: 11px; color: #64748b; }
    .metric strong { font-size: 14px; }
    .nav-tabs { display: flex; gap: 4px; border-bottom: 1px solid #d5ded9; background: #f8faf9; padding: 8px 12px 0; overflow-x: auto; }
    .tab-link { background: none; border: none; padding: 8px 14px; font-size: 13px; font-weight: 500; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; }
    .tab-link.active { color: #116149; border-bottom-color: #116149; font-weight: 600; background: #fff; border-top-left-radius: 6px; border-top-right-radius: 6px; }
    .tab-content { padding: 16px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .info-item label { display: block; font-size: 12px; color: #64748b; margin-bottom: 2px; }
    .info-item span { font-weight: 500; font-size: 13px; }
    .medical-notes-card { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; }
    .medical-notes-card h4 { margin: 0 0 6px; font-size: 13px; color: #b45309; }
    .medical-text { color: #92400e; font-size: 13px; margin: 0; }
    .privacy-notice-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 10px; margin-bottom: 12px; color: #065f46; font-size: 12px; display: flex; gap: 8px; align-items: center; }
    .btn { padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
    .btn-primary { background: #116149; color: #fff; }
    .btn-primary:hover { background: #0d4a38; }
    .btn-secondary { background: #334155; color: #fff; }
    .btn-success { background: #15803d; color: #fff; }
    .btn-outline { background: #fff; border-color: #cbd5d0; color: #374151; }
    .btn-info { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .btn-sm { padding: 4px 8px; font-size: 11px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .badge-particulier { background: #e0e7ff; color: #3730a3; }
    .badge-entreprise { background: #fef3c7; color: #92400e; }
    .badge-assurance { background: #fce7f3; color: #9d174d; }
    .badge-credit { background: #fef2f2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; }
    .badge-info { background: #f1f5f9; color: #334155; padding: 2px 6px; border-radius: 4px; margin-right: 4px; font-size: 11px; }
    .font-mono { font-family: monospace; }
    .font-bold { font-weight: 700; }
    .text-danger { color: #dc2626; }
    .text-success { color: #15803d; }
    .text-muted { color: #64748b; }
    .small { font-size: 11px; }
    .mt-2 { margin-top: 8px; }
    .mt-3 { margin-top: 12px; }
    .mt-4 { margin-top: 16px; }
    .d-flex { display: flex; }
    .justify-between { justify-content: space-between; }
    .section-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .section-actions h4 { margin: 0; color: #116149; font-size: 15px; }
    .settlement-form-card, .prescription-form-card { background: #f8faf9; border: 1px solid #cbd5d0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .settlement-form-card h5, .prescription-form-card h5 { margin: 0 0 12px; color: #116149; font-size: 14px; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .form-group { display: flex; flex-direction: column; gap: 4px; }
    .form-group label { font-size: 12px; font-weight: 500; color: #374151; }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .imputation-box { background: #fff; border: 1px solid #d5ded9; border-radius: 6px; padding: 12px; }
    .imputation-box h6 { margin: 0 0 8px; color: #116149; font-size: 12px; }
    .preview-table { font-size: 12px; }
    .preview-table th, .preview-table td { padding: 6px 8px; }
    .statement-summary-boxes { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
    .s-box { background: #f8faf9; border: 1px solid #e2e8e5; border-radius: 6px; padding: 8px; text-align: center; }
    .s-box.highlight { background: #fef2f2; border-color: #fca5a5; }
    .s-box small { display: block; font-size: 11px; color: #64748b; }
    .s-box strong { font-size: 13px; }
    .statement-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1050; }
    .modal-dialog { background: #fff; border-radius: 8px; max-width: 520px; width: 95%; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #edf0ee; background: #fbfcfb; }
    .modal-header h4 { margin: 0; font-size: 15px; color: #116149; }
    .close-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: #64748b; }
    .modal-body { padding: 16px; overflow-y: auto; }
    .modal-footer { padding: 10px 16px; border-top: 1px solid #edf0ee; display: flex; justify-content: flex-end; gap: 8px; }
    .receipt-dialog { max-width: 400px; }
    .printable-receipt { background: #fafafa; border: 1px dashed #ccc; padding: 16px; font-size: 12px; }
    .receipt-header h5 { margin: 0 0 2px; letter-spacing: 1px; }
    .alloc-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .preview-dialog { max-width: 600px; }
    .preview-img { max-width: 100%; max-height: 55vh; object-fit: contain; border: 1px solid #ddd; border-radius: 6px; }
    .countdown-badge { margin-top: 10px; font-size: 12px; color: #b45309; background: #fef3c7; padding: 6px 12px; border-radius: 20px; display: inline-block; }
    .alert { padding: 10px 14px; border-radius: 6px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
    .alert-danger { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }
    @media print {
      body * { visibility: hidden; }
      .printable-area, .printable-area * { visibility: visible; }
      .printable-area { position: absolute; left: 0; top: 0; width: 100%; }
      .no-print { display: none !important; }
    }
  `],
})
export class CustomersComponent implements OnInit {
  private readonly api = inject(CustomersApiService);
  private readonly cashApi = inject(CashApiService);
  private readonly auth = inject(AuthService);

  customers: Customer[] = [];
  selectedCustomer?: Customer;
  statement?: CustomerStatement;
  prescriptions: Array<{ id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string; prescriptionText?: string }> = [];

  searchQuery = '';
  selectedCustomerType = '';
  activeTab: 'informations' | 'achats' | 'paiements' | 'releve' | 'ordonnances' = 'informations';
  loading = false;
  submitting = false;
  errorMessage = '';
  privacyNotice = '';

  // Modales & Formulaires
  showNewCustomerModal = false;
  showSettlementForm = false;
  showPrescriptionUpload = false;
  receiptModal: ReceiptTicket | null = null;

  // Aperçu sécurisé d'ordonnance avec compte à rebours
  previewModalUrl = '';
  previewModalExpired = false;
  previewModalSeconds = 0;
  private previewTimer: any;

  // Modèles de données formulaires
  newCustomerForm = {
    fullName: '',
    customerType: 'PARTICULIER',
    creditLimitCdf: 0,
    phone: '',
    email: '',
    companyName: '',
    address: '',
    medicalNotes: '',
  };

  settlementModel = {
    amount: 0,
    currency: 'CDF' as 'CDF' | 'USD',
    paymentMethod: 'ESPECES' as 'ESPECES' | 'MOBILE_MONEY' | 'CARTE_BANCAIRE' | 'VIREMENT',
    cashSessionId: '',
  };

  prescriptionModel = {
    prescriberName: '',
    healthCenter: '',
    prescriptionDate: new Date().toISOString().slice(0, 10),
    prescriptionText: '',
  };
  selectedFile?: File;

  // Imputation prévisionnelle FIFO
  imputationPreview: Array<{ invoiceNumber: string; date: string; dueCdf: number; allocatedCdf: number; remainingDueCdf: number }> = [];

  ngOnInit() {
    this.loadCustomers();
    this.loadPrivacyNotice();
  }

  loadPrivacyNotice() {
    this.api.getPrivacyNotice().subscribe({
      next: (res) => (this.privacyNotice = res.text),
      error: () => {},
    });
  }

  loadCustomers() {
    this.loading = true;
    this.errorMessage = '';
    const params: { search?: string; customerType?: string } = {};
    if (this.searchQuery && this.searchQuery.trim()) {
      params.search = this.searchQuery.trim();
    }
    if (this.selectedCustomerType && this.selectedCustomerType.trim()) {
      params.customerType = this.selectedCustomerType.trim();
    }
    this.api
      .getCustomers(params)
      .subscribe({
        next: (list) => {
          this.loading = false;
          this.customers = list;
          if (this.selectedCustomer) {
            const updated = list.find((c) => c.id === this.selectedCustomer?.id);
            if (updated) this.selectedCustomer = updated;
          }
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err.error?.message || 'Erreur lors du chargement des clients.';
        },
      });
  }

  resetFilters() {
    this.searchQuery = '';
    this.selectedCustomerType = '';
    this.loadCustomers();
  }

  selectCustomer(customer: Customer) {
    this.selectedCustomer = customer;
    this.showSettlementForm = false;
    this.showPrescriptionUpload = false;
    this.loadStatement(customer.id);
    this.loadPrescriptions();
  }

  loadStatement(customerId: string) {
    this.api.getStatement(customerId).subscribe({
      next: (stmt) => (this.statement = stmt),
      error: (e) => (this.errorMessage = e.error?.message || 'Relevé indisponible.'),
    });
  }

  loadPrescriptions() {
    if (!this.selectedCustomer) return;
    this.api.getPrescriptions(this.selectedCustomer.id).subscribe({
      next: (list) => (this.prescriptions = list),
      error: (e) => (this.errorMessage = e.error?.message || 'Ordonnances indisponibles.'),
    });
  }

  openNewCustomerModal() {
    this.newCustomerForm = {
      fullName: '',
      customerType: 'PARTICULIER',
      creditLimitCdf: 0,
      phone: '',
      email: '',
      companyName: '',
      address: '',
      medicalNotes: '',
    };
    this.showNewCustomerModal = true;
  }

  createCustomer() {
    if (!this.newCustomerForm.fullName.trim()) return;
    this.submitting = true;
    this.errorMessage = '';
    this.api.createCustomer(this.newCustomerForm as any).subscribe({
      next: (created) => {
        this.submitting = false;
        this.showNewCustomerModal = false;
        this.loadCustomers();
        this.selectCustomer(created);
      },
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Échec de création du client.';
      },
    });
  }

  openSettlementForm() {
    this.showSettlementForm = true;
    this.settlementModel.amount = this.statement?.currentBalanceCdf ?? 0;
    this.settlementModel.currency = 'CDF';
    this.settlementModel.paymentMethod = 'ESPECES';

    // Remplir automatiquement la session de caisse active
    this.cashApi.getActiveSession().subscribe({
      next: (session) => {
        if (session) this.settlementModel.cashSessionId = session.id;
      },
      error: () => {},
    });

    this.calculateImputationPreview();
  }

  calculateImputationPreview() {
    this.imputationPreview = [];
    if (!this.statement?.purchases || this.settlementModel.amount <= 0) return;

    let remainingToAllocate = this.settlementModel.amount;
    // Les achats sont ordonnés du plus ancien au plus récent
    const unpaidPurchases = this.statement.purchases.filter((p) => p.creditCdf > 0);

    for (const p of unpaidPurchases) {
      if (remainingToAllocate <= 0) break;
      const allocated = Math.min(p.creditCdf, remainingToAllocate);
      this.imputationPreview.push({
        invoiceNumber: p.invoiceNumber,
        date: p.date,
        dueCdf: p.creditCdf,
        allocatedCdf: allocated,
        remainingDueCdf: p.creditCdf - allocated,
      });
      remainingToAllocate -= allocated;
    }
  }

  submitSettlement() {
    if (!this.selectedCustomer || this.settlementModel.amount <= 0) return;
    this.submitting = true;
    this.errorMessage = '';

    const idempotencyKey = crypto.randomUUID();
    this.api
      .settleDebt(this.selectedCustomer.id, {
        amountPaidCdf: this.settlementModel.amount,
        paymentMethod: this.settlementModel.paymentMethod,
        currency: this.settlementModel.currency,
        idempotencyKey,
        cashSessionId: this.settlementModel.cashSessionId || undefined,
        notes: `Règlement comptoir ${this.selectedCustomer.code}`,
      })
      .subscribe({
        next: (receipt) => {
          this.submitting = false;
          this.showSettlementForm = false;
          this.receiptModal = receipt;
          this.loadStatement(this.selectedCustomer!.id);
          this.loadCustomers();
        },
        error: (err) => {
          this.submitting = false;
          this.errorMessage = err.error?.message || 'Erreur lors du règlement de la créance.';
        },
      });
  }

  onPrescriptionFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0];
  }

  submitPrescription() {
    if (!this.selectedCustomer || !this.selectedFile) return;
    this.submitting = true;
    this.errorMessage = '';

    this.api
      .uploadPrescription(
        {
          customerId: this.selectedCustomer.id,
          prescriberName: this.prescriptionModel.prescriberName,
          healthCenter: this.prescriptionModel.healthCenter,
          prescriptionDate: this.prescriptionModel.prescriptionDate,
          prescriptionText: this.prescriptionModel.prescriptionText,
        },
        this.selectedFile
      )
      .subscribe({
        next: () => {
          this.submitting = false;
          this.showPrescriptionUpload = false;
          this.selectedFile = undefined;
          this.prescriptionModel = {
            prescriberName: '',
            healthCenter: '',
            prescriptionDate: new Date().toISOString().slice(0, 10),
            prescriptionText: '',
          };
          this.loadPrescriptions();
        },
        error: (err) => {
          this.submitting = false;
          this.errorMessage = err.error?.message || 'Téléversement impossible.';
        },
      });
  }

  viewPrescription(prescriptionId: string) {
    this.closePreviewModal();
    this.api.getPrescriptionPreview(prescriptionId).subscribe({
      next: (res) => {
        if (res.storageMode === 'local') {
          this.api.getPrescriptionImage(prescriptionId).subscribe({
            next: (image) => this.openPrescriptionPreview(URL.createObjectURL(image), res.expiresAt),
            error: (err) => this.errorMessage = err.error?.message || 'Image locale de l’ordonnance introuvable.',
          });
          return;
        }
        this.openPrescriptionPreview(res.signedUrl, res.expiresAt);
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Accès à l’image refusé ou non autorisé (RG-17).';
      },
    });
  }

  private openPrescriptionPreview(url: string, expiresAt: string) {
    this.previewModalUrl = url;
    this.previewModalExpired = false;
    const timestamp = new Date(expiresAt).getTime();
    this.previewModalSeconds = Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
    clearInterval(this.previewTimer);
    this.previewTimer = setInterval(() => {
      this.previewModalSeconds--;
      if (this.previewModalSeconds <= 0) {
        clearInterval(this.previewTimer);
        if (this.previewModalUrl.startsWith('blob:')) URL.revokeObjectURL(this.previewModalUrl);
        this.previewModalUrl = '';
        this.previewModalExpired = true;
      }
    }, 1000);
  }

  closePreviewModal() {
    if (this.previewModalUrl.startsWith('blob:')) URL.revokeObjectURL(this.previewModalUrl);
    this.previewModalUrl = '';
    this.previewModalExpired = false;
    clearInterval(this.previewTimer);
  }

  getTotalCreditPurchases(): number {
    return this.statement?.purchases?.reduce((sum, p) => sum + p.creditCdf, 0) || 0;
  }

  getTotalPayments(): number {
    return this.statement?.payments?.reduce((sum, p) => sum + p.amountPaidCdf, 0) || 0;
  }

  getStatementOperations(): Array<{ date: string; label: string; reference: string; debit?: number; credit?: number }> {
    if (!this.statement) return [];
    const ops: Array<{ date: string; label: string; reference: string; debit?: number; credit?: number }> = [];

    this.statement.purchases?.forEach((p) => {
      if (p.creditCdf > 0) {
        ops.push({
          date: p.date,
          label: 'Achat à crédit',
          reference: p.invoiceNumber,
          debit: p.creditCdf,
        });
      }
    });

    this.statement.payments?.forEach((pay) => {
      ops.push({
        date: pay.createdAt,
        label: `Règlement (${pay.method})`,
        reference: pay.receiptReference || 'RCL',
        credit: pay.amountPaidCdf,
      });
    });

    return ops.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  printStatement() {
    window.print();
  }

  printReceipt() {
    window.print();
  }
}
