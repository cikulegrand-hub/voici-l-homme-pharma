import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  FormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/services/alert.service';
import { PriceHistoryDialogComponent } from './price-history-dialog.component';
import { CategoriesDialogComponent } from './categories-dialog.component';
import { Product, ProductCategory } from '@vhp/shared';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="product-form-container">
      <header class="page-header">
        <div class="header-left">
          <button mat-icon-button routerLink="/catalog" class="back-btn" title="Retour au catalogue">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h2>{{ isEditMode() ? 'Modifier la fiche produit' : 'Nouveau produit au catalogue' }}</h2>
            <p class="subtitle text-muted">
              {{ isEditMode() ? 'Mise à jour des informations cliniques, logistiques et tarifaires.' : 'Enregistrement complet d’une référence pharmaceutique (CAT-01 à CAT-04).' }}
            </p>
          </div>
        </div>

        @if (isEditMode() && existingProduct()) {
          <div class="header-actions">
            <button mat-stroked-button color="primary" type="button" (click)="openPriceHistory()">
              <mat-icon>history</mat-icon> Historique des prix
            </button>
          </div>
        }
      </header>

      @if (isLoading()) {
        <div class="loading-state">
          <mat-spinner diameter="40"></mat-spinner>
          <span>Chargement de la fiche produit...</span>
        </div>
      } @else {
        <form [formGroup]="productForm" (ngSubmit)="onSubmit()" class="form-grid">
          <!-- SECTION 1 : IDENTIFICATION PRODUIT -->
          <mat-card class="form-section-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="section-icon">medication</mat-icon>
              <mat-card-title>1. Identification & Caractéristiques (CAT-01)</mat-card-title>
              <mat-card-subtitle>Informations fondamentales de la molécule et du conditionnement</mat-card-subtitle>
            </mat-card-header>

            <mat-card-content class="section-content">
              <div class="row-2">
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Désignation Commerciale *</mat-label>
                  <input matInput formControlName="name" placeholder="Ex: Doliprane 1000 mg" />
                  @if (productForm.get('name')?.hasError('required') && productForm.get('name')?.touched) {
                    <mat-error>Le nom commercial est obligatoire.</mat-error>
                  }
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>DCI (Molécule active) *</mat-label>
                  <input matInput formControlName="dci" placeholder="Ex: Paracétamol" />
                  @if (productForm.get('dci')?.hasError('required') && productForm.get('dci')?.touched) {
                    <mat-error>La DCI est obligatoire (CAT-01).</mat-error>
                  }
                </mat-form-field>
              </div>

              <div class="row-3">
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Dosage</mat-label>
                  <input matInput formControlName="dosage" placeholder="Ex: 1000 mg, 500 mg/5ml" />
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Forme galénique</mat-label>
                  <mat-select formControlName="galenicForm">
                    @for (form of galenicForms(); track form) {
                      <mat-option [value]="form">{{ form }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Unité de vente *</mat-label>
                  <input matInput formControlName="sellingUnit" placeholder="Ex: Boîte de 16, Flacon 100ml" />
                  @if (productForm.get('sellingUnit')?.hasError('required') && productForm.get('sellingUnit')?.touched) {
                    <mat-error>L’unité de vente est obligatoire.</mat-error>
                  }
                </mat-form-field>
              </div>

              <div class="row-2">
                <div class="category-select-wrapper">
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Catégorie thérapeutique</mat-label>
                    <mat-select formControlName="categoryId">
                      <mat-option [value]="null">Aucune catégorie</mat-option>
                      @for (cat of categories(); track cat.id) {
                        <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <button mat-icon-button type="button" (click)="openCategoriesDialog()" title="Gérer les catégories" class="manage-btn">
                    <mat-icon>settings</mat-icon>
                  </button>
                </div>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Laboratoire / Fabricant</mat-label>
                  <input matInput formControlName="laboratory" placeholder="Ex: Sanofi, Sandoz, Shalina" />
                </mat-form-field>
              </div>
            </mat-card-content>
          </mat-card>

          <!-- SECTION 2 : TARIFICATION & PRIX -->
          <mat-card class="form-section-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="section-icon">payments</mat-icon>
              <mat-card-title>2. Tarification & Prix de vente (CAT-06)</mat-card-title>
              <mat-card-subtitle>
                @if (canEditPrice()) {
                  <span class="text-success">Vous êtes habilité à modifier les tarifs (prix.modifier).</span>
                } @else {
                  <span class="text-warning">Modification tarifaire désactivée (permission prix.modifier requise).</span>
                }
              </mat-card-subtitle>
            </mat-card-header>

            <mat-card-content class="section-content">
              @if (!canEditPrice()) {
                <div class="permission-alert">
                  <mat-icon>lock</mat-icon>
                  <span>Les prix de vente sont verrouillés. Seul un pharmacien autorisé peut réviser les tarifs officiels.</span>
                </div>
              }

              <div class="row-3">
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Prix de vente (CDF) *</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="50"
                    formControlName="sellingPriceCdf"
                    [readonly]="!canEditPrice()"
                  />
                  <span matSuffix>CDF&nbsp;</span>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Prix de vente (USD) *</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="0.05"
                    formControlName="sellingPriceUsd"
                    [readonly]="!canEditPrice()"
                  />
                  <span matSuffix>USD&nbsp;</span>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Taux TVA (%)</mat-label>
                  <input matInput type="number" min="0" max="100" formControlName="taxRate" />
                  <span matSuffix>%&nbsp;</span>
                </mat-form-field>
              </div>

              @if (isEditMode() && canEditPrice()) {
                <div class="row-1 mt-2">
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Motif de révision du prix (obligatoire en cas de modification)</mat-label>
                    <input
                      matInput
                      formControlName="priceChangeReason"
                      placeholder="Ex: Augmentation tarifaire fournisseur, ajustement marge..."
                    />
                  </mat-form-field>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <!-- SECTION 3 : STOCK & SEUILS LOGISTIQUES -->
          <mat-card class="form-section-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="section-icon">inventory_2</mat-icon>
              <mat-card-title>3. Seuils de Stock & Emplacement (CAT-01, CAT-11)</mat-card-title>
              <mat-card-subtitle>Gestion des seuils d'approvisionnement et localisation dans l'officine</mat-card-subtitle>
            </mat-card-header>

            <mat-card-content class="section-content">
              <div class="row-4">
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Seuil d’alerte minimal *</mat-label>
                  <input matInput type="number" min="0" formControlName="minAlertThreshold" />
                  <span matSuffix>unités</span>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Stock de sécurité (CAT-11)</mat-label>
                  <input matInput type="number" min="0" formControlName="securityStock" />
                  <span matSuffix>unités</span>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Seuil maximal (CAT-11)</mat-label>
                  <input matInput type="number" min="0" formControlName="maxThreshold" />
                  <span matSuffix>unités</span>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Emplacement en officine</mat-label>
                  <input matInput formControlName="storageLocation" placeholder="Ex: Rayon B - Étagère 3" />
                </mat-form-field>
              </div>
            </mat-card-content>
          </mat-card>

          <!-- SECTION 4 : STATUT RÉGLEMENTAIRE -->
          <mat-card class="form-section-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="section-icon">verified_user</mat-icon>
              <mat-card-title>4. Statut Réglementaire & Traçabilité (CAT-02, RG-09)</mat-card-title>
              <mat-card-subtitle>Contraintes légales de délivrance et de conservation</mat-card-subtitle>
            </mat-card-header>

            <mat-card-content class="section-content">
              <div class="checkbox-row">
                <mat-checkbox formControlName="requiresPrescription" color="primary">
                  <div class="checkbox-label">
                    <strong>Prescription médicale obligatoire (Rx)</strong>
                    <span class="text-muted text-xs">Exige une ordonnance valide lors de la vente au comptoir (RG-09).</span>
                  </div>
                </mat-checkbox>

                <mat-checkbox formControlName="isControlledSubstance" color="warn">
                  <div class="checkbox-label">
                    <strong class="text-danger">Produit contrôlé / Stupéfiant</strong>
                    <span class="text-muted text-xs">Réglementation stricte, inscription au registre des stupéfiants.</span>
                  </div>
                </mat-checkbox>

                <mat-checkbox formControlName="isColdChain" color="primary">
                  <div class="checkbox-label">
                    <strong>Chaîne du froid (2°C - 8°C) ❄️</strong>
                    <span class="text-muted text-xs">Conservation en réfrigérateur médical obligatoire.</span>
                  </div>
                </mat-checkbox>
              </div>
            </mat-card-content>
          </mat-card>

          <!-- SECTION 5 : CODES-BARRES MULTIPLES -->
          <mat-card class="form-section-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="section-icon">qr_code_scanner</mat-icon>
              <mat-card-title>5. Codes-barres associés (CAT-03)</mat-card-title>
              <mat-card-subtitle>Gestion multi-codes-barres EAN-13 par scan douchette</mat-card-subtitle>
            </mat-card-header>

            <mat-card-content class="section-content">
              <div class="barcode-input-row">
                <mat-form-field appearance="outline" class="flex-1">
                  <mat-label>Nouveau code-barres (ou scanner au lecteur)</mat-label>
                  <mat-icon matPrefix>qr_code</mat-icon>
                  <input
                    matInput
                    [(ngModel)]="newBarcodeInput"
                    [ngModelOptions]="{ standalone: true }"
                    (keydown.enter)="addBarcode($event)"
                    placeholder="Scanner ou saisir un code EAN..."
                  />
                </mat-form-field>

                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  [disabled]="!newBarcodeInput.trim()"
                  (click)="addBarcode()"
                  class="add-barcode-btn"
                >
                  <mat-icon>add</mat-icon> Associer
                </button>
              </div>

              <div class="barcodes-list">
                @for (barcode of barcodesList(); track barcode; let idx = $index) {
                  <div class="barcode-pill">
                    <mat-icon class="pill-icon">barcode</mat-icon>
                    <span class="pill-text font-medium">{{ barcode }}</span>
                    @if (idx === 0) {
                      <span class="primary-badge">Principal</span>
                    }
                    <button
                      mat-icon-button
                      type="button"
                      (click)="removeBarcode(barcode)"
                      title="Supprimer ce code-barres"
                      class="pill-remove-btn"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                }
                @if (barcodesList().length === 0) {
                  <p class="text-muted text-xs italic">
                    Aucun code-barres associé. Le produit sera trouvable par nom ou DCI.
                  </p>
                }
              </div>
            </mat-card-content>
          </mat-card>

          <!-- BOUTONS D'ACTION -->
          <div class="form-actions">
            <button mat-stroked-button type="button" routerLink="/catalog">
              Annuler
            </button>
            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="productForm.invalid || isSubmitting()"
            >
              @if (isSubmitting()) {
                <mat-spinner diameter="20" class="mr-2"></mat-spinner>
              }
              {{ isEditMode() ? 'Mettre à jour le produit' : 'Créer la fiche produit' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [
    `
      .product-form-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 8px 16px;
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .page-header h2 {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 700;
        color: #0f172a;
      }
      .subtitle {
        margin: 2px 0 0 0;
        font-size: 0.85rem;
      }
      .form-grid {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .form-section-card {
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }
      .section-icon {
        color: #0284c7;
      }
      .section-content {
        padding-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .w-full {
        width: 100%;
      }
      .row-1 {
        width: 100%;
      }
      .row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .row-3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
      }
      .row-4 {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
      }
      .category-select-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .manage-btn {
        margin-bottom: 22px;
      }
      .permission-alert {
        display: flex;
        align-items: center;
        gap: 8px;
        background-color: #fef3c7;
        color: #92400e;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.85rem;
        margin-bottom: 8px;
      }
      .checkbox-row {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 4px 0;
      }
      .checkbox-label {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .text-danger {
        color: #dc2626;
      }
      .text-success {
        color: #16a34a;
      }
      .text-warning {
        color: #d97706;
      }
      .barcode-input-row {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .flex-1 {
        flex: 1;
      }
      .add-barcode-btn {
        margin-bottom: 22px;
      }
      .barcodes-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        min-height: 36px;
      }
      .barcode-pill {
        display: flex;
        align-items: center;
        gap: 6px;
        background-color: #f1f5f9;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 0.85rem;
      }
      .pill-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: #64748b;
      }
      .primary-badge {
        background-color: #e0f2fe;
        color: #0369a1;
        font-size: 0.7rem;
        padding: 1px 6px;
        border-radius: 4px;
        font-weight: 600;
      }
      .pill-remove-btn {
        width: 20px;
        height: 20px;
        line-height: 20px;
        font-size: 14px;
      }
      .pill-remove-btn mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 0;
      }
      .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 60px 0;
      }
      .text-muted {
        color: #64748b;
      }
      .text-xs {
        font-size: 0.75rem;
      }
      .font-medium {
        font-weight: 500;
      }
      .mr-2 {
        margin-right: 8px;
      }
      .mt-2 {
        margin-top: 8px;
      }
      .italic {
        font-style: italic;
      }
    `,
  ],
})
export class ProductFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly dialog = inject(MatDialog);

  isEditMode = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  canEditPrice = signal<boolean>(false);
  productId: string | null = null;
  existingProduct = signal<Product | null>(null);

  categories = signal<ProductCategory[]>([]);
  galenicForms = signal<string[]>([]);
  barcodesList = signal<string[]>([]);
  newBarcodeInput = '';

  productForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    dci: ['', [Validators.required]],
    dosage: [''],
    galenicForm: ['Comprimé'],
    sellingUnit: ['Boîte', [Validators.required]],
    categoryId: [null],
    laboratory: [''],
    sellingPriceCdf: [0, [Validators.required, Validators.min(0)]],
    sellingPriceUsd: [0, [Validators.required, Validators.min(0)]],
    taxRate: [0, [Validators.min(0), Validators.max(100)]],
    minAlertThreshold: [10, [Validators.required, Validators.min(0)]],
    maxThreshold: [null],
    securityStock: [null],
    storageLocation: [''],
    requiresPrescription: [false],
    isControlledSubstance: [false],
    isColdChain: [false],
    priceChangeReason: [''],
  });

  ngOnInit() {
    this.canEditPrice.set(this.authService.hasPermission('prix.modifier'));
    this.loadLookups();

    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.productId = id;
        this.isEditMode.set(true);
        this.loadProduct(id);
      }
    });
  }

  loadLookups() {
    this.catalogApi.getCategories().subscribe({
      next: (cats) => this.categories.set(cats),
    });

    this.catalogApi.getGalenicForms().subscribe({
      next: (forms) => this.galenicForms.set(forms),
    });
  }

  loadProduct(id: string) {
    this.isLoading.set(true);
    this.catalogApi.getProductById(id, true).subscribe({
      next: (product) => {
        this.existingProduct.set(product);
        this.barcodesList.set(product.barcodes || []);
        this.productForm.patchValue({
          name: product.name,
          dci: product.dci,
          dosage: product.dosage || '',
          galenicForm: product.galenicForm || 'Comprimé',
          sellingUnit: product.sellingUnit || 'Boîte',
          categoryId: product.categoryId || null,
          laboratory: product.laboratory || '',
          sellingPriceCdf: product.sellingPriceCdf,
          sellingPriceUsd: product.sellingPriceUsd,
          taxRate: product.taxRate || 0,
          minAlertThreshold: product.minAlertThreshold || 10,
          maxThreshold: product.maxThreshold || null,
          securityStock: product.securityStock || null,
          storageLocation: product.storageLocation || '',
          requiresPrescription: product.requiresPrescription || false,
          isControlledSubstance: product.isControlledSubstance || false,
          isColdChain: product.isColdChain || false,
          priceChangeReason: '',
        });

        if (!this.canEditPrice()) {
          this.productForm.get('sellingPriceCdf')?.disable();
          this.productForm.get('sellingPriceUsd')?.disable();
        }

        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.error(err.error?.message || 'Erreur lors du chargement du produit.');
        this.router.navigate(['/catalog']);
      },
    });
  }

  addBarcode(event?: Event) {
    if (event) event.preventDefault();
    const clean = this.newBarcodeInput.trim();
    if (!clean) return;

    if (this.barcodesList().includes(clean)) {
      this.alertService.warning(`Le code-barres "${clean}" est déjà présent dans la liste.`);
      return;
    }

    this.barcodesList.update((list) => [...list, clean]);
    this.newBarcodeInput = '';
  }

  removeBarcode(barcode: string) {
    this.barcodesList.update((list) => list.filter((b) => b !== barcode));
  }

  openPriceHistory() {
    const prod = this.existingProduct();
    if (!prod) return;
    this.dialog.open(PriceHistoryDialogComponent, {
      data: { product: prod },
      width: '750px',
    });
  }

  openCategoriesDialog() {
    const ref = this.dialog.open(CategoriesDialogComponent, {
      width: '750px',
    });
    ref.afterClosed().subscribe(() => {
      this.loadLookups();
    });
  }

  onSubmit() {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    const formVal = this.productForm.getRawValue(); // Inclut les champs disabled si applicable
    const barcodes = this.barcodesList();

    const payload: any = {
      name: formVal.name.trim(),
      dci: formVal.dci.trim(),
      dosage: formVal.dosage?.trim() || undefined,
      galenicForm: formVal.galenicForm || undefined,
      sellingUnit: formVal.sellingUnit?.trim() || 'Boîte',
      categoryId: formVal.categoryId || undefined,
      laboratory: formVal.laboratory?.trim() || undefined,
      sellingPriceCdf: Number(formVal.sellingPriceCdf),
      sellingPriceUsd: Number(formVal.sellingPriceUsd),
      taxRate: Number(formVal.taxRate) || 0,
      minAlertThreshold: Number(formVal.minAlertThreshold) || 10,
      maxThreshold: formVal.maxThreshold ? Number(formVal.maxThreshold) : undefined,
      securityStock: formVal.securityStock ? Number(formVal.securityStock) : undefined,
      storageLocation: formVal.storageLocation?.trim() || undefined,
      requiresPrescription: Boolean(formVal.requiresPrescription),
      isControlledSubstance: Boolean(formVal.isControlledSubstance),
      isColdChain: Boolean(formVal.isColdChain),
      barcodes,
    };

    this.isSubmitting.set(true);

    if (this.isEditMode() && this.productId) {
      // Si le prix a changé et que l'utilisateur est habilité
      const oldProd = this.existingProduct();
      const priceChanged =
        oldProd &&
        (oldProd.sellingPriceCdf !== payload.sellingPriceCdf || oldProd.sellingPriceUsd !== payload.sellingPriceUsd);

      if (priceChanged && this.canEditPrice()) {
        const reason = formVal.priceChangeReason?.trim() || 'Mise à jour tarifaire sur fiche produit';
        // Utiliser updatePrice pour consigner le motif
        this.catalogApi
          .updatePrice(this.productId, {
            newPriceCdf: payload.sellingPriceCdf,
            newPriceUsd: payload.sellingPriceUsd,
            reason,
          })
          .subscribe({
            error: (err) => {
              this.alertService.error(err.error?.message || 'Erreur lors de la mise à jour du prix.');
            },
          });
      }

      this.catalogApi.updateProduct(this.productId, payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.alertService.success('Fiche produit mise à jour avec succès.');
          this.router.navigate(['/catalog']);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.alertService.error(err.error?.message || 'Erreur lors de la mise à jour du produit.');
        },
      });
    } else {
      this.catalogApi.createProduct(payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.alertService.success('Fiche produit créée avec succès.');
          this.router.navigate(['/catalog']);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.alertService.error(err.error?.message || 'Erreur lors de la création du produit.');
        },
      });
    }
  }
}
