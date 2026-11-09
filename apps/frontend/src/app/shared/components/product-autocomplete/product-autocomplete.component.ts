import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, switchMap, tap } from 'rxjs/operators';
import { CatalogApiService } from '../../../core/api/services/catalog-api.service';
import { ProductAutocompleteItem } from '@vhp/shared';

@Component({
  selector: 'app-product-autocomplete',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="product-autocomplete-container" #container>
      <mat-form-field appearance="outline" class="w-full search-field">
        <mat-label>{{ placeholder || 'Rechercher un produit (Nom, DCI, Code-barres)...' }}</mat-label>
        <mat-icon matPrefix class="search-icon">search</mat-icon>
        <input
          #inputEl
          matInput
          type="text"
          [(ngModel)]="searchQuery"
          (ngModelChange)="onQueryChange($event)"
          (keydown)="onKeyDown($event)"
          (focus)="onFocus()"
          [placeholder]="placeholder || 'Scanner ou taper pour rechercher...'"
          autocomplete="off"
        />
        @if (isLoading()) {
          <mat-spinner matSuffix [diameter]="20" class="spinner-suffix"></mat-spinner>
        } @else if (searchQuery) {
          <button mat-icon-button matSuffix type="button" (click)="clearSearch($event)" class="clear-btn">
            <mat-icon>close</mat-icon>
          </button>
        } @else {
          <mat-icon matSuffix class="barcode-icon" title="Prêt pour scan douchette">qr_code_scanner</mat-icon>
        }
      </mat-form-field>

      <!-- Panneau déroulant des résultats -->
      @if (isOpen() && results().length > 0) {
        <div class="autocomplete-dropdown shadow-lg rounded-md">
          <ul class="results-list" role="listbox">
            @for (item of results(); track item.id; let idx = $index) {
              <li
                role="option"
                [attr.aria-selected]="idx === selectedIndex()"
                [class.selected]="idx === selectedIndex()"
                (click)="selectItem(item)"
                (mouseenter)="selectedIndex.set(idx)"
                class="result-item"
              >
                <div class="item-main">
                  <div class="item-title-row">
                    <span class="item-name font-medium">{{ item.name }}</span>
                    @if (item.dosage) {
                      <span class="item-dosage badge-subtle">{{ item.dosage }}</span>
                    }
                    @if (item.galenicForm) {
                      <span class="item-form badge-subtle">{{ item.galenicForm }}</span>
                    }
                  </div>
                  <div class="item-sub-row text-xs text-muted">
                    <span class="item-dci">DCI : <strong>{{ item.dci }}</strong></span>
                    @if (item.barcodes && item.barcodes.length > 0) {
                      <span class="item-barcode">| Code : {{ item.barcodes[0] }}</span>
                    }
                  </div>
                </div>

                <div class="item-meta">
                  <div class="item-prices text-right">
                    <div class="price-cdf font-bold text-primary">
                      {{ item.sellingPriceCdf | number:'1.0-2' }} CDF
                    </div>
                    <div class="price-usd text-xs text-muted">
                      {{ item.sellingPriceUsd | number:'1.2-2' }} $
                    </div>
                  </div>

                  <div class="item-stock-and-badges">
                    <span
                      class="stock-badge"
                      [class.in-stock]="item.totalStock > 0"
                      [class.out-of-stock]="item.totalStock <= 0"
                    >
                      {{ item.totalStock }} en stock
                    </span>

                    <div class="regulatory-badges">
                      @if (item.requiresPrescription) {
                        <span class="badge badge-rx" title="Prescription médicale requise">Rx</span>
                      }
                      @if (item.isControlledSubstance) {
                        <span class="badge badge-ctrl" title="Produit stupéfiant / contrôlé">Stup</span>
                      }
                      @if (item.isColdChain) {
                        <span class="badge badge-cold" title="Chaîne du froid 2-8°C">❄️</span>
                      }
                    </div>
                  </div>
                </div>
              </li>
            }
          </ul>
        </div>
      } @else if (isOpen() && searchQuery.trim().length >= 2 && !isLoading() && results().length === 0) {
        <div class="autocomplete-dropdown empty-dropdown p-4 text-center text-muted">
          <mat-icon class="block mb-1 text-gray-400">inventory_2</mat-icon>
          <span>Aucun produit correspondant trouvé pour "{{ searchQuery }}"</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .product-autocomplete-container {
        position: relative;
        width: 100%;
      }
      .w-full {
        width: 100%;
      }
      .search-field {
        margin-bottom: 0;
      }
      .search-icon {
        color: #64748b;
        margin-right: 8px;
      }
      .barcode-icon {
        color: #0284c7;
      }
      .spinner-suffix {
        margin-right: 8px;
      }
      .clear-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        width: 24px;
        height: 24px;
      }
      .autocomplete-dropdown {
        position: absolute;
        top: calc(100% - 16px);
        left: 0;
        right: 0;
        z-index: 1000;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        max-height: 380px;
        overflow-y: auto;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      }
      .results-list {
        list-style: none;
        margin: 0;
        padding: 4px 0;
      }
      .result-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 16px;
        cursor: pointer;
        border-bottom: 1px solid #f1f5f9;
        transition: background-color 0.15s ease;
      }
      .result-item:last-child {
        border-bottom: none;
      }
      .result-item:hover,
      .result-item.selected {
        background-color: #f0f9ff;
      }
      .item-main {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }
      .item-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .item-name {
        font-size: 0.95rem;
        color: #0f172a;
      }
      .badge-subtle {
        background-color: #f1f5f9;
        color: #475569;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 0.75rem;
      }
      .item-sub-row {
        font-size: 0.8rem;
        color: #64748b;
      }
      .item-meta {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .price-cdf {
        font-size: 0.95rem;
        color: #0369a1;
      }
      .item-stock-and-badges {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        min-width: 90px;
      }
      .stock-badge {
        font-size: 0.75rem;
        padding: 2px 8px;
        border-radius: 9999px;
        font-weight: 500;
      }
      .stock-badge.in-stock {
        background-color: #dcfce7;
        color: #15803d;
      }
      .stock-badge.out-of-stock {
        background-color: #fee2e2;
        color: #b91c1c;
      }
      .regulatory-badges {
        display: flex;
        gap: 4px;
      }
      .badge {
        font-size: 0.65rem;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 3px;
        text-transform: uppercase;
      }
      .badge-rx {
        background-color: #f3e8ff;
        color: #7e22ce;
      }
      .badge-ctrl {
        background-color: #ffe4e6;
        color: #be123c;
      }
      .badge-cold {
        background-color: #e0f2fe;
        color: #0369a1;
      }
      @media (max-width: 500px) {
        .result-item {
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          padding: 8px 12px;
        }
        .item-meta {
          width: 100%;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        .item-stock-and-badges {
          align-items: flex-end;
          min-width: auto;
        }
      }
    `,
  ],
})
export class ProductAutocompleteComponent implements OnInit, OnDestroy {
  private readonly catalogApi = inject(CatalogApiService);

  @Input() placeholder = '';
  @Input() autoClearOnSelect = false;
  @Output() productSelected = new EventEmitter<ProductAutocompleteItem>();
  @Output() barcodeScanned = new EventEmitter<string>();

  @ViewChild('inputEl') inputEl?: ElementRef<HTMLInputElement>;
  @ViewChild('container') container?: ElementRef<HTMLDivElement>;

  searchQuery = '';
  results = signal<ProductAutocompleteItem[]>([]);
  isLoading = signal<boolean>(false);
  isOpen = signal<boolean>(false);
  selectedIndex = signal<number>(-1);

  private readonly searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

  // Détection du lecteur de code-barres (douchette)
  private barcodeChars: string[] = [];
  private lastKeyTime = 0;

  ngOnInit() {
    this.searchSubscription = this.searchSubject
      .pipe(
        debounceTime(250), // PERF-01 : Debounce 250ms
        distinctUntilChanged(),
        tap((q) => {
          if (q.trim().length >= 2) {
            this.isLoading.set(true);
            this.isOpen.set(true);
          } else {
            this.results.set([]);
            this.isOpen.set(false);
          }
        }),
        filter((q) => q.trim().length >= 2),
        switchMap((q) => this.catalogApi.autocomplete(q)),
      )
      .subscribe({
        next: (items) => {
          this.results.set(items);
          this.isLoading.set(false);
          this.selectedIndex.set(items.length > 0 ? 0 : -1);
        },
        error: () => {
          this.isLoading.set(false);
          this.results.set([]);
        },
      });
  }

  ngOnDestroy() {
    this.searchSubscription?.unsubscribe();
  }

  onQueryChange(val: string) {
    this.searchSubject.next(val);
  }

  onFocus() {
    if (this.results().length > 0) {
      this.isOpen.set(true);
    }
  }

  clearSearch(event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.searchQuery = '';
    this.results.set([]);
    this.isOpen.set(false);
    this.selectedIndex.set(-1);
    this.inputEl?.nativeElement.focus();
  }

  onKeyDown(event: KeyboardEvent) {
    const list = this.results();

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.isOpen() && list.length > 0) {
        this.isOpen.set(true);
        return;
      }
      const nextIdx = this.selectedIndex() + 1;
      this.selectedIndex.set(nextIdx < list.length ? nextIdx : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIdx = this.selectedIndex() - 1;
      this.selectedIndex.set(prevIdx >= 0 ? prevIdx : list.length - 1);
    } else if (event.key === 'Enter') {
      if (this.isOpen() && this.selectedIndex() >= 0 && this.selectedIndex() < list.length) {
        event.preventDefault();
        this.selectItem(list[this.selectedIndex()]);
      }
    } else if (event.key === 'Escape') {
      this.isOpen.set(false);
    }
  }

  selectItem(item: ProductAutocompleteItem) {
    this.productSelected.emit(item);
    if (this.autoClearOnSelect) {
      this.clearSearch();
    } else {
      this.searchQuery = item.name;
      this.isOpen.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.container && !this.container.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent) {
    // Détection de frappe accélérée typique d'une douchette de scan (intervalle < 45ms)
    const now = Date.now();
    const diff = now - this.lastKeyTime;
    this.lastKeyTime = now;

    if (event.key === 'Enter') {
      if (this.barcodeChars.length >= 4 && diff < 80) {
        // Code-barres scanné détecté
        const scannedCode = this.barcodeChars.join('');
        this.barcodeChars = [];
        this.handleScannedBarcode(scannedCode);
      } else {
        this.barcodeChars = [];
      }
    } else if (event.key.length === 1) {
      if (diff > 100) {
        this.barcodeChars = [];
      }
      this.barcodeChars.push(event.key);
    }
  }

  private handleScannedBarcode(barcode: string) {
    this.barcodeScanned.emit(barcode);
    this.searchQuery = barcode;
    this.isLoading.set(true);
    this.isOpen.set(true);

    this.catalogApi.autocomplete(barcode).subscribe({
      next: (items) => {
        this.isLoading.set(false);
        this.results.set(items);
        if (items.length === 1) {
          // Si un produit correspond exactement, on le sélectionne directement
          this.selectItem(items[0]);
        } else {
          this.selectedIndex.set(items.length > 0 ? 0 : -1);
        }
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }
}

