import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Customer } from '@vhp/shared';
import { CustomersApiService, CustomerStatement } from '../../core/api/services/customers-api.service';
import { DocumentHeaderService } from '../../core/services/document-header.service';
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
          <h2>Gestion des Clients, Créances & Ordonnances</h2>
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
                  <td (click)="$event.stopPropagation()">
                    <div style="display: flex; gap: 4px; align-items: center;">
                      <button type="button" class="btn btn-xs btn-outline" (click)="selectCustomer(c)" title="Consulter la fiche détaillée">
                        Fiche
                      </button>
                      <button type="button" class="btn btn-xs btn-primary" *ngIf="auth.peut('client.fiche_imprimer')" (click)="openPdfModal(c, 'download')" title="Télécharger la fiche (PDF)">
                        📥 PDF
                      </button>
                      <button type="button" class="btn btn-xs btn-outline" *ngIf="auth.peut('client.fiche_imprimer')" (click)="openPdfModal(c, 'print')" title="Imprimer la fiche">
                        🖨️
                      </button>
                    </div>
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
              <div class="profile-photo-block">
                <div class="photo-wrapper">
                  <img *ngIf="profilePhotoUrl" [src]="profilePhotoUrl" alt="Photo du client" class="profile-photo cursor-pointer" (click)="openPhotoZoomModal()" title="Cliquer pour agrandir la photo">
                  <div *ngIf="!profilePhotoUrl" class="profile-photo-placeholder">{{ getInitials(selectedCustomer.fullName) }}</div>
                </div>
                <input #profilePhotoInput type="file" accept="image/jpeg,image/png" hidden (change)="onProfilePhotoSelected($event)">
                <input #cameraPhotoInput type="file" accept="image/jpeg,image/png" capture="environment" hidden (change)="onProfilePhotoSelected($event)">
                <div class="photo-actions">
                  <button type="button" class="btn btn-xs btn-outline" (click)="profilePhotoInput.click()" title="Choisir un fichier image (JPG/PNG max 2 Mo)">
                    📁 {{ selectedCustomer.hasProfilePhoto ? 'Changer' : 'Ajouter' }}
                  </button>
                  <button type="button" class="btn btn-xs btn-outline" (click)="openCameraModal()" title="Prendre une photo en direct avec la webcam ou la caméra">
                    📷 Caméra
                  </button>
                  <button type="button" class="btn btn-xs btn-danger-outline" *ngIf="selectedCustomer.hasProfilePhoto" (click)="removeProfilePhoto()" title="Retirer la photo actuelle">
                    🗑️
                  </button>
                </div>
              </div>
              <div class="customer-identity-header">
                <span class="badge badge-type">{{ selectedCustomer.customerType }}</span>
                <h3>{{ selectedCustomer.fullName }}</h3>
                <span class="text-muted font-mono">{{ selectedCustomer.code }}</span>
                <div class="mt-2 d-flex gap-2 flex-wrap">
                  <button type="button" class="btn btn-sm btn-outline" (click)="openEditCustomerModal(selectedCustomer)">
                    ✏️ Modifier la fiche
                  </button>
                  <button type="button" class="btn btn-sm btn-primary" *ngIf="auth.peut('client.fiche_imprimer')" (click)="openPdfModal(selectedCustomer, 'download')">
                    📥 Télécharger la fiche (PDF)
                  </button>
                  <button type="button" class="btn btn-sm btn-outline" *ngIf="auth.peut('client.fiche_imprimer')" (click)="openPdfModal(selectedCustomer, 'print')">
                    🖨️ Imprimer la fiche
                  </button>
                  <button type="button" class="btn btn-sm btn-secondary" (click)="printFullCustomerDossier()">
                    🖨️ Imprimer le Dossier Complet
                  </button>
                </div>
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
                    <label>Téléphone principal :</label>
                    <span><strong>{{ selectedCustomer.phone || 'Non renseigné' }}</strong></span>
                  </div>
                  <div class="info-item">
                    <label>Email :</label>
                    <span>{{ selectedCustomer.email || 'Non renseigné' }}</span>
                  </div>
                  <div class="info-item" *ngIf="selectedCustomer.sexe">
                    <label>Genre / Sexe :</label>
                    <span>{{ selectedCustomer.sexe === 'M' ? 'Masculin (Homme)' : 'Féminin (Femme)' }}</span>
                  </div>
                  <div class="info-item" *ngIf="selectedCustomer.dateNaissance">
                    <label>Date de naissance / Âge :</label>
                    <span>{{ selectedCustomer.dateNaissance | date:'dd/MM/yyyy' }} <strong class="text-success">({{ getCalculatedAge(selectedCustomer.dateNaissance) }})</strong></span>
                  </div>
                  <div class="info-item" *ngIf="selectedCustomer.nationalite">
                    <label>Nationalité :</label>
                    <span>{{ selectedCustomer.nationalite }}</span>
                  </div>
                  <div class="info-item" *ngIf="selectedCustomer.companyName">
                    <label>Entreprise / Employeur :</label>
                    <span>{{ selectedCustomer.companyName }}</span>
                  </div>
                  <div class="info-item">
                    <label>Plafond autorisé :</label>
                    <span><strong>{{ selectedCustomer.creditLimitCdf | number }} CDF</strong></span>
                  </div>
                  <div class="info-item" style="grid-column: span 2;">
                    <label>Adresse physique / Localisation :</label>
                    <span>{{ getFormattedAddress(selectedCustomer.address) }}</span>
                  </div>
                </div>

                <!-- Informations Entreprise & Représentant Légal (Si compte ENTREPRISE) -->
                <div class="info-block mt-3" *ngIf="selectedCustomer.customerType === 'ENTREPRISE' && selectedCustomer.enterprise">
                  <h5>🏢 Identification Légale & Fiscale de l’Entreprise</h5>
                  <div class="info-grid">
                    <div class="info-item">
                      <label>Raison Sociale :</label>
                      <span><strong>{{ selectedCustomer.enterprise.legalName }}</strong></span>
                    </div>
                    <div class="info-item" *ngIf="selectedCustomer.enterprise.rccm">
                      <label>Numéro RCCM :</label>
                      <span class="font-mono">{{ selectedCustomer.enterprise.rccm }}</span>
                    </div>
                    <div class="info-item" *ngIf="selectedCustomer.enterprise.nationalId">
                      <label>Identification Nationale :</label>
                      <span class="font-mono">{{ selectedCustomer.enterprise.nationalId }}</span>
                    </div>
                    <div class="info-item" *ngIf="selectedCustomer.enterprise.taxId">
                      <label>Numéro Impôt (NIF) :</label>
                      <span class="font-mono">{{ selectedCustomer.enterprise.taxId }}</span>
                    </div>
                    <div class="info-item" *ngIf="selectedCustomer.enterprise.representativeName">
                      <label>Représentant Légal :</label>
                      <span>{{ selectedCustomer.enterprise.representativeName }} <small *ngIf="selectedCustomer.enterprise.representativeFunction">({{ selectedCustomer.enterprise.representativeFunction }})</small></span>
                    </div>
                    <div class="info-item" *ngIf="selectedCustomer.enterprise.representativePhone">
                      <label>Téléphone Représentant :</label>
                      <span>{{ selectedCustomer.enterprise.representativePhone }}</span>
                    </div>
                  </div>
                </div>

                <!-- Pièces d'identité & Justificatifs -->
                <div class="info-block mt-3" *ngIf="selectedCustomer.identityDocuments?.length">
                  <h5>📄 Pièces d’identité enregistrées</h5>
                  <div class="doc-item" *ngFor="let doc of selectedCustomer.identityDocuments">
                    <div>
                      <strong>{{ doc.type }} : </strong>
                      <span class="font-mono">{{ doc.fullNumber || doc.number }}</span>
                      <small class="text-muted ml-2" *ngIf="doc.expirationDate"> (Exp: {{ doc.expirationDate | date:'dd/MM/yyyy' }})</small>
                    </div>
                    <div class="d-flex gap-2">
                      <button type="button" class="btn btn-xs btn-outline" *ngIf="!doc.fullNumber && doc.number?.includes('*')" (click)="revealDocumentNumber(doc)">
                        👁️ Révéler le numéro
                      </button>
                      <button type="button" class="btn btn-xs btn-info" *ngIf="doc.hasScan" (click)="viewIdentityScan(doc)">
                        📄 Consulter scan
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Informations d'assurance -->
                <div class="info-block mt-3" *ngIf="selectedCustomer.insurance">
                  <h5>🛡️ Couverture & Assurance Santé</h5>
                  <div class="info-grid">
                    <div class="info-item">
                      <label>Organisme assureur :</label>
                      <span><strong>{{ selectedCustomer.insurance.insurerName }}</strong></span>
                    </div>
                    <div class="info-item">
                      <label>Numéro de carte / assuré :</label>
                      <span class="font-mono">{{ selectedCustomer.insurance.insuredCardNumber }}</span>
                    </div>
                    <div class="info-item" *ngIf="selectedCustomer.insurance.endDate">
                      <label>Validité de la police :</label>
                      <span>Jusqu’au {{ selectedCustomer.insurance.endDate | date:'dd/MM/yyyy' }}</span>
                    </div>
                    <div class="info-item" *ngIf="selectedCustomer.insurance.status">
                      <label>Statut :</label>
                      <span class="badge" [ngClass]="selectedCustomer.insurance.status === 'VALID' ? 'badge-valid' : 'badge-warning'">
                        {{ selectedCustomer.insurance.status === 'VALID' ? 'Actif' : selectedCustomer.insurance.status }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Personnes de contact -->
                <div class="info-block mt-3" *ngIf="selectedCustomer.contacts?.length">
                  <h5>👥 Personnes de contact d’urgence</h5>
                  <div class="info-grid">
                    <div class="info-item" *ngFor="let ct of selectedCustomer.contacts">
                      <label>{{ ct.name }} <small *ngIf="ct.relationship">({{ ct.relationship }})</small> :</label>
                      <span><strong>{{ ct.phone }}</strong></span>
                    </div>
                  </div>
                </div>

                <div class="medical-notes-card mt-3">
                  <h4>⚠️ Notes médicales et allergies</h4>
                  <p *ngIf="selectedCustomer.medicalNotes" class="medical-text">
                    {{ selectedCustomer.medicalNotes }}
                  </p>
                  <p *ngIf="!selectedCustomer.medicalNotes" class="text-muted">
                    Aucune allergie ou contre-indication spécifique enregistrée.
                  </p>
                </div>

                <!-- Zone d'administration du compte -->
                <div class="mt-4 pt-3 border-top d-flex justify-between align-center">
                  <small class="text-muted">Fiche créée le {{ selectedCustomer.createdAt | date:'dd/MM/yyyy à HH:mm' }}</small>
                  <button type="button" class="btn btn-sm btn-danger-outline" (click)="deactivateCustomer()">
                    🚫 Désactiver cette fiche client
                  </button>
                </div>
              </div>

              <!-- ================= ONGLET 2 : HISTORIQUE DES ACHATS ================= -->
              <div *ngIf="activeTab === 'achats'" class="tab-pane">
                <div class="section-actions">
                  <h4>Historique des Factures d’Achats</h4>
                  <small class="text-muted">Cliquez sur une facture pour afficher le détail des médicaments délivrés.</small>
                </div>
                <table class="data-table mt-2">
                  <thead>
                    <tr>
                      <th>N° Facture</th>
                      <th>Date</th>
                      <th>Mode / Statut</th>
                      <th>Total Vente</th>
                      <th>Part Crédit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <ng-container *ngFor="let p of statement?.purchases">
                      <tr (click)="togglePurchaseDetails(p.id)" class="cursor-pointer" title="Cliquer pour afficher les médicaments">
                        <td class="font-mono">
                          <strong>{{ p.invoiceNumber }}</strong>
                          <span class="ml-2 text-muted small">{{ expandedPurchaseId === p.id ? '▲ Masquer' : '▼ Détails (' + (p.items?.length || 0) + ')' }}</span>
                        </td>
                        <td>{{ p.date | date:'dd/MM/yyyy HH:mm' }}</td>
                        <td>
                          <span *ngIf="p.creditCdf === 0" class="badge badge-valid">100% Comptant</span>
                          <span *ngIf="p.creditCdf > 0 && p.creditCdf === p.totalCdf" class="badge badge-credit">100% À Crédit</span>
                          <span *ngIf="p.creditCdf > 0 && p.creditCdf < p.totalCdf" class="badge badge-warning">Mixte</span>
                        </td>
                        <td><strong>{{ p.totalCdf | number }} CDF</strong></td>
                        <td>
                          <span [class.badge-credit]="p.creditCdf > 0">
                            {{ p.creditCdf | number }} CDF
                          </span>
                        </td>
                      </tr>
                      <!-- Panier déroulant avec les médicaments vendus -->
                      <tr *ngIf="expandedPurchaseId === p.id" class="purchase-items-row">
                        <td colspan="5">
                          <div class="purchase-items-card">
                            <h6>📦 Médicaments & Produits délivrés sur la Facture {{ p.invoiceNumber }} :</h6>
                            <table class="data-table preview-table" *ngIf="p.items?.length">
                              <thead>
                                <tr>
                                  <th>Médicament</th>
                                  <th>Dosage / Forme</th>
                                  <th>N° Lot</th>
                                  <th>Péremption</th>
                                  <th>Quantité</th>
                                  <th>Prix Unitaire</th>
                                  <th>Total Ligne</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr *ngFor="let it of p.items">
                                  <td><strong>{{ it.productName }}</strong> <small class="text-muted" *ngIf="it.dci">({{ it.dci }})</small></td>
                                  <td>{{ it.dosage || '-' }} {{ it.galenicForm ? '(' + it.galenicForm + ')' : '' }}</td>
                                  <td class="font-mono">{{ it.lotNumber || '-' }}</td>
                                  <td>{{ it.expiryDate || '-' }}</td>
                                  <td><strong>{{ it.quantity }}</strong></td>
                                  <td>{{ it.unitPriceCdf | number }} CDF</td>
                                  <td class="font-bold text-success">{{ it.totalLineCdf | number }} CDF</td>
                                </tr>
                              </tbody>
                            </table>
                            <div *ngIf="!p.items?.length" class="text-muted small py-2">
                              Aucun détail d'article spécifique répertorié pour cette vente.
                            </div>
                          </div>
                        </td>
                      </tr>
                    </ng-container>
                    <tr *ngIf="!statement?.purchases?.length">
                      <td colspan="5" class="text-center text-muted py-3">Aucun achat enregistré pour ce client.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- ================= ONGLET 3 : PAIEMENTS & ENCAISSEMENT ================= -->
              <div *ngIf="activeTab === 'paiements'" class="tab-pane">
                <div class="section-actions">
                  <h4>Règlements et encaissement de créance</h4>
                  <button
                    type="button"
                    class="btn btn-success"
                    *ngIf="!showSettlementForm && (statement?.currentBalanceCdf ?? 0) > 0"
                    (click)="openSettlementForm()"
                  >
                    + Encaisser un règlement
                  </button>
                </div>

                <!-- Alerte si aucune créance n'est due -->
                <div class="settlement-clean-alert" *ngIf="(statement?.currentBalanceCdf ?? 0) <= 0">
                  <span>✅ <strong>Compte en règle :</strong> Ce client ne présente aucune dette en cours (Solde dû : 0 CDF).</span>
                </div>

                <!-- Formulaire d'encaissement de créance avec imputation visible -->
                <div class="settlement-form-card" *ngIf="showSettlementForm">
                  <h5>Encaisser un règlement (FIFO - Imputation automatique)</h5>

                  <!-- État de la session de caisse active -->
                  <div class="alert alert-warning mb-3" *ngIf="cashSessionWarning">
                    <span>{{ cashSessionWarning }}</span>
                  </div>
                  <div class="settlement-session-info mb-2" *ngIf="activeCashSession">
                    <span class="badge badge-valid">✓ Caisse active : #{{ activeCashSession.id.slice(0, 8) }} (Ouverte à {{ activeCashSession.openingTime | date:'HH:mm' }})</span>
                  </div>

                  <form (ngSubmit)="submitSettlement()">
                    <div class="form-row">
                      <div class="form-group" style="flex: 2;">
                        <div class="d-flex justify-between align-center">
                          <label>Montant du règlement *</label>
                          <button type="button" class="btn btn-xs btn-outline" (click)="setFullSettlementAmount()" title="Régler l'intégralité du solde restant">
                            Tout solder ({{ (statement?.currentBalanceCdf ?? 0) | number }} CDF)
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          [(ngModel)]="settlementModel.amount"
                          name="amount"
                          (input)="calculateImputationPreview()"
                          class="form-control"
                        />
                        <small class="text-muted" *ngIf="settlementModel.currency === 'USD'">
                          Équivalent : <strong>{{ getEffectiveSettlementAmountCdf() | number }} CDF</strong> (Taux officiel : 1 USD = {{ activeExchangeRate | number }} CDF)
                        </small>
                      </div>
                      <div class="form-group" style="flex: 1;">
                        <label>Devise *</label>
                        <select [(ngModel)]="settlementModel.currency" name="currency" class="form-control" (change)="onCurrencyChange()">
                          <option value="CDF">CDF (Franc Congolais)</option>
                          <option value="USD">USD (Dollar US)</option>
                        </select>
                      </div>
                      <div class="form-group" style="flex: 1.5;">
                        <label>Mode de paiement *</label>
                        <select [(ngModel)]="settlementModel.paymentMethod" name="paymentMethod" class="form-control">
                          <option value="ESPECES">Espèces</option>
                          <option value="MOBILE_MONEY">Mobile Money</option>
                          <option value="CARTE_BANCAIRE">Carte Bancaire</option>
                          <option value="VIREMENT">Virement Bancaire</option>
                        </select>
                      </div>
                    </div>

                    <div class="alert alert-danger mt-2" *ngIf="isSettlementAmountExceeded()">
                      ⚠️ Le montant saisi ({{ getEffectiveSettlementAmountCdf() | number }} CDF) dépasse le solde débiteur total ({{ (statement?.currentBalanceCdf ?? 0) | number }} CDF). Le montant ne peut excéder le solde dû.
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
                      <button type="submit" class="btn btn-primary" [disabled]="submitting || settlementModel.amount <= 0 || !activeCashSession || isSettlementAmountExceeded()">
                        <span *ngIf="submitting">Validation en cours...</span>
                        <span *ngIf="!submitting">Valider le paiement & Générer reçu</span>
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
                      <th>Action</th>
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
                          {{ alloc.invoiceNumber || 'Facture' }} : {{ alloc.amountCdf | number }} CDF
                        </span>
                      </td>
                      <td>
                        <button type="button" class="btn btn-xs btn-outline" (click)="printSingleReceipt(pay)">
                          🖨️ Reçu
                        </button>
                      </td>
                    </tr>
                    <tr *ngIf="!statement?.payments?.length">
                      <td colspan="7" class="text-center text-muted py-3">Aucun règlement antérieur pour ce client.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- ================= ONGLET 4 : RELEVÉ DE COMPTE ================= -->
              <div *ngIf="activeTab === 'releve'" class="tab-pane">
                <div class="statement-card printable-area">
                  <div class="statement-header">
                    <div class="officine-statement-badge">
                      <h2>PHARMACIE VOICI L'HOMME</h2>
                      <p>Officine Pharmaceutique — Kinshasa / RDC</p>
                      <h3>RELEVÉ DE COMPTE & SITUATION DES CRÉANCES</h3>
                      <p>Client : <strong>{{ selectedCustomer.fullName }}</strong> (Code : {{ selectedCustomer.code }})</p>
                      <small>Généré le {{ statement?.generatedAt | date:'dd/MM/yyyy à HH:mm' }}</small>
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
                        <th>Solde Dû Cumulé</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let row of getStatementOperations()">
                        <td>{{ row.date | date:'dd/MM/yyyy HH:mm' }}</td>
                        <td>{{ row.label }}</td>
                        <td class="font-mono">{{ row.reference }}</td>
                        <td class="text-danger">{{ row.debit ? (row.debit | number) + ' CDF' : '-' }}</td>
                        <td class="text-success">{{ row.credit ? (row.credit | number) + ' CDF' : '-' }}</td>
                        <td class="font-bold" [ngClass]="row.balanceAfter > 0 ? 'text-danger' : 'text-success'">
                          {{ row.balanceAfter | number }} CDF
                        </td>
                      </tr>
                      <tr *ngIf="!getStatementOperations().length">
                        <td colspan="6" class="text-center text-muted py-3">Aucune opération enregistrée.</td>
                      </tr>
                    </tbody>
                  </table>

                  <!-- Pied de page officiel du relevé -->
                  <div class="mt-4 pt-3 border-top d-flex justify-between align-center">
                    <small class="text-muted">Relevé officiel certifié conforme aux écritures comptables de l'officine.</small>
                    <div class="text-center" style="min-width: 180px;">
                      <small>Visa Comptable / Direction</small>
                      <div style="height: 35px; border-bottom: 1px dashed #cbd5d0;"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ================= ONGLET 5 : ORDONNANCES SÉCURISÉES ================= -->
              <div *ngIf="activeTab === 'ordonnances'" class="tab-pane">
                <div class="section-actions">
                  <h4>Ordonnances Médicales du Patient</h4>
                  <div class="d-flex gap-2">
                    <input
                      type="text"
                      [(ngModel)]="prescriptionFilter"
                      placeholder="Filtrer prescripteur ou hôpital..."
                      class="form-control"
                      style="max-width: 250px; font-size: 12px;"
                    />
                    <button type="button" class="btn btn-primary" (click)="showPrescriptionUpload = !showPrescriptionUpload">
                      {{ showPrescriptionUpload ? 'Fermer le formulaire' : '+ Nouvelle Ordonnance' }}
                    </button>
                  </div>
                </div>

                <!-- Formulaire de saisie d'ordonnance -->
                <div class="prescription-form-card" *ngIf="showPrescriptionUpload">
                  <h5>Enregistrement d’une ordonnance</h5>

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
                        #prescriptionFileInput
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        (change)="onPrescriptionFileSelected($event)"
                        class="form-control"
                      />
                      <small class="text-muted">Formats acceptés : JPEG, PNG, WebP (Max 8 Mo). Stockage privé sécurisé.</small>
                    </div>

                    <!-- Prévisualisation immédiate de l'ordonnance sélectionnée -->
                    <div class="prescription-file-preview mt-2" *ngIf="selectedPrescriptionPreviewUrl">
                      <div class="preview-card d-flex align-center gap-2" style="background: #fff; padding: 8px; border: 1px solid #cbd5d0; border-radius: 6px;">
                        <img [src]="selectedPrescriptionPreviewUrl" alt="Aperçu sélection" style="max-height: 80px; max-width: 120px; border-radius: 4px; border: 1px solid #cbd5d0; object-fit: contain;">
                        <div>
                          <div class="font-bold small">{{ selectedFile?.name }}</div>
                          <div class="text-muted small">{{ ((selectedFile?.size || 0) / 1024) | number:'1.0-0' }} Ko</div>
                          <button type="button" class="btn btn-xs btn-danger-outline mt-1" (click)="clearSelectedPrescriptionFile(prescriptionFileInput)">
                            ✕ Retirer cette image
                          </button>
                        </div>
                      </div>
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
                        <span *ngIf="submitting">Téléversement en cours...</span>
                        <span *ngIf="!submitting">Téléverser dans le bucket privé</span>
                      </button>
                    </div>
                  </form>
                </div>

                <!-- Liste des ordonnances -->
                <table class="data-table mt-3">
                  <thead>
                    <tr>
                      <th>Date Prescr.</th>
                      <th>Validité</th>
                      <th>Prescripteur</th>
                      <th>Établissement</th>
                      <th>Notes / Traitement</th>
                      <th>Image Privée</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let ord of filteredPrescriptions()">
                      <td>{{ ord.prescriptionDate }}</td>
                      <td>
                        <span class="badge" [ngClass]="getPrescriptionStatus(ord.prescriptionDate).class">
                          {{ getPrescriptionStatus(ord.prescriptionDate).label }}
                        </span>
                      </td>
                      <td><strong>{{ ord.prescriberName }}</strong></td>
                      <td>{{ ord.healthCenter || 'Non spécifié' }}</td>
                      <td>{{ ord.prescriptionText || '-' }}</td>
                      <td>
                        <button type="button" class="btn btn-sm btn-info" (click)="viewPrescription(ord.id)">
                          👁️ Consulter l'image (Lien sécurisé)
                        </button>
                      </td>
                    </tr>
                    <tr *ngIf="!filteredPrescriptions().length">
                      <td colspan="6" class="text-center text-muted py-3">Aucune ordonnance trouvée.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- MODALE 1 : NOUVEAU / MODIFICATION CLIENT COMPLET (DOSSIER CIVIL & MÉDICAL) -->
      <div class="modal-backdrop" *ngIf="showNewCustomerModal">
        <div class="modal-dialog customer-modal-dialog">
          <div class="customer-modal-header">
            <div class="cmh-left">
              <div class="cmh-icon-circle" *ngIf="!isEditingCustomer">
                <span>➕</span>
              </div>
              <div class="cmh-icon-circle cmh-edit" *ngIf="isEditingCustomer">
                <span>✏️</span>
              </div>
              <div class="cmh-text">
                <h4 class="cmh-title" *ngIf="!isEditingCustomer">Nouveau dossier client</h4>
                <h4 class="cmh-title" *ngIf="isEditingCustomer">Modification du dossier</h4>
                <p class="cmh-subtitle" *ngIf="!isEditingCustomer">Remplissez les informations civiles, médicales et financières du nouveau patient.</p>
                <p class="cmh-subtitle" *ngIf="isEditingCustomer">Mise à jour des informations du patient existant.</p>
              </div>
            </div>
            <div class="cmh-right">
              <span class="cmh-badge" *ngIf="!isEditingCustomer">Création</span>
              <span class="cmh-badge cmh-badge-edit" *ngIf="isEditingCustomer">Modification</span>
              <button type="button" class="cmh-close" (click)="showNewCustomerModal = false" title="Fermer">×</button>
            </div>
          </div>
          <div class="modal-body">
            <!-- Message d'erreur spécifique à la modale -->
            <div class="alert alert-danger mb-3" *ngIf="modalErrorMessage" style="margin-bottom: 14px;">
              <span>⚠️ {{ modalErrorMessage }}</span>
              <button type="button" class="close-alert-btn" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #b91c1c;" (click)="modalErrorMessage = ''">×</button>
            </div>

            <!-- Mention de confidentialité (CLI-10) -->
            <div class="privacy-notice-box" *ngIf="privacyNotice && !isEditingCustomer">
              <span class="icon">🔒</span>
              <small>{{ privacyNotice }}</small>
            </div>

            <form (ngSubmit)="saveCustomer()">
              <!-- TYPE DE CLIENT -->
              <div class="form-row">
                <div class="form-group" style="flex: 2;">
                  <label>Type de compte / Statut *</label>
                  <select [(ngModel)]="newCustomerForm.customerType" name="customerType" class="form-control" style="font-weight: 600;">
                    <option value="PARTICULIER">👤 Patient Particulier (Comptoir / Privé)</option>
                    <option value="ENTREPRISE">🏢 Compte Entreprise / Société Conventionnée</option>
                    <option value="ASSURANCE">🛡️ Patient Assuré / Tiers-Payant Mutuelle</option>
                  </select>
                </div>
                <div class="form-group" style="flex: 1;">
                  <label>Plafond Crédit Autorisé (CDF) *</label>
                  <input type="number" min="0" [(ngModel)]="newCustomerForm.creditLimitCdf" name="creditLimitCdf" class="form-control" placeholder="0">
                </div>
              </div>

              <!-- 1. IDENTITÉ CIVILE DU PATIENT -->
              <fieldset class="form-section">
                <legend>👤 1. Identité Civile du Patient</legend>
                <div class="form-row">
                  <div class="form-group">
                    <label>Prénom</label>
                    <input [(ngModel)]="newCustomerForm.prenom" (input)="onNameChange()" name="prenom" class="form-control" placeholder="Ex: Jean">
                  </div>
                  <div class="form-group">
                    <label>Nom de famille *</label>
                    <input [(ngModel)]="newCustomerForm.nom" (input)="onNameChange()" name="nom" class="form-control" placeholder="Ex: Mukendi">
                  </div>
                  <div class="form-group">
                    <label>Postnom</label>
                    <input [(ngModel)]="newCustomerForm.postnom" (input)="onNameChange()" name="postnom" class="form-control" placeholder="Ex: Ilunga">
                  </div>
                </div>
                <div class="form-group mt-2">
                  <label>Nom complet d'affichage (automatique ou libre) *</label>
                  <input [(ngModel)]="newCustomerForm.fullName" name="fullName" class="form-control" placeholder="Ex: Mukendi Jean">
                </div>
                <div class="form-row mt-2">
                  <div class="form-group">
                    <label>Sexe / Genre</label>
                    <select [(ngModel)]="newCustomerForm.sexe" name="sexe" class="form-control">
                      <option value="M">Masculin (Homme)</option>
                      <option value="F">Féminin (Femme)</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Date de naissance <small class="text-success font-bold" *ngIf="newCustomerForm.dateNaissance">({{ getCalculatedAge(newCustomerForm.dateNaissance) }})</small></label>
                    <input type="date" [(ngModel)]="newCustomerForm.dateNaissance" name="dateNaissance" class="form-control">
                  </div>
                  <div class="form-group">
                    <label>Nationalité</label>
                    <input [(ngModel)]="newCustomerForm.nationalite" name="nationalite" class="form-control" placeholder="Ex: Congolaise (RDC)">
                  </div>
                </div>
                <div class="form-row mt-2">
                  <div class="form-group">
                    <label>Téléphone principal (Appel / SMS / WhatsApp) *</label>
                    <input [(ngModel)]="newCustomerForm.phone" name="phone" class="form-control" placeholder="+243...">
                  </div>
                  <div class="form-group">
                    <label>Téléphone secondaire</label>
                    <input [(ngModel)]="newCustomerForm.telephoneSecondaire" name="telephoneSecondaire" class="form-control" placeholder="+243...">
                  </div>
                  <div class="form-group">
                    <label>Adresse Email</label>
                    <input type="email" [(ngModel)]="newCustomerForm.email" name="email" class="form-control" placeholder="patient@domaine.cd">
                  </div>
                </div>
              </fieldset>

              <!-- 2. DOSSIER MÉDICAL & PHARMACOVIGILANCE (Capital pour l'officine) -->
              <fieldset class="form-section">
                <legend>🩺 2. Dossier Médical & Pharmacovigilance</legend>
                <div class="form-row">
                  <div class="form-group">
                    <label>Groupe Sanguin & Rhésus</label>
                    <select [(ngModel)]="newCustomerForm.medicalDetails.bloodGroup" name="bloodGroup" class="form-control">
                      <option value="">Non déterminé / Inconnu</option>
                      <option value="O+">O Rhésus Positif (O+)</option>
                      <option value="O-">O Rhésus Négatif (O-)</option>
                      <option value="A+">A Rhésus Positif (A+)</option>
                      <option value="A-">A Rhésus Négatif (A-)</option>
                      <option value="B+">B Rhésus Positif (B+)</option>
                      <option value="B-">B Rhésus Négatif (B-)</option>
                      <option value="AB+">AB Rhésus Positif (AB+)</option>
                      <option value="AB-">AB Rhésus Négatif (AB-)</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>État Physiologique Spécifique</label>
                    <select [(ngModel)]="newCustomerForm.medicalDetails.physiologicalState" name="physiologicalState" class="form-control">
                      <option value="AUCUN">Aucun état particulier</option>
                      <option value="GROSSESSE">Femme enceinte / Grossesse en cours</option>
                      <option value="ALLAITEMENT">Mère allaitante</option>
                    </select>
                  </div>
                </div>
                <div class="form-group mt-2">
                  <label class="text-danger font-bold">⚠️ Allergies Médicamenteuses et Contre-indications :</label>
                  <input [(ngModel)]="newCustomerForm.medicalDetails.allergies" name="allergies" class="form-control" placeholder="Ex: Pénicilline, Sulfamides, Aspirine / AINS, Céphalosporines...">
                </div>
                <div class="form-group mt-2">
                  <label>Pathologies chroniques & Terrain à risque :</label>
                  <input [(ngModel)]="newCustomerForm.medicalDetails.chronicDiseases" name="chronicDiseases" class="form-control" placeholder="Ex: Hypertension artérielle (HTA), Diabète Type 2, Asthme, Insuffisance rénale, Ulcère...">
                </div>
                <div class="form-group mt-2">
                  <label>Antécédents médicaux & Notes complémentaires du Pharmacien :</label>
                  <textarea [(ngModel)]="newCustomerForm.medicalNotes" name="medicalNotes" class="form-control" rows="2" placeholder="Autres observations cliniques ou posologiques utiles..."></textarea>
                </div>
              </fieldset>

              <!-- 3. COORDONNÉES ET LOCALISATION GÉOGRAPHIQUE -->
              <fieldset class="form-section">
                <legend>📍 3. Adresse Physique & Localisation</legend>
                <div class="form-row">
                  <div class="form-group">
                    <label>Ville <span class="text-danger" *ngIf="newCustomerForm.customerType === 'ASSURANCE'">*</span></label>
                    <input [(ngModel)]="newCustomerForm.addressDetails.ville" name="ville" class="form-control" placeholder="Kinshasa">
                  </div>
                  <div class="form-group">
                    <label>Commune <span class="text-danger" *ngIf="newCustomerForm.customerType === 'ASSURANCE'">*</span></label>
                    <input [(ngModel)]="newCustomerForm.addressDetails.commune" name="commune" class="form-control" placeholder="Ex: Gombe, Ngaliema...">
                  </div>
                  <div class="form-group">
                    <label>Quartier <span class="text-danger" *ngIf="newCustomerForm.customerType === 'ASSURANCE'">*</span></label>
                    <input [(ngModel)]="newCustomerForm.addressDetails.quartier" name="quartier" class="form-control" placeholder="Ex: Macampagne">
                  </div>
                </div>
                <div class="form-row mt-2">
                  <div class="form-group" style="flex: 2;">
                    <label>Avenue / Rue</label>
                    <input [(ngModel)]="newCustomerForm.addressDetails.avenueRue" name="avenueRue" class="form-control" placeholder="Ex: Av. de la Justice">
                  </div>
                  <div class="form-group" style="flex: 1;">
                    <label>N° Parcelle</label>
                    <input [(ngModel)]="newCustomerForm.addressDetails.numeroParcelle" name="numeroParcelle" class="form-control" placeholder="Ex: 14 B">
                  </div>
                  <div class="form-group" style="flex: 2;">
                    <label>Point de Repère</label>
                    <input [(ngModel)]="newCustomerForm.addressDetails.pointDeRepere" name="pointDeRepere" class="form-control" placeholder="Ex: Réf. Rond-point...">
                  </div>
                </div>
              </fieldset>

              <!-- 4. PIÈCE D'IDENTITÉ ET CONTACT D'URGENCE -->
              <fieldset class="form-section">
                <legend>🪪 4. Pièce d'Identité & Contact d'Urgence</legend>
                <div class="form-row">
                  <div class="form-group">
                    <label>Type de document d'identité</label>
                    <select [(ngModel)]="newCustomerForm.identityDocuments[0].documentType" name="documentType" class="form-control">
                      <option value="CARTE_IDENTITE">Carte d'identité nationale</option>
                      <option value="CARTE_ELECTEUR">Carte d'électeur</option>
                      <option value="PASSEPORT">Passeport</option>
                      <option value="PERMIS">Permis de conduire</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Numéro de pièce <span class="text-danger" *ngIf="newCustomerForm.customerType === 'ASSURANCE'">*</span></label>
                    <input [(ngModel)]="newCustomerForm.identityDocuments[0].documentNumber" name="documentNumber" class="form-control" placeholder="Numéro officiel">
                  </div>
                  <div class="form-group">
                    <label>Date d'expiration</label>
                    <input type="date" [(ngModel)]="newCustomerForm.identityDocuments[0].expirationDate" name="docExpiration" class="form-control">
                  </div>
                </div>
                <div class="form-row mt-2">
                  <div class="form-group" style="flex: 2;">
                    <label>Personne de contact d'urgence <span class="text-danger" *ngIf="newCustomerForm.customerType === 'ASSURANCE'">*</span></label>
                    <input [(ngModel)]="newCustomerForm.contacts[0].name" name="contactName" class="form-control" placeholder="Nom complet du proche">
                  </div>
                  <div class="form-group" style="flex: 1;">
                    <label>Lien de parenté</label>
                    <input [(ngModel)]="newCustomerForm.contacts[0].relationship" name="contactRel" class="form-control" placeholder="Conjoint, Parent...">
                  </div>
                  <div class="form-group" style="flex: 1;">
                    <label>Téléphone d'urgence <span class="text-danger" *ngIf="newCustomerForm.customerType === 'ASSURANCE'">*</span></label>
                    <input [(ngModel)]="newCustomerForm.contacts[0].phone" name="contactPhone" class="form-control" placeholder="+243...">
                  </div>
                </div>
              </fieldset>

              <!-- 5. SPÉCIFIQUE ENTREPRISE CONVENTIONNÉE -->
              <fieldset class="form-section" *ngIf="newCustomerForm.customerType === 'ENTREPRISE'">
                <legend>🏢 5. Identifiants Légaux & Fiscaux de l’Entreprise</legend>
                <div class="form-row">
                  <div class="form-group">
                    <label>Raison Sociale de l’Entreprise *</label>
                    <input [(ngModel)]="newCustomerForm.enterprise.legalName" name="legalName" class="form-control" placeholder="Ex: Bralima SARL">
                  </div>
                  <div class="form-group">
                    <label>N° RCCM</label>
                    <input [(ngModel)]="newCustomerForm.enterprise.rccm" name="rccm" class="form-control" placeholder="CD/KIN/RCCM/...">
                  </div>
                </div>
                <div class="form-row mt-2">
                  <div class="form-group">
                    <label>Identification Nationale (ID. NAT)</label>
                    <input [(ngModel)]="newCustomerForm.enterprise.nationalId" name="nationalId" class="form-control" placeholder="01-83-N...">
                  </div>
                  <div class="form-group">
                    <label>Numéro Impôt (NIF)</label>
                    <input [(ngModel)]="newCustomerForm.enterprise.taxId" name="taxId" class="form-control" placeholder="A070...">
                  </div>
                </div>
                <div class="form-row mt-2">
                  <div class="form-group">
                    <label>Nom du Représentant Légal *</label>
                    <input [(ngModel)]="newCustomerForm.enterprise.representativeName" name="repName" class="form-control" placeholder="Nom du responsable">
                  </div>
                  <div class="form-group">
                    <label>Fonction du Représentant</label>
                    <input [(ngModel)]="newCustomerForm.enterprise.representativeFunction" name="repFunc" class="form-control" placeholder="DG, Gérant, DRH...">
                  </div>
                  <div class="form-group">
                    <label>Téléphone du Représentant *</label>
                    <input [(ngModel)]="newCustomerForm.enterprise.representativePhone" name="repPhone" class="form-control" placeholder="+243...">
                  </div>
                  <div class="form-group">
                    <label>N° Pièce Identité Représentant *</label>
                    <input [(ngModel)]="newCustomerForm.enterprise.representativeDocumentNumber" name="repDocNum" class="form-control" placeholder="Ex: N° Passeport, Permis...">
                  </div>
                </div>
              </fieldset>

              <!-- 6. SPÉCIFIQUE ASSURANCE & TIERS-PAYANT -->
              <fieldset class="form-section" *ngIf="newCustomerForm.customerType === 'ASSURANCE'">
                <legend>🛡️ 6. Prise en Charge Assurance / Mutuelle</legend>
                <div class="form-row">
                  <div class="form-group">
                    <label>Organisme Assureur / Société de Tiers-Payant *</label>
                    <input [(ngModel)]="newCustomerForm.insurance.insurerName" list="insurersList" name="insurerName" class="form-control" placeholder="Ex: Activa, Ascoma, Rawsur...">
                    <datalist id="insurersList">
                      <option *ngFor="let ins of insurers" [value]="ins.name">{{ ins.name }}</option>
                    </datalist>
                  </div>
                  <div class="form-group">
                    <label>Numéro d'Assuré / N° Carte Santé *</label>
                    <input [(ngModel)]="newCustomerForm.insurance.insuredCardNumber" name="insuredCardNumber" class="form-control" placeholder="Ex: POL-994821">
                  </div>
                </div>
                <div class="form-row mt-2">
                  <div class="form-group">
                    <label>N° Police / Bon de Prise en Charge</label>
                    <input [(ngModel)]="newCustomerForm.insurance.policyNumber" name="policyNumber" class="form-control" placeholder="Réf. police">
                  </div>
                  <div class="form-group">
                    <label>Taux de couverture pris en charge (%)</label>
                    <input type="number" min="1" max="100" [(ngModel)]="newCustomerForm.insurance.coverageRate" name="coverageRate" class="form-control" placeholder="80">
                  </div>
                  <div class="form-group">
                    <label>Date de fin de validité</label>
                    <input type="date" [(ngModel)]="newCustomerForm.insurance.endDate" name="insuranceEndDate" class="form-control">
                  </div>
                </div>
                <div class="form-row mt-2">
                  <div class="form-group">
                    <label>Statut de l'Assuré</label>
                    <select [(ngModel)]="newCustomerForm.insurance.insuredStatus" name="insuredStatus" class="form-control">
                      <option value="ASSURE_PRINCIPAL">Assuré Principal</option>
                      <option value="AYANT_DROIT">Ayant-Droit / Dépendant</option>
                    </select>
                  </div>
                  <div class="form-group" *ngIf="newCustomerForm.insurance.insuredStatus === 'AYANT_DROIT'">
                    <label>Nom de l'Assuré Principal</label>
                    <input [(ngModel)]="newCustomerForm.insurance.principalInsuredName" name="principalName" class="form-control" placeholder="Nom du titulaire">
                  </div>
                  <div class="form-group" *ngIf="newCustomerForm.insurance.insuredStatus === 'AYANT_DROIT'">
                    <label>Lien de parenté</label>
                    <input [(ngModel)]="newCustomerForm.insurance.relationshipToPrincipal" name="principalRel" class="form-control" placeholder="Enfant, Conjoint...">
                  </div>
                </div>
              </fieldset>

              <!-- CONSENTEMENT LÉGAL -->
              <div class="mt-3">
                <label class="consent-line" *ngIf="!isEditingCustomer">
                  <input type="checkbox" [(ngModel)]="newCustomerForm.consentementDonnees" name="consentementDonnees">
                  Le patient donne son consentement exprès à la collecte et à l'enregistrement de ses données civiles et de santé pour sa prise en charge pharmaceutique.
                </label>
              </div>

              <div class="modal-footer mt-3">
                <button type="button" class="btn btn-outline" (click)="showNewCustomerModal = false">Annuler</button>
                <button type="submit" class="btn btn-primary" [disabled]="submitting">
                  <span *ngIf="submitting">Enregistrement en cours...</span>
                  <span *ngIf="!submitting && isEditingCustomer">Mettre à jour la fiche</span>
                  <span *ngIf="!submitting && !isEditingCustomer">Enregistrer le client</span>
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
            <h4>Aperçu sécurisé de l'ordonnance médicale</h4>
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
              ⚠️ <strong>Le lien sécurisé a expiré.</strong><br>
              Pour préserver la confidentialité médicale, le lien signé a expiré. Veuillez cliquer à nouveau sur "Consulter" pour générer un nouvel accès journalisé.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" (click)="closePreviewModal()">Fermer</button>
            <button type="button" class="btn btn-secondary" *ngIf="previewModalUrl && !previewModalExpired" (click)="printPrescriptionFromPreview()">
              🖨️ Imprimer la prescription
            </button>
          </div>
        </div>
      </div>
      <!-- MODALE 4 : AGRANDISSEMENT PHOTO PROFIL -->
      <div class="modal-backdrop" *ngIf="showPhotoZoomModal">
        <div class="modal-dialog preview-dialog">
          <div class="modal-header">
            <h4>Photo de Profil : {{ selectedCustomer?.fullName }}</h4>
            <button type="button" class="close-btn" (click)="closePhotoZoomModal()">×</button>
          </div>
          <div class="modal-body text-center">
            <img [src]="profilePhotoUrl" alt="Photo de profil" class="preview-img">
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" (click)="closePhotoZoomModal()">Fermer</button>
            <button type="button" class="btn btn-primary" (click)="triggerPhotoChange()">Changer la photo</button>
          </div>
        </div>
      </div>

      <!-- MODALE 5 : TÉLÉCHARGEMENT / IMPRESSION FICHE CLIENT PDF -->
      <div class="modal-backdrop" *ngIf="showPdfModal">
        <div class="modal-dialog" style="max-width: 480px;">
          <div class="modal-header">
            <h4>{{ pdfActionMode === 'print' ? 'Imprimer la fiche client' : 'Télécharger la fiche client (PDF)' }}</h4>
            <button type="button" class="close-btn" (click)="closePdfModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="d-flex align-items-center gap-3 mb-3 p-2" style="background: #f4f7f5; border-radius: 6px;">
              <span class="badge badge-type">{{ pdfTargetCustomer?.customerType }}</span>
              <div>
                <strong>{{ pdfTargetCustomer?.fullName }}</strong>
                <div class="text-muted small font-mono">{{ pdfTargetCustomer?.code }}</div>
              </div>
            </div>

            <div class="form-group mb-3">
              <label class="checkbox-label" style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; user-select: none;">
                <input type="checkbox" [(ngModel)]="pdfIncludeHistory" style="margin-top: 3px;" />
                <span>
                  <strong>Inclure les dernières ordonnances et achats</strong>
                  <small class="d-block text-muted" style="font-size: 11px; margin-top: 2px;">
                    Ajoute l'historique récent (sans aucun montant interne confidentiel ni marge).
                  </small>
                </span>
              </label>
            </div>

            <div class="alert alert-info py-2 px-3 small" style="font-size: 11.5px; margin: 0; background: #eef6f2; border: 1px solid #cce3d8; color: #116149; border-radius: 6px;">
              ℹ️ Document A4 officiel avec en-tête de l'officine, photo, état civil, couverture santé, pharmacovigilance et mention de confidentialité.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" (click)="closePdfModal()">Annuler</button>
            <button type="button" class="btn btn-primary" (click)="executePdfAction()" [disabled]="pdfGenerating">
              {{ pdfGenerating ? 'Génération en cours...' : (pdfActionMode === 'print' ? '🖨️ Ouvrir pour impression' : '📥 Télécharger le PDF') }}
            </button>
          </div>
        </div>
      </div>

      <!-- MODALE 6 : APERÇU ET CONFIRMATION NOUVELLE PHOTO DU CLIENT -->
      <div class="modal-backdrop" *ngIf="showPhotoConfirmModal">
        <div class="modal-dialog" style="max-width: 440px;">
          <div class="modal-header">
            <h4>Aperçu de la photo client</h4>
            <button type="button" class="close-btn" (click)="cancelPhotoConfirm()">×</button>
          </div>
          <div class="modal-body text-center">
            <p class="text-muted small mb-2">Vérifiez l'aperçu avant d'enregistrer sur le stockage persistant :</p>
            <div style="margin: 12px auto; width: 140px; height: 160px; border: 2px solid #116149; border-radius: 8px; overflow: hidden; background: #f0fdf4; display: flex; align-items: center; justify-content: center;">
              <img [src]="pendingPhotoPreviewUrl" alt="Aperçu photo" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <div class="text-muted small" *ngIf="pendingPhotoSizeKb">
              Taille optimisée : <strong>{{ pendingPhotoSizeKb }} Ko</strong> (JPG/PNG max 2 Mo)
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" (click)="cancelPhotoConfirm()">Annuler</button>
            <button type="button" class="btn btn-primary" (click)="saveConfirmedPhoto()" [disabled]="submitting">
              {{ submitting ? 'Enregistrement...' : '✅ Valider et enregistrer' }}
            </button>
          </div>
        </div>
      </div>

      <!-- MODALE 7 : PRISE DE PHOTO PAR WEBCAM / CAMÉRA -->
      <div class="modal-backdrop" *ngIf="showCameraModal">
        <div class="modal-dialog" style="max-width: 500px;">
          <div class="modal-header">
            <h4>📷 Prise de photo par webcam</h4>
            <button type="button" class="close-btn" (click)="closeCameraModal()">×</button>
          </div>
          <div class="modal-body text-center p-3">
            <div *ngIf="cameraErrorMessage" class="alert alert-danger mb-3 py-2 px-3 small text-start">
              ⚠️ {{ cameraErrorMessage }}
            </div>
            
            <div style="position: relative; width: 100%; max-width: 440px; height: 320px; margin: 0 auto; background: #0f172a; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
              <video #webcamVideo autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
              
              <!-- Ovale de guidage pour centrer le visage du patient -->
              <div style="position: absolute; width: 170px; height: 220px; border: 2px dashed rgba(255, 255, 255, 0.85); border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.25);"></div>
              
              <div *ngIf="cameraLoading" style="position: absolute; color: #fff; font-size: 13px; font-weight: 500; background: rgba(0,0,0,0.6); padding: 8px 14px; border-radius: 6px;">
                Initialisation de la caméra...
              </div>
            </div>
            
            <p class="text-muted small mt-2 mb-0" style="font-size: 11.5px;">
              Positionnez le visage du client dans le cadre puis cliquez sur « Prendre la photo ».
            </p>
          </div>
          <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
            <button type="button" class="btn btn-outline" (click)="closeCameraModal()">Annuler</button>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-outline" *ngIf="hasMultipleCameras" (click)="switchCamera()" title="Basculer vers une autre caméra">
                🔄 Changer caméra
              </button>
              <button type="button" class="btn btn-primary" (click)="captureWebcamPhoto()" [disabled]="cameraLoading">
                📸 Prendre la photo
              </button>
            </div>
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
    .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; max-height: 600px; }
    .data-table { width: 100%; min-width: 580px; border-collapse: collapse; font-size: 13px; }
    .data-table th, .data-table td { padding: 10px 12px; border-bottom: 1px solid #edf0ee; text-align: left; }
    .data-table th { background: #f8faf9; color: #475569; font-weight: 600; }
    .data-table tbody tr { cursor: pointer; transition: background 0.15s; }
    .data-table tbody tr:hover { background: #f0fdf4; }
    .active-row { background: #ecfdf5 !important; border-left: 3px solid #116149; }
    .customer-card-header { padding: 16px; border-bottom: 1px solid #edf0ee; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .profile-photo-block { display: flex; align-items: center; gap: 8px; }
    .profile-photo, .profile-photo-placeholder { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid #d7e5de; }
    .profile-photo-placeholder { display: flex; align-items: center; justify-content: center; background: #eaf5ef; color: #116149; font-weight: 700; font-size: 18px; }
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
    .badge-valid { background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; }
    .badge-warning { background: #fef9c3; color: #854d0e; padding: 2px 6px; border-radius: 4px; }
    .badge-expired { background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; }
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
    .customer-modal-dialog { max-width: 760px; }
    .form-section { border: 1px solid #d5ded9; border-radius: 8px; padding: 14px; margin-top: 14px; background: #fafbfa; }
    .form-section legend { font-weight: 700; color: #116149; font-size: 13px; padding: 2px 8px; background: #fff; border: 1px solid #cbd5d0; border-radius: 4px; }
    .consent-line { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #475569; margin: 12px 0; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 10px; border-radius: 6px; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #edf0ee; background: #fbfcfb; }
    .modal-header h4 { margin: 0; font-size: 15px; color: #116149; }
    .close-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: #64748b; }

    /* ── En-tête professionnel du formulaire client ── */
    .customer-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 2px solid #d1fae5;
      background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 60%, #ffffff 100%);
    }
    .cmh-left {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
      min-width: 0;
    }
    .cmh-icon-circle {
      width: 44px;
      height: 44px;
      min-width: 44px;
      border-radius: 50%;
      background: #d1fae5;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      border: 2px solid #a7f3d0;
    }
    .cmh-icon-circle.cmh-edit {
      background: #dbeafe;
      border-color: #93c5fd;
    }
    .cmh-text {
      min-width: 0;
    }
    .cmh-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #064e3b;
      line-height: 1.3;
    }
    .cmh-subtitle {
      margin: 3px 0 0;
      font-size: 12px;
      color: #6b7280;
      line-height: 1.4;
    }
    .cmh-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .cmh-badge {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 4px 12px;
      border-radius: 20px;
      background: #d1fae5;
      color: #065f46;
      white-space: nowrap;
    }
    .cmh-badge.cmh-badge-edit {
      background: #dbeafe;
      color: #1e40af;
    }
    .cmh-close {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1px solid #e5e7eb;
      background: #ffffff;
      font-size: 18px;
      cursor: pointer;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      line-height: 1;
    }
    .cmh-close:hover {
      background: #fee2e2;
      color: #b91c1c;
      border-color: #fca5a5;
    }
    @media (max-width: 600px) {
      .customer-modal-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        padding: 14px 16px;
      }
      .cmh-right {
        width: 100%;
        justify-content: space-between;
      }
      .cmh-title { font-size: 14px; }
      .cmh-subtitle { font-size: 11px; }
    }
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
    .btn-xs { padding: 3px 6px; font-size: 11px; border-radius: 4px; }
    .btn-danger-outline { background: #fff; border: 1px solid #fca5a5; color: #dc2626; cursor: pointer; border-radius: 4px; }
    .btn-danger-outline:hover { background: #fef2f2; }
    .photo-actions { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
    .cursor-pointer { cursor: pointer; }
    .info-block { background: #fbfcfb; border: 1px solid #edf0ee; border-radius: 6px; padding: 12px; }
    .info-block h5 { margin: 0 0 8px; color: #116149; font-size: 13px; font-weight: 600; border-bottom: 1px solid #edf0ee; padding-bottom: 4px; }
    .doc-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed #edf0ee; }
    .doc-item:last-child { border-bottom: none; }
    .border-top { border-top: 1px solid #edf0ee; }
    .pt-3 { padding-top: 12px; }
    .align-center { align-items: center; }
    .flex-wrap { flex-wrap: wrap; }
    .gap-2 { gap: 8px; }
    .ml-2 { margin-left: 8px; }
    .purchase-items-row { background: #fbfdfc; }
    .purchase-items-card { padding: 12px; background: #fff; border: 1px solid #d5ded9; border-radius: 6px; margin: 4px 0; }
    .purchase-items-card h6 { margin: 0 0 8px; color: #116149; font-size: 13px; font-weight: 600; }
    .settlement-clean-alert { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; color: #065f46; font-size: 13px; display: flex; align-items: center; gap: 8px; }
    .officine-statement-badge h2 { margin: 0; color: #116149; font-size: 17px; }
    .officine-statement-badge p { margin: 2px 0; font-size: 12px; color: #475569; }
    .officine-statement-badge h3 { margin: 8px 0 2px; color: #0f172a; font-size: 14px; font-weight: 700; }
    .officine-statement-badge small { font-size: 11px; color: #64748b; }
    .no-print { display: inline-block; }
    @media (max-width: 768px) {
      .customers-module { padding: 8px 4px; }
      .module-header { flex-direction: column; align-items: stretch; gap: 10px; }
      .module-header button { width: 100%; }
      .toolbar-form { flex-direction: column; align-items: stretch; }
      .search-input-group, .filter-group, .toolbar-form button { width: 100%; }
      .customer-card-header { flex-direction: column; align-items: stretch; }
      .financial-summary { flex-direction: column; width: 100%; }
      .metric { text-align: left; }
      .info-grid { grid-template-columns: 1fr; }
      .modal-footer { flex-direction: column; }
      .modal-footer button { width: 100%; }
    }
  `],
})
export class CustomersComponent implements OnInit, OnDestroy {
  private readonly api = inject(CustomersApiService);
  private readonly docHeaderService = inject(DocumentHeaderService);
  private readonly cashApi = inject(CashApiService);
  readonly auth = inject(AuthService);

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
  modalErrorMessage = '';
  privacyNotice = '';

  // Modales & Formulaires
  showNewCustomerModal = false;
  isEditingCustomer = false;
  editingCustomerId = '';
  showSettlementForm = false;
  showPrescriptionUpload = false;
  receiptModal: ReceiptTicket | null = null;
  insurers: Array<{ id: string; name: string }> = [];
  activeCashSession: any = null;
  activeExchangeRate = 2800;
  cashSessionWarning = '';
  selectedPrescriptionPreviewUrl = '';

  // Aperçu sécurisé d'ordonnance avec compte à rebours
  previewModalUrl = '';
  previewModalExpired = false;
  previewModalSeconds = 0;
  profilePhotoUrl = '';
  showPhotoZoomModal = false;
  expandedPurchaseId: string | null = null;
  prescriptionFilter = '';
  @ViewChild('profilePhotoInput') profilePhotoInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('cameraPhotoInput') cameraPhotoInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('webcamVideo') webcamVideoRef?: ElementRef<HTMLVideoElement>;
  private previewTimer: any;

  // Prise de photo par webcam
  showCameraModal = false;
  cameraLoading = false;
  cameraErrorMessage = '';
  cameraStream: MediaStream | null = null;
  hasMultipleCameras = false;
  availableVideoDevices: MediaDeviceInfo[] = [];
  currentCameraIndex = 0;

  // Fiche PDF & Impression (CLI-11)
  showPdfModal = false;
  pdfActionMode: 'download' | 'print' = 'download';
  pdfTargetCustomer?: Customer;
  pdfIncludeHistory = false;
  pdfGenerating = false;

  // Aperçu & Confirmation photo avec compression
  showPhotoConfirmModal = false;
  pendingPhotoBlob: Blob | null = null;
  pendingPhotoPreviewUrl = '';
  pendingPhotoSizeKb = 0;

  // Modèles de données formulaires
  newCustomerForm = {
    fullName: '',
    nom: '',
    postnom: '',
    prenom: '',
    sexe: 'M' as 'M' | 'F',
    dateNaissance: '',
    nationalite: 'Congolaise (RDC)',
    customerType: 'PARTICULIER' as 'PARTICULIER' | 'ENTREPRISE' | 'ASSURANCE',
    creditLimitCdf: 0,
    phone: '',
    telephoneSecondaire: '',
    email: '',
    companyName: '',
    address: '',
    medicalNotes: '',
    medicalDetails: {
      bloodGroup: '',
      allergies: '',
      chronicDiseases: '',
      physiologicalState: 'AUCUN',
    },
    consentementDonnees: true,
    addressDetails: {
      ville: 'Kinshasa',
      commune: '',
      quartier: '',
      avenueRue: '',
      numeroParcelle: '',
      pointDeRepere: '',
    },
    identityDocuments: [{ documentType: 'CARTE_IDENTITE', documentNumber: '', expirationDate: '' }],
    contacts: [{ name: '', relationship: '', phone: '' }],
    insurance: {
      insurerName: '',
      insuredCardNumber: '',
      policyNumber: '',
      coverageRate: 80,
      ceiling: 0,
      endDate: '',
      insuredStatus: 'ASSURE_PRINCIPAL',
      principalInsuredName: '',
      relationshipToPrincipal: '',
    },
    enterprise: {
      legalName: '',
      rccm: '',
      nationalId: '',
      taxId: '',
      representativeName: '',
      representativeFunction: 'Gérant',
      representativePhone: '',
      representativeDocumentNumber: '',
    },
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
    this.loadInsurers();
  }

  ngOnDestroy() {
    this.closeCameraModal();
  }

  loadInsurers() {
    this.api.getInsurers().subscribe({
      next: (list) => (this.insurers = list || []),
      error: () => {},
    });
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
    if (this.profilePhotoUrl.startsWith('blob:')) URL.revokeObjectURL(this.profilePhotoUrl);
    this.profilePhotoUrl = '';
    this.selectedCustomer = customer;
    this.showSettlementForm = false;
    this.showPrescriptionUpload = false;
    this.loadStatement(customer.id);
    this.loadPrescriptions();
    if (customer.hasProfilePhoto) this.loadProfilePhoto(customer.id);
  }

  getInitials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }

  loadProfilePhoto(customerId: string) {
    this.api.getProfilePhoto(customerId).subscribe({
      next: (res) => {
        if (res.storageMode === 'local') {
          this.api.getProfilePhotoImage(customerId).subscribe({
            next: (image) => (this.profilePhotoUrl = URL.createObjectURL(image)),
            error: () => (this.profilePhotoUrl = ''),
          });
        } else if (res.signedUrl) {
          this.profilePhotoUrl = res.signedUrl;
        }
      },
      error: () => {
        // En cas d'erreur ou d'absence de signedUrl, fallback direct sur le blob
        this.api.getProfilePhotoImage(customerId).subscribe({
          next: (image) => (this.profilePhotoUrl = URL.createObjectURL(image)),
          error: () => (this.profilePhotoUrl = ''),
        });
      },
    });
  }

  compressImage(file: File, maxDim = 1200, quality = 0.85): Promise<{ blob: Blob; sizeKb: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas non disponible'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Échec de la compression'));
              return;
            }
            resolve({ blob, sizeKb: Math.round(blob.size / 1024) });
          },
          'image/jpeg',
          quality,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Impossible de lire l’image'));
      };
      img.src = url;
    });
  }

  async onProfilePhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedCustomer) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.errorMessage = 'La photo doit être au format JPEG ou PNG (max 2 Mo).';
      input.value = '';
      return;
    }

    try {
      // Compression côté client pour conformité stricte max 2 Mo et affichage fluide
      const { blob, sizeKb } = await this.compressImage(file, 1200, 0.85);
      if (blob.size > 2 * 1024 * 1024) {
        this.errorMessage = 'La photo dépasse la taille maximale autorisée de 2 Mo même après compression.';
        input.value = '';
        return;
      }

      this.pendingPhotoBlob = blob;
      this.pendingPhotoSizeKb = sizeKb;
      if (this.pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(this.pendingPhotoPreviewUrl);
      }
      this.pendingPhotoPreviewUrl = URL.createObjectURL(blob);
      this.showPhotoConfirmModal = true;
    } catch {
      this.errorMessage = 'Erreur lors du traitement de la photo sélectionnée.';
    } finally {
      input.value = '';
    }
  }

  saveConfirmedPhoto() {
    if (!this.selectedCustomer || !this.pendingPhotoBlob) return;
    this.submitting = true;
    const file = new File([this.pendingPhotoBlob], 'profile-photo.jpg', { type: 'image/jpeg' });
    this.api.uploadProfilePhoto(this.selectedCustomer.id, file).subscribe({
      next: () => {
        this.submitting = false;
        this.showPhotoConfirmModal = false;
        this.selectedCustomer!.hasProfilePhoto = true;
        this.loadProfilePhoto(this.selectedCustomer!.id);
      },
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'La photo n’a pas pu être enregistrée.';
      },
    });
  }

  cancelPhotoConfirm() {
    this.showPhotoConfirmModal = false;
    if (this.pendingPhotoPreviewUrl) {
      URL.revokeObjectURL(this.pendingPhotoPreviewUrl);
      this.pendingPhotoPreviewUrl = '';
    }
    this.pendingPhotoBlob = null;
    this.pendingPhotoSizeKb = 0;
  }

  async openCameraModal() {
    this.cameraErrorMessage = '';
    this.showCameraModal = true;
    this.cameraLoading = true;

    if (!navigator?.mediaDevices?.getUserMedia) {
      this.closeCameraModal();
      this.cameraPhotoInputRef?.nativeElement.click();
      return;
    }

    try {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.availableVideoDevices = devices.filter((d) => d.kind === 'videoinput');
        this.hasMultipleCameras = this.availableVideoDevices.length > 1;
      } catch {}

      await this.startCameraStream();
    } catch (err: any) {
      this.cameraLoading = false;
      this.cameraErrorMessage = 'Impossible d’accéder à la caméra. Vérifiez les autorisations de votre navigateur.';
    }
  }

  async startCameraStream(deviceId?: string) {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
    }

    this.cameraLoading = true;
    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    };

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.cameraLoading = false;
      setTimeout(() => {
        if (this.webcamVideoRef?.nativeElement && this.cameraStream) {
          this.webcamVideoRef.nativeElement.srcObject = this.cameraStream;
          this.webcamVideoRef.nativeElement.play().catch(() => {});
        }
      }, 100);
    } catch {
      this.cameraLoading = false;
      this.cameraErrorMessage = 'Erreur lors du démarrage du flux vidéo. Vérifiez que la caméra n’est pas utilisée par une autre application.';
    }
  }

  async switchCamera() {
    if (!this.availableVideoDevices.length) return;
    this.currentCameraIndex = (this.currentCameraIndex + 1) % this.availableVideoDevices.length;
    const nextDevice = this.availableVideoDevices[this.currentCameraIndex];
    await this.startCameraStream(nextDevice.deviceId);
  }

  closeCameraModal() {
    this.showCameraModal = false;
    this.cameraLoading = false;
    this.cameraErrorMessage = '';
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => track.stop());
      this.cameraStream = null;
    }
  }

  async captureWebcamPhoto() {
    const video = this.webcamVideoRef?.nativeElement;
    if (!video || !this.cameraStream) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      this.closeCameraModal();

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            this.errorMessage = 'Échec de la capture photo.';
            return;
          }
          this.pendingPhotoBlob = blob;
          this.pendingPhotoSizeKb = Math.round(blob.size / 1024);
          if (this.pendingPhotoPreviewUrl) {
            URL.revokeObjectURL(this.pendingPhotoPreviewUrl);
          }
          this.pendingPhotoPreviewUrl = URL.createObjectURL(blob);
          this.showPhotoConfirmModal = true;
        },
        'image/jpeg',
        0.88,
      );
    } catch {
      this.closeCameraModal();
      this.errorMessage = 'Erreur lors de la capture de l’image.';
    }
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

  onNameChange() {
    const parts = [this.newCustomerForm.prenom, this.newCustomerForm.nom, this.newCustomerForm.postnom]
      .map((s) => s?.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      this.newCustomerForm.fullName = parts.join(' ');
    }
  }

  openNewCustomerModal() {
    this.modalErrorMessage = '';
    this.isEditingCustomer = false;
    this.editingCustomerId = '';
    this.newCustomerForm = {
      fullName: '',
      nom: '',
      postnom: '',
      prenom: '',
      sexe: 'M',
      dateNaissance: '',
      nationalite: 'Congolaise (RDC)',
      customerType: 'PARTICULIER',
      creditLimitCdf: 0,
      phone: '',
      telephoneSecondaire: '',
      email: '',
      companyName: '',
      address: '',
      medicalNotes: '',
      medicalDetails: {
        bloodGroup: '',
        allergies: '',
        chronicDiseases: '',
        physiologicalState: 'AUCUN',
      },
      consentementDonnees: true,
      addressDetails: {
        ville: 'Kinshasa',
        commune: '',
        quartier: '',
        avenueRue: '',
        numeroParcelle: '',
        pointDeRepere: '',
      },
      identityDocuments: [{ documentType: 'CARTE_IDENTITE', documentNumber: '', expirationDate: '' }],
      contacts: [{ name: '', relationship: '', phone: '' }],
      insurance: {
        insurerName: '',
        insuredCardNumber: '',
        policyNumber: '',
        coverageRate: 80,
        ceiling: 0,
        endDate: '',
        insuredStatus: 'ASSURE_PRINCIPAL',
        principalInsuredName: '',
        relationshipToPrincipal: '',
      },
      enterprise: {
        legalName: '',
        rccm: '',
        nationalId: '',
        taxId: '',
        representativeName: '',
        representativeFunction: 'Gérant',
        representativePhone: '',
        representativeDocumentNumber: '',
      },
    };
    this.showNewCustomerModal = true;
  }

  openEditCustomerModal(customer: Customer) {
    this.modalErrorMessage = '';
    this.isEditingCustomer = true;
    this.editingCustomerId = customer.id;

    // Décomposer medicalNotes si des mentions y sont stockées
    const notes = customer.medicalNotes || '';
    let bloodGroup = '';
    const bloodMatch = notes.match(/Groupe sanguin:\s*([A-Z+-]+)/i);
    if (bloodMatch) bloodGroup = bloodMatch[1];

    let allergies = '';
    const allergiesMatch = notes.match(/Allergies:\s*([^|]+)/i);
    if (allergiesMatch) allergies = allergiesMatch[1].trim();

    let chronic = '';
    const chronicMatch = notes.match(/Pathologies chroniques:\s*([^|]+)/i);
    if (chronicMatch) chronic = chronicMatch[1].trim();

    let state = 'AUCUN';
    const stateMatch = notes.match(/État physiologique:\s*([^|]+)/i);
    if (stateMatch) state = stateMatch[1].trim();

    const addr = customer.address as any;
    const doc = customer.identityDocuments?.[0];
    const ct = customer.contacts?.[0];
    const ins = customer.insurance as any;
    const ent = customer.enterprise as any;

    this.newCustomerForm = {
      fullName: customer.fullName,
      nom: customer.nom || '',
      postnom: customer.postnom || '',
      prenom: customer.prenom || '',
      sexe: (customer.sexe as 'M' | 'F') || 'M',
      dateNaissance: customer.dateNaissance ? customer.dateNaissance.slice(0, 10) : '',
      nationalite: customer.nationalite || 'Congolaise (RDC)',
      customerType: customer.customerType,
      creditLimitCdf: customer.creditLimitCdf,
      phone: customer.phone || '',
      telephoneSecondaire: (customer as any).telephoneSecondaire || '',
      email: customer.email || '',
      companyName: customer.companyName || (ent?.legalName || ''),
      address: (typeof customer.address === 'string' ? customer.address : '') || '',
      medicalNotes: customer.medicalNotes || '',
      medicalDetails: {
        bloodGroup: bloodGroup || '',
        allergies: allergies || '',
        chronicDiseases: chronic || '',
        physiologicalState: state || 'AUCUN',
      },
      consentementDonnees: true,
      addressDetails: {
        ville: addr?.ville || 'Kinshasa',
        commune: addr?.commune || '',
        quartier: addr?.quartier || '',
        avenueRue: addr?.avenue_rue || addr?.avenueRue || '',
        numeroParcelle: addr?.numero_parcelle || addr?.numeroParcelle || '',
        pointDeRepere: addr?.point_de_repere || addr?.pointDeRepere || '',
      },
      identityDocuments: [{
        documentType: doc?.type || 'CARTE_IDENTITE',
        documentNumber: doc?.fullNumber || doc?.number || '',
        expirationDate: doc?.expirationDate ? doc.expirationDate.slice(0, 10) : '',
      }],
      contacts: [{
        name: ct?.name || '',
        relationship: ct?.relationship || '',
        phone: ct?.phone || '',
      }],
      insurance: {
        insurerName: ins?.insurerName || '',
        insuredCardNumber: ins?.insuredCardNumber || '',
        policyNumber: ins?.policyNumber || '',
        coverageRate: ins?.coverageRate || 80,
        ceiling: ins?.ceiling || 0,
        endDate: ins?.endDate ? new Date(ins.endDate).toISOString().slice(0, 10) : '',
        insuredStatus: ins?.insuredStatus || 'ASSURE_PRINCIPAL',
        principalInsuredName: ins?.principalInsuredName || '',
        relationshipToPrincipal: ins?.relationshipToPrincipal || '',
      },
      enterprise: {
        legalName: ent?.legalName || customer.companyName || '',
        rccm: ent?.rccm || '',
        nationalId: ent?.nationalId || '',
        taxId: ent?.taxId || '',
        representativeName: ent?.representativeName || '',
        representativeFunction: ent?.representativeFunction || 'Gérant',
        representativePhone: ent?.representativePhone || customer.phone || '',
        representativeDocumentNumber: ent?.representativeDocumentNumber || '',
      },
    };
    this.showNewCustomerModal = true;
  }

  saveCustomer() {
    this.modalErrorMessage = '';
    this.errorMessage = '';

    // Auto-calcul de fullName si nom/prénom renseignés
    if (!this.newCustomerForm.fullName?.trim()) {
      this.onNameChange();
    }
    if (!this.newCustomerForm.fullName?.trim() && this.newCustomerForm.nom?.trim()) {
      this.newCustomerForm.fullName = this.newCustomerForm.nom.trim();
    }

    if (!this.newCustomerForm.fullName?.trim()) {
      this.modalErrorMessage = 'Le nom complet du client est obligatoire.';
      return;
    }

    if (!this.newCustomerForm.phone?.trim()) {
      this.modalErrorMessage = 'Le numéro de téléphone principal est obligatoire pour ouvrir ou modifier un dossier.';
      return;
    }

    if (!this.newCustomerForm.consentementDonnees && !this.isEditingCustomer) {
      this.modalErrorMessage = 'Le consentement du patient à la collecte de ses données est obligatoire (CLI-10).';
      return;
    }

    // Validation préalable côté frontend pour les types spécifiques
    if (this.newCustomerForm.customerType === 'ENTREPRISE') {
      const legalName = this.newCustomerForm.enterprise?.legalName?.trim() || this.newCustomerForm.companyName?.trim() || this.newCustomerForm.fullName?.trim();
      if (!legalName) {
        this.modalErrorMessage = 'La raison sociale de l’entreprise est obligatoire.';
        return;
      }
      if (!this.newCustomerForm.enterprise?.representativeName?.trim()) {
        this.modalErrorMessage = 'Le nom du représentant légal de l’entreprise est obligatoire.';
        return;
      }
      if (!this.newCustomerForm.enterprise?.representativeDocumentNumber?.trim()) {
        this.modalErrorMessage = 'Le numéro de pièce d’identité du représentant est obligatoire.';
        return;
      }
    }

    if (this.newCustomerForm.customerType === 'ASSURANCE') {
      if (!this.newCustomerForm.insurance?.insurerName?.trim()) {
        this.modalErrorMessage = 'L’organisme assureur est obligatoire pour un compte assurance.';
        return;
      }
      if (!this.newCustomerForm.insurance?.insuredCardNumber?.trim()) {
        this.modalErrorMessage = 'Le numéro d’assuré / carte santé est obligatoire.';
        return;
      }
      if (!this.newCustomerForm.insurance?.endDate) {
        this.modalErrorMessage = 'La date de fin de validité de l’assurance est obligatoire.';
        return;
      }
      if (!this.newCustomerForm.identityDocuments?.[0]?.documentNumber?.trim()) {
        this.modalErrorMessage = 'Le numéro de la pièce d’identité est obligatoire pour un compte assurance.';
        return;
      }
      if (!this.newCustomerForm.addressDetails?.ville?.trim() || !this.newCustomerForm.addressDetails?.commune?.trim() || !this.newCustomerForm.addressDetails?.quartier?.trim()) {
        this.modalErrorMessage = 'L’adresse complète (Ville, Commune et Quartier) est obligatoire pour un compte assurance.';
        return;
      }
      if (!this.newCustomerForm.contacts?.[0]?.name?.trim() || !this.newCustomerForm.contacts?.[0]?.phone?.trim()) {
        this.modalErrorMessage = 'Une personne de contact d’urgence (nom et téléphone) est obligatoire pour un compte assurance.';
        return;
      }
    }

    // Consolidation du dossier médical pour l'officine
    const medParts: string[] = [];
    if (this.newCustomerForm.medicalDetails.bloodGroup) {
      medParts.push(`Groupe sanguin: ${this.newCustomerForm.medicalDetails.bloodGroup}`);
    }
    if (this.newCustomerForm.medicalDetails.allergies?.trim()) {
      medParts.push(`Allergies: ${this.newCustomerForm.medicalDetails.allergies.trim()}`);
    }
    if (this.newCustomerForm.medicalDetails.chronicDiseases?.trim()) {
      medParts.push(`Pathologies chroniques: ${this.newCustomerForm.medicalDetails.chronicDiseases.trim()}`);
    }
    if (this.newCustomerForm.medicalDetails.physiologicalState && this.newCustomerForm.medicalDetails.physiologicalState !== 'AUCUN') {
      medParts.push(`État physiologique: ${this.newCustomerForm.medicalDetails.physiologicalState}`);
    }
    if (this.newCustomerForm.medicalNotes?.trim()) {
      medParts.push(this.newCustomerForm.medicalNotes.trim());
    }
    const consolidatedMedicalNotes = medParts.length ? medParts.join(' | ') : undefined;

    const hasStructuredAddress = Boolean(
      this.newCustomerForm.addressDetails?.commune?.trim() ||
      this.newCustomerForm.addressDetails?.quartier?.trim() ||
      this.newCustomerForm.addressDetails?.avenueRue?.trim()
    );

    const fullTextAddress = this.newCustomerForm.address?.trim() || (hasStructuredAddress ? [
      this.newCustomerForm.addressDetails.avenueRue?.trim(),
      this.newCustomerForm.addressDetails.numeroParcelle ? ('N° ' + this.newCustomerForm.addressDetails.numeroParcelle.trim()) : '',
      this.newCustomerForm.addressDetails.quartier?.trim(),
      this.newCustomerForm.addressDetails.commune?.trim(),
      this.newCustomerForm.addressDetails.ville?.trim() || 'Kinshasa'
    ].filter(Boolean).join(', ') : undefined);

    const payload: any = {
      fullName: this.newCustomerForm.fullName.trim(),
      nom: this.newCustomerForm.nom?.trim() || undefined,
      postnom: this.newCustomerForm.postnom?.trim() || undefined,
      prenom: this.newCustomerForm.prenom?.trim() || undefined,
      sexe: this.newCustomerForm.sexe || undefined,
      dateNaissance: this.newCustomerForm.dateNaissance ? this.newCustomerForm.dateNaissance.slice(0, 10) : undefined,
      nationalite: this.newCustomerForm.nationalite?.trim() || undefined,
      customerType: this.newCustomerForm.customerType,
      creditLimitCdf: Number(this.newCustomerForm.creditLimitCdf || 0),
      phone: this.newCustomerForm.phone.trim(),
      telephonePrincipal: this.newCustomerForm.phone.trim(),
      telephoneSecondaire: this.newCustomerForm.telephoneSecondaire?.trim() || undefined,
      email: this.newCustomerForm.email?.trim() || undefined,
      address: fullTextAddress,
      companyName: this.newCustomerForm.customerType === 'ENTREPRISE' ? (this.newCustomerForm.enterprise.legalName || this.newCustomerForm.companyName) : (this.newCustomerForm.companyName || undefined),
      medicalNotes: consolidatedMedicalNotes,
      consentementDonnees: this.newCustomerForm.consentementDonnees ?? true,
      addressDetails: hasStructuredAddress ? {
        ville: this.newCustomerForm.addressDetails.ville?.trim() || 'Kinshasa',
        commune: this.newCustomerForm.addressDetails.commune?.trim() || undefined,
        quartier: this.newCustomerForm.addressDetails.quartier?.trim() || undefined,
        avenueRue: this.newCustomerForm.addressDetails.avenueRue?.trim() || undefined,
        numeroParcelle: this.newCustomerForm.addressDetails.numeroParcelle?.trim() || undefined,
        pointDeRepere: this.newCustomerForm.addressDetails.pointDeRepere?.trim() || undefined,
      } : undefined,
      identityDocuments: this.newCustomerForm.identityDocuments?.[0]?.documentNumber?.trim() ? [{
        documentType: this.newCustomerForm.identityDocuments[0].documentType || 'CARTE_IDENTITE',
        documentNumber: this.newCustomerForm.identityDocuments[0].documentNumber.trim(),
        expirationDate: this.newCustomerForm.identityDocuments[0].expirationDate ? this.newCustomerForm.identityDocuments[0].expirationDate.slice(0, 10) : undefined,
        isPrimary: true,
      }] : undefined,
      contacts: (this.newCustomerForm.contacts?.[0]?.name?.trim() && this.newCustomerForm.contacts?.[0]?.phone?.trim()) ? [{
        name: this.newCustomerForm.contacts[0].name.trim(),
        relationship: this.newCustomerForm.contacts[0].relationship?.trim() || undefined,
        phone: this.newCustomerForm.contacts[0].phone.trim(),
      }] : undefined,
    };

    if (this.newCustomerForm.customerType === 'ENTREPRISE') {
      payload.enterprise = {
        legalName: this.newCustomerForm.enterprise.legalName?.trim() || this.newCustomerForm.fullName.trim(),
        rccm: this.newCustomerForm.enterprise.rccm?.trim() || undefined,
        nationalId: this.newCustomerForm.enterprise.nationalId?.trim() || undefined,
        taxId: this.newCustomerForm.enterprise.taxId?.trim() || undefined,
        representativeName: this.newCustomerForm.enterprise.representativeName?.trim() || this.newCustomerForm.fullName.trim(),
        representativeFunction: this.newCustomerForm.enterprise.representativeFunction?.trim() || 'Gérant',
        representativePhone: this.newCustomerForm.enterprise.representativePhone?.trim() || this.newCustomerForm.phone.trim(),
        representativeDocumentNumber: this.newCustomerForm.enterprise.representativeDocumentNumber?.trim() || 'DOC-OFFICIEL',
      };
      if (!payload.address) {
        payload.address = 'Kinshasa, RDC';
      }
    } else if (this.newCustomerForm.customerType === 'ASSURANCE') {
      payload.insurance = {
        insurerName: this.newCustomerForm.insurance.insurerName.trim(),
        insuredCardNumber: this.newCustomerForm.insurance.insuredCardNumber.trim(),
        policyNumber: this.newCustomerForm.insurance.policyNumber?.trim() || undefined,
        coverageRate: Number(this.newCustomerForm.insurance.coverageRate || 80),
        ceiling: Number(this.newCustomerForm.insurance.ceiling || 0),
        endDate: this.newCustomerForm.insurance.endDate ? this.newCustomerForm.insurance.endDate.slice(0, 10) : undefined,
        insuredStatus: this.newCustomerForm.insurance.insuredStatus || 'ASSURE_PRINCIPAL',
        principalInsuredName: this.newCustomerForm.insurance.principalInsuredName?.trim() || undefined,
        relationshipToPrincipal: this.newCustomerForm.insurance.relationshipToPrincipal?.trim() || undefined,
      };
    }

    this.submitting = true;

    if (this.isEditingCustomer) {
      this.api.updateCustomer(this.editingCustomerId, payload).subscribe({
        next: (updated) => {
          this.submitting = false;
          this.showNewCustomerModal = false;
          this.isEditingCustomer = false;
          this.loadCustomers();
          this.selectCustomer(updated);
        },
        error: (err) => {
          this.submitting = false;
          const msg = err.error?.message || (typeof err.error === 'string' ? err.error : 'Échec de modification du client.');
          this.modalErrorMessage = msg;
          this.errorMessage = msg;
        },
      });
    } else {
      this.api.createCustomer(payload).subscribe({
        next: (created) => {
          this.submitting = false;
          this.showNewCustomerModal = false;
          this.loadCustomers();
          this.selectCustomer(created);
        },
        error: (err) => {
          this.submitting = false;
          const msg = err.error?.message || (typeof err.error === 'string' ? err.error : 'Échec de création du client.');
          this.modalErrorMessage = msg;
          this.errorMessage = msg;
        },
      });
    }
  }

  getPrescriptionStatus(dateStr: string): { label: string; class: string } {
    if (!dateStr) return { label: 'Inconnue', class: 'badge-info' };
    const date = new Date(dateStr);
    const diffMonths = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.5);
    if (diffMonths <= 3) {
      return { label: 'Valide (< 3m)', class: 'badge-valid' };
    } else if (diffMonths <= 6) {
      return { label: 'Tolérée (3-6m)', class: 'badge-warning' };
    } else {
      return { label: 'Expirée (> 6m)', class: 'badge-expired' };
    }
  }

  createCustomer() {
    this.saveCustomer();
  }

  openSettlementForm() {
    this.showSettlementForm = true;
    this.settlementModel.amount = this.statement?.currentBalanceCdf ?? 0;
    this.settlementModel.currency = 'CDF';
    this.settlementModel.paymentMethod = 'ESPECES';
    this.cashSessionWarning = '';

    // Vérifier la session de caisse active
    this.cashApi.getActiveSession().subscribe({
      next: (session) => {
        this.activeCashSession = session;
        if (session) {
          this.settlementModel.cashSessionId = session.id;
          this.cashSessionWarning = '';
        } else {
          this.settlementModel.cashSessionId = '';
          this.cashSessionWarning = '⚠️ Aucune session de caisse n’est ouverte pour votre compte. Veuillez ouvrir votre caisse dans le module Caisse avant de pouvoir enregistrer un encaissement.';
        }
      },
      error: () => {
        this.activeCashSession = null;
        this.settlementModel.cashSessionId = '';
        this.cashSessionWarning = '⚠️ Impossible de vérifier la session de caisse active.';
      },
    });

    // Récupérer le taux de change officiel
    this.cashApi.getActiveRate().subscribe({
      next: (rate) => {
        this.activeExchangeRate = Number(rate?.rate) || 2800;
        this.calculateImputationPreview();
      },
      error: () => {
        this.activeExchangeRate = 2800;
        this.calculateImputationPreview();
      },
    });

    this.calculateImputationPreview();
  }

  onCurrencyChange() {
    if (this.settlementModel.currency === 'USD') {
      const balance = this.statement?.currentBalanceCdf ?? 0;
      this.settlementModel.amount = Math.ceil((balance / this.activeExchangeRate) * 100) / 100;
    } else {
      this.settlementModel.amount = this.statement?.currentBalanceCdf ?? 0;
    }
    this.calculateImputationPreview();
  }

  getEffectiveSettlementAmountCdf(): number {
    if (!this.settlementModel.amount || this.settlementModel.amount <= 0) return 0;
    return this.settlementModel.currency === 'USD'
      ? Math.round(this.settlementModel.amount * this.activeExchangeRate)
      : this.settlementModel.amount;
  }

  isSettlementAmountExceeded(): boolean {
    const balance = this.statement?.currentBalanceCdf ?? 0;
    return this.getEffectiveSettlementAmountCdf() > balance;
  }

  setFullSettlementAmount() {
    const balance = this.statement?.currentBalanceCdf ?? 0;
    if (this.settlementModel.currency === 'USD') {
      this.settlementModel.amount = Math.ceil((balance / this.activeExchangeRate) * 100) / 100;
    } else {
      this.settlementModel.amount = balance;
    }
    this.calculateImputationPreview();
  }

  calculateImputationPreview() {
    this.imputationPreview = [];
    const effectiveAmountCdf = this.getEffectiveSettlementAmountCdf();
    if (!this.statement?.purchases || effectiveAmountCdf <= 0) return;

    let remainingToAllocate = effectiveAmountCdf;
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
    if (!this.activeCashSession) {
      this.errorMessage = 'Une session de caisse ouverte est obligatoire pour enregistrer un encaissement.';
      return;
    }
    if (this.isSettlementAmountExceeded()) {
      this.errorMessage = 'Le montant du règlement ne peut pas dépasser le solde dû du client.';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const idempotencyKey = crypto.randomUUID();
    this.api
      .settleDebt(this.selectedCustomer.id, {
        amountPaidCdf: this.settlementModel.amount,
        paymentMethod: this.settlementModel.paymentMethod,
        currency: this.settlementModel.currency,
        idempotencyKey,
        cashSessionId: this.settlementModel.cashSessionId || this.activeCashSession.id,
        notes: `Règlement créance client ${this.selectedCustomer.code}`,
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
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.errorMessage = 'Format d’image invalide : seules les images JPEG, PNG et WebP sont acceptées.';
      input.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      this.errorMessage = 'L’image de l’ordonnance ne doit pas dépasser 8 Mo.';
      input.value = '';
      return;
    }
    this.selectedFile = file;
    if (this.selectedPrescriptionPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.selectedPrescriptionPreviewUrl);
    }
    this.selectedPrescriptionPreviewUrl = URL.createObjectURL(file);
  }

  clearSelectedPrescriptionFile(input?: HTMLInputElement) {
    if (this.selectedPrescriptionPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.selectedPrescriptionPreviewUrl);
    }
    this.selectedPrescriptionPreviewUrl = '';
    this.selectedFile = undefined;
    if (input) input.value = '';
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
          this.clearSelectedPrescriptionFile();
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
        this.errorMessage = err.error?.message || 'Accès à l’image refusé ou non autorisé.';
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

  togglePurchaseDetails(purchaseId: string) {
    this.expandedPurchaseId = this.expandedPurchaseId === purchaseId ? null : purchaseId;
  }

  getCalculatedAge(dateStr?: string): string {
    if (!dateStr) return '';
    const birthDate = new Date(dateStr);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? `${age} an${age > 1 ? 's' : ''}` : '';
  }

  filteredPrescriptions() {
    if (!this.prescriptionFilter.trim()) return this.prescriptions;
    const q = this.prescriptionFilter.trim().toLowerCase();
    return this.prescriptions.filter(
      (p) =>
        p.prescriberName.toLowerCase().includes(q) ||
        (p.healthCenter && p.healthCenter.toLowerCase().includes(q)) ||
        (p.prescriptionText && p.prescriptionText.toLowerCase().includes(q))
    );
  }

  printSingleReceipt(pay: any) {
    this.receiptModal = {
      id: pay.id,
      receiptReference: pay.receiptReference || 'RCL-AUTO',
      amountPaidCdf: pay.amountPaidCdf,
      currency: pay.currency,
      paymentMethod: pay.method,
      createdAt: pay.createdAt,
      customerName: this.selectedCustomer?.fullName,
      customerCode: this.selectedCustomer?.code,
      remainingBalanceCdf: this.statement?.currentBalanceCdf,
      allocations: (pay.allocations || []).map((a: any) => ({
        saleId: a.saleId,
        invoiceNumber: a.invoiceNumber || 'Facture',
        amountCdf: a.amountCdf,
      })),
    };
  }

  private escapeHtml(str: any): string {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private printHtmlDocument(htmlContent: string, title = 'Impression') {
    let iframe = document.getElementById('vhp-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'vhp-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      const printWin = window.open('', '_blank', 'width=850,height=950');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(htmlContent);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          printWin.print();
          printWin.close();
        }, 400);
      }
      return;
    }

    doc.open();
    doc.write(htmlContent);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Erreur lors du déclenchement de l\'impression iframe :', e);
      }
    }, 300);
  }

  printPrescriptionFromPreview() {
    if (!this.previewModalUrl) return;
    const patientName = this.escapeHtml(this.selectedCustomer?.fullName || 'Patient');
    const patientCode = this.escapeHtml(this.selectedCustomer?.code || '');
    const dateStr = new Date().toLocaleDateString('fr-FR');

    const headerHtml = this.docHeaderService.renderHtmlHeader({
      format: 'a4',
      documentTitle: 'Dossier Ordonnance Médicale Sécurisée',
      documentSubtitle: `Patient : ${patientName} (${patientCode}) | Délivré le ${dateStr}`,
    });
    const footerHtml = this.docHeaderService.renderHtmlFooter({
      format: 'a4',
      customFooter: 'Document confidentiel soumis au secret professionnel pharmaceutique. Extrait certifié conforme.',
    });

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Ordonnance - ${patientName}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #111;
              margin: 0;
              padding: 0;
            }
            .img-container { margin: 15px auto; text-align: center; max-height: 75vh; }
            img { max-width: 100%; max-height: 70vh; object-fit: contain; border: 1px solid #d1d5db; border-radius: 4px; }
          </style>
        </head>
        <body>
          ${headerHtml}
          <div class="img-container">
            <img src="${this.previewModalUrl}" alt="Ordonnance médicale scannée" />
          </div>
          ${footerHtml}
        </body>
      </html>
    `;
    this.printHtmlDocument(html, `Ordonnance-${patientCode}`);
  }

  getStatementOperations(): Array<{ date: string; label: string; reference: string; debit?: number; credit?: number; balanceAfter: number }> {
    if (!this.statement) return [];
    const ops: Array<{ date: string; label: string; reference: string; debit?: number; credit?: number; balanceAfter: number }> = [];

    this.statement.purchases?.forEach((p) => {
      if (p.creditCdf > 0) {
        ops.push({
          date: p.date,
          label: 'Achat à crédit',
          reference: p.invoiceNumber,
          debit: p.creditCdf,
          balanceAfter: 0,
        });
      }
    });

    this.statement.payments?.forEach((pay) => {
      ops.push({
        date: pay.createdAt,
        label: `Règlement (${pay.method})`,
        reference: pay.receiptReference || 'RCL',
        credit: pay.amountPaidCdf,
        balanceAfter: 0,
      });
    });

    ops.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    ops.forEach((op) => {
      if (op.debit) running += op.debit;
      if (op.credit) running -= op.credit;
      op.balanceAfter = running;
    });

    return ops;
  }

  printStatement() {
    if (!this.selectedCustomer || !this.statement) return;
    const c = this.selectedCustomer;
    const s = this.statement;
    const generatedDate = new Date(s.generatedAt || new Date()).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const operations = this.getStatementOperations();
    const rowsHtml = operations.map(op => {
      const dateStr = new Date(op.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${this.escapeHtml(op.label)}</td>
          <td style="font-family: monospace;">${this.escapeHtml(op.reference)}</td>
          <td style="text-align: right; color: #b91c1c;">${op.debit ? Number(op.debit).toLocaleString('fr-FR') + ' CDF' : '-'}</td>
          <td style="text-align: right; color: #15803d; font-weight: 600;">${op.credit ? Number(op.credit).toLocaleString('fr-FR') + ' CDF' : '-'}</td>
          <td style="text-align: right; font-weight: bold; ${op.balanceAfter > 0 ? 'color: #b91c1c;' : 'color: #15803d;'}">${Number(op.balanceAfter).toLocaleString('fr-FR')} CDF</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" style="text-align: center; color: #666; padding: 12px;">Aucune opération enregistrée sur la période.</td></tr>';

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Relevé de Compte - ${this.escapeHtml(c.fullName)}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              font-size: 11pt;
              line-height: 1.4;
              color: #1f2937;
              margin: 0;
            }
            .header-table { width: 100%; border-bottom: 2px solid #116149; padding-bottom: 12px; margin-bottom: 16px; }
            .header-table td { vertical-align: top; }
            .officine-title { font-size: 16pt; font-weight: bold; color: #116149; margin: 0; letter-spacing: 0.5px; }
            .officine-subtitle { font-size: 9pt; color: #4b5563; margin: 2px 0 0; }
            .doc-title { font-size: 13pt; font-weight: bold; color: #111827; text-align: right; margin: 0; text-transform: uppercase; }
            .doc-meta { font-size: 9pt; color: #6b7280; text-align: right; margin: 4px 0 0; }
            .client-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 10pt; }
            .client-grid { display: table; width: 100%; }
            .client-row { display: table-row; }
            .client-cell { display: table-cell; padding: 3px 6px; }
            .summary-table { width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 16px; }
            .summary-card { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px; text-align: center; }
            .summary-card.highlight { background: #fef2f2; border-color: #fecaca; }
            .summary-label { font-size: 8.5pt; color: #4b5563; text-transform: uppercase; display: block; margin-bottom: 4px; }
            .summary-val { font-size: 12pt; font-weight: bold; }
            .ops-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9.5pt; }
            .ops-table th { background: #f3f4f6; color: #374151; font-weight: 600; text-align: left; padding: 8px 10px; border: 1px solid #d1d5db; }
            .ops-table td { padding: 7px 10px; border: 1px solid #e5e7eb; }
            .ops-table tr:nth-child(even) { background: #f9fafb; }
            .footer-table { width: 100%; margin-top: 30px; page-break-inside: avoid; }
            .footer-table td { vertical-align: bottom; }
            .stamp-box { border: 1px dashed #9ca3af; border-radius: 6px; width: 220px; height: 90px; text-align: center; padding: 8px; font-size: 9pt; color: #4b5563; }
            .legal-mention { font-size: 8.5pt; color: #6b7280; max-width: 60%; }
          </style>
        </head>
        <body>
          ${this.docHeaderService.renderHtmlHeader({
            format: 'a4',
            documentTitle: 'Relevé de Compte Client',
            documentSubtitle: `Situation comptable au : ${generatedDate}`,
          })}

          <div class="client-box">
            <div class="client-grid">
              <div class="client-row">
                <div class="client-cell" style="width: 50%;"><strong>Client :</strong> ${this.escapeHtml(c.fullName)}</div>
                <div class="client-cell" style="width: 50%;"><strong>Code Patient :</strong> <span style="font-family: monospace;">${this.escapeHtml(c.code)}</span></div>
              </div>
              <div class="client-row">
                <div class="client-cell"><strong>Type de Compte :</strong> ${this.escapeHtml(c.customerType)}</div>
                <div class="client-cell"><strong>Téléphone :</strong> ${this.escapeHtml(c.phone || 'Non renseigné')}</div>
              </div>
              <div class="client-row">
                <div class="client-cell" colspan="2"><strong>Adresse :</strong> ${this.escapeHtml(this.getFormattedAddress(c.address))}</div>
              </div>
            </div>
          </div>

          <table class="summary-table">
            <tr>
              <td class="summary-card" style="width: 25%;">
                <span class="summary-label">Plafond Autorisé</span>
                <span class="summary-val" style="color: #1f2937;">${Number(c.creditLimitCdf || 0).toLocaleString('fr-FR')} CDF</span>
              </td>
              <td class="summary-card" style="width: 25%;">
                <span class="summary-label">Total Achats Crédit</span>
                <span class="summary-val" style="color: #116149;">${Number(this.getTotalCreditPurchases()).toLocaleString('fr-FR')} CDF</span>
              </td>
              <td class="summary-card" style="width: 25%;">
                <span class="summary-label">Total Règlements</span>
                <span class="summary-val" style="color: #15803d;">${Number(this.getTotalPayments()).toLocaleString('fr-FR')} CDF</span>
              </td>
              <td class="summary-card highlight" style="width: 25%;">
                <span class="summary-label">SOLDE NET RESTANT DÛ</span>
                <span class="summary-val" style="color: #b91c1c;">${Number(s.currentBalanceCdf || 0).toLocaleString('fr-FR')} CDF</span>
              </td>
            </tr>
          </table>

          <h4 style="margin: 16px 0 6px; font-size: 11pt; color: #116149;">Détail chronologique des opérations comptables :</h4>
          <table class="ops-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opération</th>
                <th>Référence</th>
                <th style="text-align: right;">Débit (Achats)</th>
                <th style="text-align: right;">Crédit (Règlements)</th>
                <th style="text-align: right;">Solde Cumulé Dû</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <table class="footer-table">
            <tr>
              <td>
                <div class="legal-mention">
                  <p><strong>Certification :</strong> Le présent extrait de compte est certifié sincère et conforme aux écritures comptables tenues par le logiciel de gestion de l'officine.</p>
                  <p>Tout règlement donne lieu à la remise d'un reçu officiel numéroté.</p>
                </div>
              </td>
              <td style="text-align: right;">
                <div class="stamp-box" style="margin-left: auto;">
                  <strong>Visa Comptable / Direction</strong><br>
                  <span style="font-size: 8pt; color: #9ca3af;">Cachet & Signature autorisée</span>
                </div>
              </td>
            </tr>
          </table>
          ${this.docHeaderService.renderHtmlFooter({ format: 'a4' })}
        </body>
      </html>
    `;
    this.printHtmlDocument(html, `Releve-${c.code}`);
  }

  printReceipt() {
    if (!this.receiptModal) return;
    const r = this.receiptModal;
    const dateFormatted = new Date(r.createdAt).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const allocationsHtml = (r.allocations || []).map(a => `
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
        <span>Facture ${this.escapeHtml(a.invoiceNumber)} :</span>
        <span style="font-weight: bold;">+ ${Number(a.amountCdf).toLocaleString('fr-FR')} CDF</span>
      </div>
    `).join('') || '<div style="font-size: 11px; color: #666;">Aucune imputation spécifique</div>';

    const remainingHtml = r.remainingBalanceCdf !== undefined ? `
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #555; margin-top: 4px;">
        <span>Nouveau Solde Restant :</span>
        <span style="font-weight: bold;">${Number(r.remainingBalanceCdf).toLocaleString('fr-FR')} CDF</span>
      </div>
    ` : '';

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Reçu d'encaissement - ${this.escapeHtml(r.receiptReference)}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 3mm 4mm;
            }
            body {
              font-family: 'Courier New', Courier, monospace, sans-serif;
              font-size: 12px;
              line-height: 1.35;
              color: #000;
              margin: 0;
              padding: 4px;
            }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
            .header h2 { font-size: 14px; margin: 0 0 2px; text-transform: uppercase; font-family: sans-serif; }
            .header p { font-size: 10px; margin: 1px 0; }
            .meta-box { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 11px; }
            .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .alloc-section { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
            .alloc-title { font-weight: bold; font-size: 11px; margin-bottom: 4px; text-transform: uppercase; }
            .total-box { border-bottom: 1px double #000; padding-bottom: 6px; margin-bottom: 6px; }
            .total-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; }
            .footer { text-align: center; font-size: 9px; color: #333; margin-top: 8px; }
          </style>
        </head>
        <body>
          ${this.docHeaderService.renderHtmlHeader({
            format: 'ticket',
            documentTitle: "REÇU D'ENCAISSEMENT CRÉANCE",
          })}

          <div class="meta-box">
            <div class="meta-row"><span>RÉFÉRENCE :</span><span class="font-bold">${this.escapeHtml(r.receiptReference)}</span></div>
            <div class="meta-row"><span>DATE / HEURE :</span><span>${dateFormatted}</span></div>
            <div class="meta-row"><span>CLIENT :</span><span class="font-bold">${this.escapeHtml(r.customerName || '')}</span></div>
            <div class="meta-row"><span>CODE CLIENT :</span><span>${this.escapeHtml(r.customerCode || '')}</span></div>
            <div class="meta-row"><span>MODE RÈGLEMENT :</span><span>${this.escapeHtml(r.paymentMethod || '')}</span></div>
            <div class="meta-row"><span>DEVISE :</span><span>${this.escapeHtml(r.currency || 'CDF')}</span></div>
          </div>

          <div class="alloc-section">
            <div class="alloc-title">Imputation des créances (FIFO) :</div>
            ${allocationsHtml}
          </div>

          <div class="total-box">
            <div class="total-row">
              <span>MONTANT ENCAISSÉ :</span>
              <span>${Number(r.amountPaidCdf).toLocaleString('fr-FR')} CDF</span>
            </div>
            ${remainingHtml}
          </div>

          ${this.docHeaderService.renderHtmlFooter({
            format: 'ticket',
            customFooter: 'Merci pour votre confiance. Quittance officielle délivrée par le système informatique.',
          })}
        </body>
      </html>
    `;
    this.printHtmlDocument(html, `Reçu-${r.receiptReference}`);
  }

  printFullCustomerDossier() {
    if (!this.selectedCustomer) return;
    const c = this.selectedCustomer;
    const cAny = c as any;
    const s = this.statement;
    const printDate = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const birthFormatted = c.dateNaissance
      ? `${new Date(c.dateNaissance).toLocaleDateString('fr-FR')} (${this.getCalculatedAge(c.dateNaissance)})`
      : 'Non renseignée';

    const contactsHtml = (c.contacts || []).map(ct => `
      <div style="margin-bottom: 4px;">
        <strong>${this.escapeHtml(ct.name)}</strong> ${ct.relationship ? '(' + this.escapeHtml(ct.relationship) + ')' : ''} :
        <span style="font-family: monospace;">${this.escapeHtml(ct.phone)}</span>
      </div>
    `).join('') || '<div style="color: #666; font-style: italic;">Aucun contact d\'urgence renseigné</div>';

    const docsHtml = (c.identityDocuments || []).map(d => `
      <div style="margin-bottom: 4px;">
        <strong>${this.escapeHtml(d.type)} :</strong>
        <span style="font-family: monospace;">${this.escapeHtml(d.fullNumber || d.number)}</span>
        ${d.expirationDate ? '<small style="color: #666;"> (Exp: ' + new Date(d.expirationDate).toLocaleDateString('fr-FR') + ')</small>' : ''}
      </div>
    `).join('') || '<div style="color: #666; font-style: italic;">Aucune pièce d\'identité répertoriée</div>';

    let specificSectionHtml = '';
    if (c.customerType === 'ENTREPRISE' && c.enterprise) {
      specificSectionHtml = `
        <div class="section-card">
          <div class="section-title">🏢 Informations Légales & Fiscales (Entreprise)</div>
          <div class="grid-2">
            <div><strong>Raison Sociale :</strong> ${this.escapeHtml(c.enterprise.legalName || c.companyName || '-')}</div>
            <div><strong>RCCM :</strong> <span style="font-family: monospace;">${this.escapeHtml(c.enterprise.rccm || '-')}</span></div>
            <div><strong>Id. Nationale :</strong> <span style="font-family: monospace;">${this.escapeHtml(c.enterprise.nationalId || '-')}</span></div>
            <div><strong>N° Impôt (NIF) :</strong> <span style="font-family: monospace;">${this.escapeHtml(c.enterprise.taxId || '-')}</span></div>
            <div><strong>Représentant :</strong> ${this.escapeHtml(c.enterprise.representativeName || '-')} ${c.enterprise.representativeFunction ? '(' + this.escapeHtml(c.enterprise.representativeFunction) + ')' : ''}</div>
            <div><strong>Tél Représentant :</strong> ${this.escapeHtml(c.enterprise.representativePhone || '-')}</div>
          </div>
        </div>
      `;
    } else if (c.customerType === 'ASSURANCE' && c.insurance) {
      const insAny = c.insurance as any;
      specificSectionHtml = `
        <div class="section-card">
          <div class="section-title">🛡️ Prise en Charge Assurance / Mutuelle</div>
          <div class="grid-2">
            <div><strong>Assureur :</strong> ${this.escapeHtml(insAny.insurerName || '-')}</div>
            <div><strong>N° Assuré / Carte :</strong> <span style="font-family: monospace;">${this.escapeHtml(insAny.insuredCardNumber || '-')}</span></div>
            <div><strong>N° Police :</strong> ${this.escapeHtml(insAny.policyNumber || '-')}</div>
            <div><strong>Taux Couverture :</strong> ${insAny.coverageRate ? insAny.coverageRate + '%' : '-'}</div>
            <div><strong>Statut Assuré :</strong> ${this.escapeHtml(insAny.insuredStatus || 'ASSURE_PRINCIPAL')}</div>
            <div><strong>Validité :</strong> ${insAny.endDate ? new Date(insAny.endDate).toLocaleDateString('fr-FR') : 'Permanente'}</div>
          </div>
        </div>
      `;
    }

    const prescriptionsHtml = (this.prescriptions || []).map(p => `
      <tr>
        <td>${p.prescriptionDate ? new Date(p.prescriptionDate).toLocaleDateString('fr-FR') : '-'}</td>
        <td><strong>${this.escapeHtml(p.prescriberName)}</strong></td>
        <td>${this.escapeHtml(p.healthCenter || '-')}</td>
        <td style="font-size: 8.5pt;">${this.escapeHtml(p.prescriptionText || '-')}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="text-align: center; color: #666; padding: 8px;">Aucune ordonnance médicale archivée pour ce patient.</td></tr>';

    const currentBalance = s?.currentBalanceCdf ?? c.currentBalanceCdf ?? 0;

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="utf-8" />
          <title>Dossier Patient - ${this.escapeHtml(c.fullName)}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              font-size: 10pt;
              line-height: 1.4;
              color: #1f2937;
              margin: 0;
            }
            .header-table { width: 100%; border-bottom: 2px solid #116149; padding-bottom: 10px; margin-bottom: 14px; }
            .header-table td { vertical-align: top; }
            .officine-title { font-size: 15pt; font-weight: bold; color: #116149; margin: 0; }
            .officine-sub { font-size: 8.5pt; color: #4b5563; margin: 2px 0 0; }
            .doc-badge { text-align: right; }
            .doc-title { font-size: 13pt; font-weight: bold; color: #111827; margin: 0; text-transform: uppercase; }
            .doc-meta { font-size: 8.5pt; color: #6b7280; margin-top: 3px; }
            .section-card { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; page-break-inside: avoid; }
            .section-title { font-weight: bold; color: #116149; font-size: 10.5pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 8px; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 9.5pt; }
            .medical-warning-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; font-size: 9.5pt; color: #92400e; }
            .data-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9pt; }
            .data-table th { background: #f3f4f6; color: #374151; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #d1d5db; }
            .data-table td { padding: 5px 8px; border: 1px solid #e5e7eb; }
            .footer-table { width: 100%; margin-top: 20px; page-break-inside: avoid; }
            .stamp-box { border: 1px dashed #9ca3af; border-radius: 6px; width: 220px; height: 80px; text-align: center; padding: 8px; font-size: 8.5pt; color: #4b5563; margin-left: auto; }
            .confidentiality { font-size: 8pt; color: #6b7280; line-height: 1.35; max-width: 65%; }
          </style>
        </head>
        <body>
          ${this.docHeaderService.renderHtmlHeader({
            format: 'a4',
            documentTitle: 'Fiche Dossier Patient',
            documentSubtitle: `Code Patient : ${this.escapeHtml(c.code)} | Édition : ${printDate}`,
          })}

          <!-- SECTION 1 : ÉTAT CIVIL & COORDONNÉES -->
          <div class="section-card">
            <div class="section-title">👤 1. Identité Civile & Coordonnées du Patient</div>
            <div class="grid-2">
              <div><strong>Nom complet :</strong> ${this.escapeHtml(c.fullName)}</div>
              <div><strong>Statut / Type de compte :</strong> ${this.escapeHtml(c.customerType)}</div>
              <div><strong>Genre / Sexe :</strong> ${c.sexe === 'M' ? 'Masculin (Homme)' : (c.sexe === 'F' ? 'Féminin (Femme)' : '-')}</div>
              <div><strong>Date de Naissance :</strong> ${birthFormatted}</div>
              <div><strong>Nationalité :</strong> ${this.escapeHtml(c.nationalite || 'Congolaise (RDC)')}</div>
              <div><strong>Téléphone principal :</strong> ${this.escapeHtml(c.phone || '-')}</div>
              <div><strong>Téléphone secondaire :</strong> ${this.escapeHtml(cAny.telephoneSecondaire || '-')}</div>
              <div><strong>Email :</strong> ${this.escapeHtml(c.email || '-')}</div>
              <div style="grid-column: span 2;"><strong>Adresse physique :</strong> ${this.escapeHtml(this.getFormattedAddress(c.address))}</div>
            </div>
          </div>

          <!-- SECTION 2 : DOSSIER MÉDICAL & PHARMACOVIGILANCE -->
          <div class="section-card">
            <div class="section-title">🩺 2. Dossier Médical & Pharmacovigilance (Sécurité du Patient)</div>
            <div class="grid-2" style="margin-bottom: 6px;">
              <div><strong>Groupe Sanguin & Rhésus :</strong> <span style="font-weight: bold; color: #b91c1c;">${this.escapeHtml(cAny.medicalDetails?.bloodGroup || 'Non déterminé')}</span></div>
              <div><strong>État Physiologique :</strong> ${this.escapeHtml(cAny.medicalDetails?.physiologicalState || 'Aucun')}</div>
            </div>
            <div class="medical-warning-box">
              <strong>⚠️ Allergies & Contre-indications :</strong> ${this.escapeHtml(cAny.medicalDetails?.allergies || 'Aucune allergie médicamenteuse signalée')}
            </div>
            <div style="font-size: 9.5pt; margin-bottom: 4px;">
              <strong>Pathologies chroniques & Terrain à risque :</strong> ${this.escapeHtml(cAny.medicalDetails?.chronicDiseases || 'Aucune pathologie chronique signalée')}
            </div>
            <div style="font-size: 9.5pt;">
              <strong>Observations & Notes du Pharmacien :</strong> ${this.escapeHtml(c.medicalNotes || 'Aucune note complémentaire.')}
            </div>
          </div>

          <!-- SECTION 3 : PIÈCES D'IDENTITÉ & CONTACTS -->
          <div class="section-card">
            <div class="section-title">📄 3. Pièces d'Identité & Personnes de Contact d'Urgence</div>
            <div class="grid-2">
              <div>
                <strong style="display: block; margin-bottom: 4px; font-size: 9pt; color: #4b5563;">Pièces d'identité enregistrées :</strong>
                ${docsHtml}
              </div>
              <div>
                <strong style="display: block; margin-bottom: 4px; font-size: 9pt; color: #4b5563;">Contacts d'urgence :</strong>
                ${contactsHtml}
              </div>
            </div>
          </div>

          ${specificSectionHtml}

          <!-- SECTION 4 : SITUATION FINANCIÈRE & CRÉANCES -->
          <div class="section-card">
            <div class="section-title">💵 4. Situation Comptable & Suivi des Crédits</div>
            <div class="grid-2">
              <div><strong>Plafond de crédit autorisé :</strong> ${Number(c.creditLimitCdf || 0).toLocaleString('fr-FR')} CDF</div>
              <div><strong>Solde restant dû :</strong> <span style="font-weight: bold; ${currentBalance > 0 ? 'color: #b91c1c;' : 'color: #15803d;'}">${Number(currentBalance).toLocaleString('fr-FR')} CDF</span></div>
              <div><strong>Total achats enregistrés :</strong> ${Number(this.getTotalCreditPurchases()).toLocaleString('fr-FR')} CDF</div>
              <div><strong>Total règlements perçus :</strong> ${Number(this.getTotalPayments()).toLocaleString('fr-FR')} CDF</div>
            </div>
          </div>

          <!-- SECTION 5 : HISTORIQUE DES ORDONNANCES -->
          <div class="section-card">
            <div class="section-title">🏥 5. Ordonnances Médicales Enregistrées (${(this.prescriptions || []).length})</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 80px;">Date</th>
                  <th style="width: 140px;">Prescripteur</th>
                  <th style="width: 140px;">Centre Hospitalier</th>
                  <th>Prescription / Posologie</th>
                </tr>
              </thead>
              <tbody>
                ${prescriptionsHtml}
              </tbody>
            </table>
          </div>

          <!-- PIED DE PAGE & VALIDATION -->
          <table class="footer-table">
            <tr>
              <td>
                <div class="confidentiality">
                  <p><strong>🔒 CONFIDENTIALITÉ MÉDICALE ET SECRET PROFESSIONNEL :</strong></p>
                  <p>Ce document contient des données de santé à caractère personnel protégées par le secret professionnel pharmaceutique. Sa reproduction, diffusion ou communication non autorisée est strictement prohibée conformément à la législation en vigueur en RDC (CLI-10).</p>
                </div>
              </td>
              <td>
                <div class="stamp-box">
                  <strong>Visa du Pharmacien Titulaire</strong><br>
                  <span style="font-size: 7.5pt; color: #9ca3af;">Cachet officiel & Signature</span>
                </div>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    this.printHtmlDocument(html, `Dossier-${c.code}`);
  }

  openPdfModal(customer: Customer, mode: 'download' | 'print' = 'download') {
    this.pdfTargetCustomer = customer;
    this.pdfActionMode = mode;
    this.pdfIncludeHistory = false;
    this.showPdfModal = true;
  }

  closePdfModal() {
    this.showPdfModal = false;
    this.pdfGenerating = false;
  }

  executePdfAction() {
    if (!this.pdfTargetCustomer || this.pdfGenerating) return;
    this.pdfGenerating = true;

    this.api.downloadCustomerPdf(this.pdfTargetCustomer.id, this.pdfIncludeHistory).subscribe({
      next: (blob) => {
        this.pdfGenerating = false;
        this.showPdfModal = false;

        const customerName = (this.pdfTargetCustomer!.fullName || 'Client')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        const dateIso = new Date().toISOString().slice(0, 10);
        const filename = `Fiche-client_${customerName}_${dateIso}.pdf`;

        const blobUrl = URL.createObjectURL(blob);

        if (this.pdfActionMode === 'print') {
          const printWin = window.open(blobUrl, '_blank');
          if (printWin) {
            printWin.focus();
            setTimeout(() => {
              try { printWin.print(); } catch {}
            }, 1000);
          } else {
            this.printBlobViaIframe(blobUrl);
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
        } else {
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        }
      },
      error: (err) => {
        this.pdfGenerating = false;
        this.errorMessage = err.error?.message || 'Erreur lors de la génération de la fiche client en PDF.';
      },
    });
  }

  private printBlobViaIframe(blobUrl: string) {
    let iframe = document.getElementById('vhp-pdf-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'vhp-pdf-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
    }
    iframe.src = blobUrl;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {}
    };
  }

  openPhotoZoomModal() {
    this.showPhotoZoomModal = true;
  }

  closePhotoZoomModal() {
    this.showPhotoZoomModal = false;
  }

  triggerPhotoChange() {
    this.closePhotoZoomModal();
    this.profilePhotoInputRef?.nativeElement.click();
  }

  removeProfilePhoto() {
    if (!this.selectedCustomer) return;
    if (!confirm('Êtes-vous sûr de vouloir retirer la photo de ce client ?')) return;
    this.submitting = true;
    this.api.removeProfilePhoto(this.selectedCustomer.id).subscribe({
      next: () => {
        this.submitting = false;
        if (this.profilePhotoUrl.startsWith('blob:')) URL.revokeObjectURL(this.profilePhotoUrl);
        this.profilePhotoUrl = '';
        this.selectedCustomer!.hasProfilePhoto = false;
        this.loadCustomers();
      },
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Erreur lors de la suppression de la photo.';
      },
    });
  }

  revealDocumentNumber(doc: any) {
    if (!doc.id) return;
    this.api.revealIdentityNumber(doc.id).subscribe({
      next: (res) => {
        doc.fullNumber = res.number;
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Impossible de révéler le numéro complet (droit insuffisant).';
      },
    });
  }

  viewIdentityScan(doc: any) {
    if (!doc.id) return;
    this.closePreviewModal();
    this.api.getIdentityScan(doc.id).subscribe({
      next: (res) => {
        if (res.storageMode === 'local') {
          this.api.getIdentityScanImage(doc.id).subscribe({
            next: (image) => this.openPrescriptionPreview(URL.createObjectURL(image), res.expiresAt),
            error: (err) => (this.errorMessage = err.error?.message || 'Scan de la pièce d’identité local introuvable.'),
          });
          return;
        }
        this.openPrescriptionPreview(res.signedUrl, res.expiresAt);
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Accès au scan de la pièce d’identité refusé.';
      },
    });
  }

  deactivateCustomer() {
    if (!this.selectedCustomer) return;
    const balance = this.statement?.currentBalanceCdf ?? this.selectedCustomer.currentBalanceCdf ?? 0;
    if (balance > 0) {
      if (!confirm(`⚠️ ATTENTION : Le client "${this.selectedCustomer.fullName}" présente une créance impayée de ${balance.toLocaleString('fr-FR')} CDF !\n\nDésactiver ce compte archivera la fiche mais ne supprimera pas sa dette comptable.\nConfirmez-vous la désactivation ?`)) {
        return;
      }
    } else {
      if (!confirm(`Confirmez-vous la désactivation de la fiche de "${this.selectedCustomer.fullName}" ? Cette opération archivera le dossier.`)) {
        return;
      }
    }
    this.submitting = true;
    this.api.deactivateCustomer(this.selectedCustomer.id).subscribe({
      next: () => {
        this.submitting = false;
        this.selectedCustomer = undefined;
        this.loadCustomers();
      },
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err.error?.message || 'Impossible de désactiver cette fiche client.';
      },
    });
  }

  getFormattedAddress(address: any): string {
    if (!address) return 'Non renseignée';
    if (typeof address === 'string') return address;
    const parts: string[] = [];
    if (address.numero_parcelle || address.numeroParcelle) {
      parts.push(`N° ${address.numero_parcelle || address.numeroParcelle}`);
    }
    if (address.avenue_rue || address.avenueRue) {
      parts.push(`Av. ${address.avenue_rue || address.avenueRue}`);
    }
    if (address.quartier) {
      parts.push(`Q. ${address.quartier}`);
    }
    if (address.commune) {
      parts.push(`C. ${address.commune}`);
    }
    if (address.ville) {
      parts.push(address.ville);
    }
    if (address.point_de_repere || address.pointDeRepere) {
      parts.push(`(Réf: ${address.point_de_repere || address.pointDeRepere})`);
    }
    return parts.length > 0 ? parts.join(', ') : 'Non renseignée';
  }
}
