import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CustomersComponent } from './customers.component';
import { CustomersApiService, CustomerStatement } from '../../core/api/services/customers-api.service';
import { CashApiService } from '../../core/api/services/cash-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Customer } from '@vhp/shared';

describe('CustomersComponent (Module 5 CLI)', () => {
  let component: CustomersComponent;
  let fixture: ComponentFixture<CustomersComponent>;
  let mockCustomersApi: jasmine.SpyObj<CustomersApiService>;
  let mockCashApi: jasmine.SpyObj<CashApiService>;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  const mockCustomer: Customer = {
    id: 'cust-123',
    code: 'CLI-0001',
    fullName: 'Mukendi Jean',
    customerType: 'PARTICULIER',
    phone: '+243810000001',
    email: 'j.mukendi@test.cd',
    creditLimitCdf: 50000,
    currentBalanceCdf: 15000,
    medicalNotes: 'Allergie pénicilline',
  };

  const mockStatement: CustomerStatement = {
    customer: mockCustomer,
    currentBalanceCdf: 15000,
    availableCreditCdf: 35000,
    purchases: [
      { id: 'sale-1', invoiceNumber: 'FAC-2026-000001', date: '2026-10-30T10:00:00Z', totalCdf: 20000, creditCdf: 15000 },
    ],
    payments: [
      { id: 'pay-1', amountPaidCdf: 5000, currency: 'CDF', method: 'ESPECES', receiptReference: 'RCL-2026-001', createdAt: '2026-10-31T12:00:00Z', allocations: [{ saleId: 'sale-1', amountCdf: 5000 }] },
    ],
  };

  beforeEach(async () => {
    mockCustomersApi = jasmine.createSpyObj<CustomersApiService>('CustomersApiService', [
      'getCustomers',
      'getCustomerById',
      'createCustomer',
      'getStatement',
      'getPrivacyNotice',
      'settleDebt',
      'uploadPrescription',
      'getPrescriptionPreview',
      'getPrescriptions',
    ]);

    mockCashApi = jasmine.createSpyObj<CashApiService>('CashApiService', ['getActiveSession']);
    mockAuthService = jasmine.createSpyObj<AuthService>('AuthService', ['hasPermission', 'currentUser']);

    mockCustomersApi.getCustomers.and.returnValue(of([mockCustomer]));
    mockCustomersApi.getPrivacyNotice.and.returnValue(of({ text: 'Vos données de santé sont confidentielles.', updatedAt: null }));
    mockCustomersApi.getStatement.and.returnValue(of(mockStatement));
    mockCustomersApi.getPrescriptions.and.returnValue(of([
      { id: 'ord-1', prescriberName: 'Dr. Ilunga', healthCenter: 'Clinique Ngaliema', prescriptionDate: '2026-10-28' },
    ]));
    mockCashApi.getActiveSession.and.returnValue(of({ id: 'sess-1' } as any));
    mockAuthService.hasPermission.and.returnValue(true);

    await TestBed.configureTestingModule({
      imports: [CustomersComponent],
      providers: [
        { provide: CustomersApiService, useValue: mockCustomersApi },
        { provide: CashApiService, useValue: mockCashApi },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('1. Initialisation : charge la liste des clients et la mention de confidentialité (CLI-10)', () => {
    expect(component).toBeTruthy();
    expect(mockCustomersApi.getCustomers).toHaveBeenCalled();
    expect(mockCustomersApi.getPrivacyNotice).toHaveBeenCalled();
    expect(component.customers.length).toBe(1);
    expect(component.privacyNotice).toBe('Vos données de santé sont confidentielles.');
  });

  it('2. Fiche client & Relevé : sélectionne un client et charge son relevé avec solde calculé (CLI-01, CLI-03)', () => {
    component.selectCustomer(mockCustomer);
    expect(component.selectedCustomer?.id).toBe('cust-123');
    expect(mockCustomersApi.getStatement).toHaveBeenCalledWith('cust-123');
    expect(mockCustomersApi.getPrescriptions).toHaveBeenCalledWith('cust-123');
    expect(component.statement?.currentBalanceCdf).toBe(15000);
    expect(component.statement?.availableCreditCdf).toBe(35000);
  });

  it('3. Encaissement de créance : calcule l’imputation visible FIFO et émet un ticket de reçu (CLI-04)', () => {
    component.selectCustomer(mockCustomer);
    component.statement = mockStatement;
    component.openSettlementForm();

    expect(component.showSettlementForm).toBeTrue();
    expect(component.settlementModel.amount).toBe(15000);
    expect(component.imputationPreview.length).toBe(1);
    expect(component.imputationPreview[0].invoiceNumber).toBe('FAC-2026-000001');
    expect(component.imputationPreview[0].allocatedCdf).toBe(15000);

    const mockReceipt = {
      id: 'pay-2',
      receiptReference: 'RCL-2026-002',
      amountPaidCdf: 15000,
      currency: 'CDF',
      paymentMethod: 'ESPECES',
      createdAt: new Date().toISOString(),
      customerName: 'Mukendi Jean',
      customerCode: 'CLI-0001',
      remainingBalanceCdf: 0,
      allocations: [{ saleId: 'sale-1', invoiceNumber: 'FAC-2026-000001', amountCdf: 15000 }],
    };
    mockCustomersApi.settleDebt.and.returnValue(of(mockReceipt));

    component.submitSettlement();
    expect(mockCustomersApi.settleDebt).toHaveBeenCalled();
    expect(component.receiptModal).toEqual(mockReceipt);
    expect(component.showSettlementForm).toBeFalse();
  });

  it('4. Ordonnance : saisie et téléversement privé (CLI-05, CLI-06)', () => {
    component.selectCustomer(mockCustomer);
    component.showPrescriptionUpload = true;
    component.prescriptionModel.prescriberName = 'Dr. Dupont';
    component.prescriptionModel.healthCenter = 'Hôpital Général';
    component.prescriptionModel.prescriptionDate = '2026-11-01';
    component.selectedFile = new File(['mock content'], 'ordonnance.jpg', { type: 'image/jpeg' });

    mockCustomersApi.uploadPrescription.and.returnValue(of({ id: 'ord-new' }));

    component.submitPrescription();
    expect(mockCustomersApi.uploadPrescription).toHaveBeenCalled();
    expect(component.showPrescriptionUpload).toBeFalse();
  });

  it('5. Ordonnance : aperçu temporaire avec compte à rebours et expiration (CLI-06, RG-17)', fakeAsync(() => {
    const expiresAt = new Date(Date.now() + 3000).toISOString(); // Expire dans 3s pour le test
    mockCustomersApi.getPrescriptionPreview.and.returnValue(of({
      signedUrl: 'https://storage.mock/prescriptions/signed_test_url',
      expiresAt,
    }));

    component.viewPrescription('ord-1');
    expect(mockCustomersApi.getPrescriptionPreview).toHaveBeenCalledWith('ord-1');
    expect(component.previewModalUrl).toBe('https://storage.mock/prescriptions/signed_test_url');
    expect(component.previewModalExpired).toBeFalse();

    // Avancer le temps de 4 secondes pour dépasser le délai
    tick(4000);
    expect(component.previewModalUrl).toBe('');
    expect(component.previewModalExpired).toBeTrue();
  }));

  it('6. Sécurité : affiche une erreur claire si l’accès à une ordonnance est refusé (REC-07)', () => {
    mockCustomersApi.getPrescriptionPreview.and.returnValue(
      throwError(() => ({ error: { message: 'Un caissier ne peut pas consulter les images d’ordonnances des autres.' } }))
    );

    component.viewPrescription('ord-forbidden');
    expect(component.errorMessage).toContain('Un caissier ne peut pas consulter');
  });
});

