import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReceptionComponent } from './reception.component';
import { SuppliersApiService } from '../../core/api/services/suppliers-api.service';
import { StockApiService } from '../../core/api/services/stock-api.service';
import { AlertService } from '../../core/services/alert.service';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('ReceptionComponent (ACH-04 & STK-01)', () => {
  let component: ReceptionComponent;
  let fixture: ComponentFixture<ReceptionComponent>;
  let mockSuppliersApi: jasmine.SpyObj<SuppliersApiService>;
  let mockStockApi: jasmine.SpyObj<StockApiService>;
  let mockAlert: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    mockSuppliersApi = jasmine.createSpyObj('SuppliersApiService', [
      'getPurchaseOrders',
      'getSuppliers',
      'receiveOrder',
    ]);
    mockStockApi = jasmine.createSpyObj('StockApiService', ['directReception']);
    mockAlert = jasmine.createSpyObj('AlertService', ['success', 'error', 'warning', 'info']);

    mockSuppliersApi.getPurchaseOrders.and.returnValue(of([]));
    mockSuppliersApi.getSuppliers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [ReceptionComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SuppliersApiService, useValue: mockSuppliersApi },
        { provide: StockApiService, useValue: mockStockApi },
        { provide: AlertService, useValue: mockAlert },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceptionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('doit créer le composant de réception', () => {
    expect(component).toBeTruthy();
  });

  it('doit détecter correctement les statuts de péremption (RG-03)', () => {
    // 1. Déjà périmé
    const pastDate = '2020-01-01';
    expect(component.getExpiryStatus(pastDate)).toBe('EXPIRED');

    // 2. Périme dans 20 jours (< 60j)
    const in20Days = new Date();
    in20Days.setDate(in20Days.getDate() + 20);
    const date20Str = in20Days.toISOString().slice(0, 10);
    expect(component.getExpiryStatus(date20Str)).toBe('WARNING');

    // 3. Périme dans 2 ans (OK)
    const futureDate = '2030-01-01';
    expect(component.getExpiryStatus(futureDate)).toBe('OK');
  });

  it('ne doit pas autoriser la validation si une ligne a un lot périmé (RG-03)', () => {
    component.lines.set([
      {
        productId: 'prod-1',
        productName: 'Paracétamol',
        lotNumber: 'LOT-EXP-01',
        expiryDate: '2020-01-01', // Périmé
        quantity: 10,
        purchasePriceCdf: 1500,
        purchasePriceUsd: 0.5,
      },
    ]);

    expect(component.canValidate()).toBeFalse();
  });

  it('doit autoriser la validation si tous les champs obligatoires et dates sont valides', () => {
    const validFuture = new Date();
    validFuture.setFullYear(validFuture.getFullYear() + 2);

    component.lines.set([
      {
        productId: 'prod-1',
        productName: 'Amoxicilline',
        lotNumber: 'LOT-VALID-01',
        expiryDate: validFuture.toISOString().slice(0, 10),
        quantity: 50,
        purchasePriceCdf: 2000,
        purchasePriceUsd: 0.7,
      },
    ]);

    expect(component.canValidate()).toBeTrue();
  });

  it('doit envoyer une clé d idempotence lors d une réception directe et désactiver le bouton pendant l envoi', () => {
    const validFuture = new Date();
    validFuture.setFullYear(validFuture.getFullYear() + 2);

    component.receptionMode = 'DIRECT';
    component.lines.set([
      {
        productId: 'prod-1',
        productName: 'Amoxicilline',
        lotNumber: 'LOT-IDEMP-TEST',
        expiryDate: validFuture.toISOString().slice(0, 10),
        quantity: 100,
        purchasePriceCdf: 2500,
        purchasePriceUsd: 0.88,
      },
    ]);

    mockStockApi.directReception.and.returnValue(
      of({ receiptNumber: 'REC-DIR-001', itemsCount: 1 }),
    );

    component.onValidateClick();
    expect(component.showRecap()).toBeTrue();
    expect(mockStockApi.directReception).not.toHaveBeenCalled();

    component.onValidateClick();

    expect(mockStockApi.directReception).toHaveBeenCalled();
    const callArg = mockStockApi.directReception.calls.mostRecent().args[0];
    expect(callArg.idempotencyKey).toBeTruthy();
    expect(callArg.idempotencyKey?.startsWith('idemp-rec-')).toBeTrue();
    expect(callArg.lines.length).toBe(1);
    expect(callArg.lines[0].lotNumber).toBe('LOT-IDEMP-TEST');
  });
});
