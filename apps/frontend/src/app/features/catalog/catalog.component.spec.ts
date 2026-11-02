import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CatalogComponent } from './catalog.component';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/services/alert.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Product, PaginatedResult } from '@vhp/shared';

describe('CatalogComponent', () => {
  let component: CatalogComponent;
  let fixture: ComponentFixture<CatalogComponent>;
  let mockCatalogApi: jasmine.SpyObj<CatalogApiService>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockAlertService: jasmine.SpyObj<AlertService>;
  let dialog: MatDialog;

  const mockProduct: Product = {
    id: 'prod-1',
    pharmacyId: '11111111-1111-1111-1111-111111111111',
    name: 'Doliprane 1000 mg',
    dci: 'Paracétamol',
    dosage: '1000 mg',
    galenicForm: 'Comprimé',
    sellingUnit: 'Boîte de 16',
    laboratory: 'Sanofi',
    sellingPriceCdf: 3420,
    sellingPriceUsd: 1.2,
    taxRate: 0,
    minAlertThreshold: 20,
    requiresPrescription: false,
    isControlledSubstance: false,
    isColdChain: false,
    barcodes: ['3582910012345'],
    totalStock: 50,
    isActive: true,
  };

  const mockPaginatedResult: PaginatedResult<Product> = {
    data: [mockProduct],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(async () => {
    mockCatalogApi = jasmine.createSpyObj<CatalogApiService>('CatalogApiService', [
      'getProducts',
      'getCategories',
      'deactivateProduct',
      'activateProduct',
      'exportCsv',
    ]);
    mockCatalogApi.getProducts.and.returnValue(of(mockPaginatedResult));
    mockCatalogApi.getCategories.and.returnValue(of([]));
    mockCatalogApi.exportCsv.and.returnValue(of('Nom,DCI\nDoliprane,Paracétamol'));

    mockAuthService = jasmine.createSpyObj<AuthService>('AuthService', ['hasPermission']);
    mockAuthService.hasPermission.and.returnValue(true);

    mockAlertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'warning',
      'info',
    ]);

    await TestBed.configureTestingModule({
      imports: [CatalogComponent, MatDialogModule, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: mockCatalogApi },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AlertService, useValue: mockAlertService },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CatalogComponent);
    component = fixture.componentInstance;
    dialog = TestBed.inject(MatDialog);
    fixture.detectChanges();
  });

  it('devrait être initialisé correctement avec la liste des produits', () => {
    expect(component).toBeTruthy();
    expect(mockCatalogApi.getProducts).toHaveBeenCalled();
    expect(component.products().length).toBe(1);
    expect(component.totalProducts()).toBe(1);
  });

  it('devrait relancer la recherche lors de la frappe avec debounce de 250ms', fakeAsync(() => {
    component.onSearchChange('doli');
    tick(260); // Attendre le debounce de 250ms
    expect(mockCatalogApi.getProducts).toHaveBeenCalled();
  }));

  it('devrait changer le tri et recharger les produits', () => {
    component.changeSort('name');
    expect(component.sortOrder).toBe('desc'); // Première inversion car déjà 'name' asc
    expect(mockCatalogApi.getProducts).toHaveBeenCalled();
  });

  it('devrait ouvrir le dialogue de confirmation lors de la désactivation d’un produit', () => {
    spyOn(dialog, 'open').and.returnValue({
      afterClosed: () => of(true),
    } as any);

    mockCatalogApi.deactivateProduct.and.returnValue(of({ ...mockProduct, isActive: false }));

    component.confirmDeactivate(mockProduct);

    expect(dialog.open).toHaveBeenCalled();
    expect(mockCatalogApi.deactivateProduct).toHaveBeenCalledWith(mockProduct.id);
    expect(mockAlertService.success).toHaveBeenCalled();
  });
});

