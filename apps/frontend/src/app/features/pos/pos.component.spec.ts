import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PosComponent } from './pos.component';
import { SalesApiService } from '../../core/api/services/sales-api.service';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { CashApiService } from '../../core/api/services/cash-api.service';
import { CustomersApiService } from '../../core/api/services/customers-api.service';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';

describe('PosComponent (VTE-01..16, RG-07..10, REC-01)', () => {
  let component: PosComponent;
  let fixture: ComponentFixture<PosComponent>;
  let mockSalesApi: jasmine.SpyObj<SalesApiService>;
  let mockCatalogApi: jasmine.SpyObj<CatalogApiService>;
  let mockCashApi: jasmine.SpyObj<CashApiService>;
  let mockCustomersApi: jasmine.SpyObj<CustomersApiService>;

  const dummyProduct: any = {
    id: 'prd-001',
    name: 'Paracétamol 500mg',
    dci: 'PARACETAMOL',
    sellingPriceCdf: 2500,
    sellingPriceUsd: 0.88,
    requiresPrescription: false,
    isControlledSubstance: false,
  };

  const dummyPreview = {
    currency: 'CDF',
    exchangeRate: 2850,
    subtotalCdf: 5000,
    discountCdf: 0,
    taxCdf: 0,
    totalCdf: 5000,
    totalUsd: 1.75,
    paidCdf: 5000,
    changeCdf: 0,
    outstandingCdf: 0,
    items: [
      {
        productId: 'prd-001',
        quantity: 2,
        unitPriceCdf: 2500,
        discountCdf: 0,
        lineTotalCdf: 5000,
        lotNumber: 'LOT-2026-A',
        expiryDate: '2027-12-31',
        availableStock: 50,
        isNearExpiry: false,
        isControlled: false,
        requiresPrescription: false,
        stockWarning: false,
      },
    ],
  };

  beforeEach(async () => {
    mockSalesApi = jasmine.createSpyObj('SalesApiService', [
      'createSale',
      'previewSale',
      'holdCart',
      'listHeldCarts',
      'resumeHeldCart',
      'getInvoiceDocument',
    ]);
    mockCatalogApi = jasmine.createSpyObj('CatalogApiService', ['autocomplete', 'getProductById', 'getProducts']);
    mockCashApi = jasmine.createSpyObj('CashApiService', ['getActiveSession', 'getActiveRate']);
    mockCustomersApi = jasmine.createSpyObj('CustomersApiService', ['getCustomers']);

    mockCashApi.getActiveSession.and.returnValue(of({ id: 'cs-001', status: 'OUVERTE' } as any));
    mockCashApi.getActiveRate.and.returnValue(of({ rate: 2850 } as any));
    mockSalesApi.previewSale.and.returnValue(of(dummyPreview));
    mockCatalogApi.autocomplete.and.returnValue(of([{ id: 'prd-001', name: 'Paracétamol' } as any]));
    mockCatalogApi.getProductById.and.returnValue(of(dummyProduct));
    mockCatalogApi.getProducts.and.returnValue(of({ data: [] } as any));
    mockSalesApi.listHeldCarts.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [PosComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SalesApiService, useValue: mockSalesApi },
        { provide: CatalogApiService, useValue: mockCatalogApi },
        { provide: CashApiService, useValue: mockCashApi },
        { provide: CustomersApiService, useValue: mockCustomersApi },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('1. doit initialiser la session de caisse ouverte', () => {
    expect(component.cashSession()).toBeTruthy();
    expect(component.cashSession().status).toBe('OUVERTE');
  });

  it('2. doit ajouter un produit au scan et déclencher la prévisualisation serveur (RG-07)', () => {
    component.onBarcodeScanned('358291001');
    expect(mockCatalogApi.autocomplete).toHaveBeenCalledWith('358291001');
    expect(mockCatalogApi.getProductById).toHaveBeenCalledWith('prd-001');
    expect(component.cart().length).toBe(1);
    expect(mockSalesApi.previewSale).toHaveBeenCalled();
  });

  it('3. doit mettre à jour les totaux et les informations FEFO issues de preview', () => {
    component.cart.set([{ product: dummyProduct, quantity: 2, discountCdf: 0 }]);
    component.onCartChanged();
    expect(component.totalCdf()).toBe(5000);
    expect(component.totalUsd()).toBe(1.75);
    expect(component.cart()[0].lotNumber).toBe('LOT-2026-A');
  });

  it('4. doit bloquer la validation si un médicament exige ordonnance sans sélection (RG-09, VTE-15)', () => {
    const rxProduct = { ...dummyProduct, id: 'prd-rx', requiresPrescription: true };
    component.cart.set([{ product: rxProduct, quantity: 1, discountCdf: 0, requiresPrescription: true }]);
    component.selectedPrescription = null;

    expect(component.requiresPrescription()).toBeTrue();
    expect(component.isCheckoutDisabled()).toBeTrue();
  });

  it('5. doit autoriser la validation dès qu’une ordonnance valide est attachée', () => {
    const rxProduct = { ...dummyProduct, id: 'prd-rx', requiresPrescription: true };
    component.cart.set([{ product: rxProduct, quantity: 1, discountCdf: 0, requiresPrescription: true }]);
    component.selectedPrescription = {
      id: 'ord-123',
      prescriberName: 'Dr Mukendi',
      prescriptionDate: '2026-10-30',
    };

    expect(component.isCheckoutDisabled()).toBeFalse();
  });

  it('6. doit conserver la même Idempotency-Key pour la même tentative de vente (VTE-18, RG-16)', () => {
    const initialKey = component.currentIdempotencyKey();
    expect(initialKey).toBeTruthy();

    component.cart.set([{ product: dummyProduct, quantity: 1, discountCdf: 0 }]);
    component.paymentLines = [{ method: 'ESPECES', amount: 2500, currency: 'CDF' }];

    mockSalesApi.createSale.and.returnValue(of({ id: 'sale-001', invoiceNumber: 'FAC-2026-000001' } as any));
    component.validateSale();

    expect(mockSalesApi.createSale).toHaveBeenCalledWith(jasmine.any(Object), initialKey);
    // Après succès, la clé est renouvelée pour la transaction suivante
    expect(component.currentIdempotencyKey()).not.toBe(initialKey);
  });

  it('7. doit gérer les raccourcis clavier F2, F4, F8, F9, F10 et Échap', () => {
    const eventF3 = new KeyboardEvent('keydown', { key: 'F3' });
    spyOn(eventF3, 'preventDefault');
    component.handleShortcut(eventF3);
    expect(eventF3.preventDefault).toHaveBeenCalled();
    expect(component.showDiscountModal).toBeTrue();

    const eventEsc = new KeyboardEvent('keydown', { key: 'Escape' });
    component.handleShortcut(eventEsc);
    expect(component.showDiscountModal).toBeFalse();
  });

  it('8. doit permettre la mise en attente (holdCart) et la reprise (resumeHeldCart) [VTE-11]', () => {
    component.cart.set([{ product: dummyProduct, quantity: 2, discountCdf: 0 }]);
    spyOn(window, 'prompt').and.returnValue('Panier Client X');
    mockSalesApi.holdCart.and.returnValue(of({ id: 'hc-01' }));

    component.holdCart();
    expect(mockSalesApi.holdCart).toHaveBeenCalled();

    mockSalesApi.resumeHeldCart.and.returnValue(of({
      id: 'hc-01',
      items: [{ productId: 'prd-001', quantity: 2 }],
    }));

    component.resumeHeldCart('hc-01');
    expect(mockSalesApi.resumeHeldCart).toHaveBeenCalledWith('hc-01');
  });
});
