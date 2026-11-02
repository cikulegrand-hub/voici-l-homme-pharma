import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExchangeRatesComponent } from './exchange-rates.component';
import { CashApiService } from '../../core/api/services/cash-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/services/alert.service';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { ExchangeRate } from '@vhp/shared';

describe('ExchangeRatesComponent', () => {
  let component: ExchangeRatesComponent;
  let fixture: ComponentFixture<ExchangeRatesComponent>;
  let cashApiSpy: jasmine.SpyObj<CashApiService>;
  let alertServiceSpy: jasmine.SpyObj<AlertService>;
  let mockActiveRateSignal: any;
  let authServiceMock: any;

  const mockRates: ExchangeRate[] = [
    {
      id: 'rate-1',
      pharmacyId: 'pharm-1',
      baseCurrency: 'USD',
      targetCurrency: 'CDF',
      rate: 2850,
      effectiveDate: '2026-10-30T08:00:00Z',
      notes: 'Taux officiel matin',
      createdByName: 'Admin Test',
    },
    {
      id: 'rate-0',
      pharmacyId: 'pharm-1',
      baseCurrency: 'USD',
      targetCurrency: 'CDF',
      rate: 2820,
      effectiveDate: '2026-10-29T08:00:00Z',
      notes: 'Taux veille',
      createdByName: 'Admin Test',
    },
  ];

  beforeEach(async () => {
    cashApiSpy = jasmine.createSpyObj('CashApiService', [
      'getRatesHistory',
      'getActiveRate',
      'setExchangeRate',
    ]);
    alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error', 'warning', 'info']);

    mockActiveRateSignal = signal<ExchangeRate | null>(null);
    authServiceMock = {
      activeRate: mockActiveRateSignal,
      setActiveRate: jasmine.createSpy('setActiveRate').and.callFake((rate: ExchangeRate) => {
        mockActiveRateSignal.set(rate);
      }),
    };

    cashApiSpy.getRatesHistory.and.returnValue(of(mockRates));
    cashApiSpy.getActiveRate.and.returnValue(of(mockRates[0]));

    await TestBed.configureTestingModule({
      imports: [ExchangeRatesComponent, NoopAnimationsModule],
      providers: [
        { provide: CashApiService, useValue: cashApiSpy },
        { provide: AuthService, useValue: authServiceMock },
        { provide: AlertService, useValue: alertServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExchangeRatesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait créer le composant des taux de change', () => {
    expect(component).toBeTruthy();
  });

  it('devrait charger la liste historique des taux au chargement', () => {
    expect(cashApiSpy.getRatesHistory).toHaveBeenCalled();
    expect(component.rates().length).toBe(2);
    expect(component.rates()[0].rate).toBe(2850);
  });

  it('devrait refuser la soumission si la valeur du taux est vide ou négative', () => {
    component.rateValue = null;
    component.onSubmit();
    expect(cashApiSpy.setExchangeRate).not.toHaveBeenCalled();
    expect(alertServiceSpy.error).toHaveBeenCalledWith('La valeur du taux doit être supérieure à zéro.');

    component.rateValue = -50;
    component.onSubmit();
    expect(cashApiSpy.setExchangeRate).not.toHaveBeenCalled();
  });

  it('devrait soumettre un nouveau taux officiel et mettre à jour le store et l’alerte', () => {
    const newRate: ExchangeRate = {
      id: 'rate-2',
      pharmacyId: 'pharm-1',
      baseCurrency: 'USD',
      targetCurrency: 'CDF',
      rate: 2900,
      effectiveDate: '2026-10-30T14:00:00Z',
      notes: 'Ajustement après-midi',
      createdByName: 'Admin Test',
    };
    cashApiSpy.setExchangeRate.and.returnValue(of(newRate));

    component.rateValue = 2900;
    component.notes = 'Ajustement après-midi';
    component.onSubmit();

    expect(cashApiSpy.setExchangeRate).toHaveBeenCalled();
    expect(authServiceMock.setActiveRate).toHaveBeenCalledWith(newRate);
    expect(alertServiceSpy.success).toHaveBeenCalledWith('Nouveau taux officiel fixé : 1 USD = 2900 CDF');
    expect(component.rateValue).toBeNull();
    expect(component.notes).toBe('');
  });

  it('devrait afficher l’alerte si aucun taux de change n’est actif (FIN-04)', () => {
    mockActiveRateSignal.set(null);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const alertEl = compiled.querySelector('.missing-rate-alert');
    expect(alertEl).toBeTruthy();
    expect(alertEl?.textContent).toContain('Aucun taux officiel');
  });
});

