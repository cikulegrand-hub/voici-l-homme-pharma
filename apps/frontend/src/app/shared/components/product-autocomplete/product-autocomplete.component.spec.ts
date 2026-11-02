import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ProductAutocompleteComponent } from './product-autocomplete.component';
import { CatalogApiService } from '../../../core/api/services/catalog-api.service';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProductAutocompleteItem } from '@vhp/shared';

describe('ProductAutocompleteComponent', () => {
  let component: ProductAutocompleteComponent;
  let fixture: ComponentFixture<ProductAutocompleteComponent>;
  let mockCatalogApi: jasmine.SpyObj<CatalogApiService>;

  const mockItems: ProductAutocompleteItem[] = [
    {
      id: 'p1',
      name: 'Doliprane 1000 mg',
      dci: 'Paracétamol',
      dosage: '1000 mg',
      galenicForm: 'Comprimé',
      sellingUnit: 'Boîte de 16',
      sellingPriceCdf: 3420,
      sellingPriceUsd: 1.2,
      totalStock: 50,
      requiresPrescription: false,
      isControlledSubstance: false,
      isColdChain: false,
      barcodes: ['3582910012345'],
    },
    {
      id: 'p2',
      name: 'Amoxicilline 500 mg',
      dci: 'Amoxicilline',
      dosage: '500 mg',
      galenicForm: 'Gélule',
      sellingUnit: 'Boîte de 24',
      sellingPriceCdf: 9975,
      sellingPriceUsd: 3.5,
      totalStock: 5,
      requiresPrescription: true,
      isControlledSubstance: false,
      isColdChain: false,
      barcodes: ['3582910098765'],
    },
  ];

  beforeEach(async () => {
    mockCatalogApi = jasmine.createSpyObj<CatalogApiService>('CatalogApiService', ['autocomplete']);
    mockCatalogApi.autocomplete.and.returnValue(of(mockItems));

    await TestBed.configureTestingModule({
      imports: [ProductAutocompleteComponent, NoopAnimationsModule],
      providers: [{ provide: CatalogApiService, useValue: mockCatalogApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductAutocompleteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait être initialisé correctement', () => {
    expect(component).toBeTruthy();
    expect(component.results().length).toBe(0);
    expect(component.isOpen()).toBeFalse();
  });

  it('devrait déclencher la recherche après le debounce de 250ms pour une requête >= 2 caractères', fakeAsync(() => {
    component.onQueryChange('doli');
    expect(mockCatalogApi.autocomplete).not.toHaveBeenCalled();

    tick(260); // Attendre le debounce de 250ms
    expect(mockCatalogApi.autocomplete).toHaveBeenCalledWith('doli');
    expect(component.results().length).toBe(2);
    expect(component.isOpen()).toBeTrue();
  }));

  it('ne devrait pas déclencher de recherche si la saisie fait moins de 2 caractères', fakeAsync(() => {
    component.onQueryChange('d');
    tick(300);
    expect(mockCatalogApi.autocomplete).not.toHaveBeenCalled();
    expect(component.results().length).toBe(0);
  }));

  it('devrait émettre l’élément sélectionné lors du clic', () => {
    spyOn(component.productSelected, 'emit');
    component.selectItem(mockItems[0]);

    expect(component.productSelected.emit).toHaveBeenCalledWith(mockItems[0]);
    expect(component.searchQuery).toBe(mockItems[0].name);
    expect(component.isOpen()).toBeFalse();
  });

  it('devrait vider la recherche avec clearSearch', () => {
    component.searchQuery = 'test';
    component.results.set(mockItems);
    component.isOpen.set(true);

    component.clearSearch();

    expect(component.searchQuery).toBe('');
    expect(component.results().length).toBe(0);
    expect(component.isOpen()).toBeFalse();
  });
});

