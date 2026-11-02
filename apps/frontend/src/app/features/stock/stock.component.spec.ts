import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { StockComponent } from './stock.component';
import { StockApiService } from '../../core/api/services/stock-api.service';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { AlertService } from '../../core/services/alert.service';
import { PermissionService } from '../../core/permissions/permission.service';
import { HasPermissionDirective } from '../../core/permissions/has-permission.directive';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';

describe('StockComponent (STK-01..14, RG-11)', () => {
  let component: StockComponent;
  let fixture: ComponentFixture<StockComponent>;
  let mockStockApi: jasmine.SpyObj<StockApiService>;
  let mockCatalogApi: jasmine.SpyObj<CatalogApiService>;
  let mockAlert: jasmine.SpyObj<AlertService>;
  let mockPermission: jasmine.SpyObj<PermissionService>;
  let mockDialog: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    mockStockApi = jasmine.createSpyObj('StockApiService', [
      'getLots',
      'getProductStock',
      'getMovements',
      'getPendingAdjustments',
      'approveAdjustment',
      'requestAdjustment',
      'quarantineLot',
      'getAlerts',
      'getInventories',
      'getControlledRegister',
      'getCumpValuation',
      'createInventory',
      'validateInventory',
      'cancelInventory',
      'createMovement',
    ]);

    mockCatalogApi = jasmine.createSpyObj('CatalogApiService', ['getProducts']);
    mockAlert = jasmine.createSpyObj('AlertService', ['success', 'error', 'info', 'warning']);
    mockPermission = jasmine.createSpyObj('PermissionService', ['hasPermission', 'getAllPermissions']);
    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);

    mockCatalogApi.getProducts.and.returnValue(
      of({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    );
    mockStockApi.getLots.and.returnValue(of([]));
    mockStockApi.getMovements.and.returnValue(
      of({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    );
    mockStockApi.getPendingAdjustments.and.returnValue(of([]));
    mockPermission.hasPermission.and.returnValue(true);
    mockPermission.getAllPermissions.and.returnValue(['*']);
    mockDialog.open.and.returnValue({ afterClosed: () => of({ valid: true }) } as any);

    TestBed.configureTestingModule({
      imports: [StockComponent, HasPermissionDirective, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StockApiService, useValue: mockStockApi },
        { provide: CatalogApiService, useValue: mockCatalogApi },
        { provide: AlertService, useValue: mockAlert },
        { provide: PermissionService, useValue: mockPermission },
        { provide: MatDialog, useValue: mockDialog },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: mockDialog });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(StockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('doit créer le composant de gestion de stock', () => {
    expect(component).toBeTruthy();
  });

  it('doit retourner le bon code couleur selon la date de péremption', () => {
    // 1. Périmé -> red
    expect(component.getExpiryColor('2020-01-01')).toBe('red');

    // 2. < 30 jours -> orange
    const in15Days = new Date();
    in15Days.setDate(in15Days.getDate() + 15);
    expect(component.getExpiryColor(in15Days.toISOString().slice(0, 10))).toBe('orange');

    // 3. < 60 jours -> yellow
    const in45Days = new Date();
    in45Days.setDate(in45Days.getDate() + 45);
    expect(component.getExpiryColor(in45Days.toISOString().slice(0, 10))).toBe('yellow');

    // 4. > 60 jours -> green
    const in180Days = new Date();
    in180Days.setDate(in180Days.getDate() + 180);
    expect(component.getExpiryColor(in180Days.toISOString().slice(0, 10))).toBe('green');
  });

  it('doit exiger le PIN pharmacien avant validation d ajustement (RG-11)', () => {
    const dummyAdj: any = {
      id: 'adj-uuid-pin',
      lotId: 'lot-1',
      productName: 'Ibuprofène',
      lotNumber: 'LOT-IBU-99',
      variance: -5,
      reason: 'Plaquette détériorée',
      requestedByName: 'Gestionnaire Stock',
      requestedAt: new Date().toISOString(),
      status: 'DEMANDE',
    };
    mockStockApi.approveAdjustment.and.returnValue(of({ success: true }));
    component.approveAdjustment(dummyAdj, true);
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('doit valider une demande d ajustement par le pharmacien (RG-11)', () => {
    const dummyAdj: any = {
      id: 'adj-uuid-1',
      lotId: 'lot-1',
      productName: 'Ibuprofène',
      lotNumber: 'LOT-IBU-99',
      variance: -5,
      reason: 'Plaquette détériorée',
      requestedByName: 'Gestionnaire Stock',
      requestedAt: new Date().toISOString(),
      status: 'DEMANDE',
    };

    mockStockApi.approveAdjustment.and.returnValue(of({ success: true }));

    component.approveAdjustment(dummyAdj, true);

    expect(mockStockApi.approveAdjustment).toHaveBeenCalledWith('adj-uuid-1', {
      action: 'APPROVE',
      pharmacistComment: 'Validé par le pharmacien',
    });
    expect(mockAlert.success).toHaveBeenCalledWith(
      'Ajustement validé et mouvement généré.',
    );
  });

  it('doit rejeter une demande d ajustement par le pharmacien (RG-11)', () => {
    const dummyAdj: any = {
      id: 'adj-uuid-2',
      lotId: 'lot-2',
      productName: 'Paracétamol',
      lotNumber: 'LOT-PARA-01',
      variance: -10,
      reason: 'Erreur apparente',
      requestedByName: 'Gestionnaire Stock',
      requestedAt: new Date().toISOString(),
      status: 'DEMANDE',
    };

    mockStockApi.approveAdjustment.and.returnValue(of({ success: true }));

    component.approveAdjustment(dummyAdj, false);

    expect(mockStockApi.approveAdjustment).toHaveBeenCalledWith('adj-uuid-2', {
      action: 'REJECT',
      pharmacistComment: 'Rejeté par le pharmacien',
    });
    expect(mockAlert.success).toHaveBeenCalledWith('Ajustement rejeté.');
  });
});
