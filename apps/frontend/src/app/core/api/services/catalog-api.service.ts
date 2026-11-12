import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import {
  Product,
  ProductCategory,
  ProductAutocompleteItem,
  PriceHistoryEntry,
  PaginatedResult,
  ProductQueryFilters,
} from '@vhp/shared';

@Injectable({
  providedIn: 'root',
})
export class CatalogApiService {
  private readonly client = inject(BaseApiClient);

  getProducts(params?: ProductQueryFilters): Observable<PaginatedResult<Product>> {
    const httpParams: Record<string, any> = {};
    if (params) {
      if (params.q) httpParams['q'] = params.q;
      if (params.categoryId) httpParams['categoryId'] = params.categoryId;
      if (params.requiresPrescription !== undefined) httpParams['requiresPrescription'] = params.requiresPrescription;
      if (params.isControlledSubstance !== undefined) httpParams['isControlled'] = params.isControlledSubstance;
      if (params.isColdChain !== undefined) httpParams['isColdChain'] = params.isColdChain;
      if (params.isActive !== undefined) httpParams['isActive'] = params.isActive;
      if (params.page !== undefined) httpParams['page'] = params.page;
      if (params.limit !== undefined) httpParams['limit'] = params.limit;
      if (params.sortBy) httpParams['sortBy'] = params.sortBy;
      if (params.sortOrder) httpParams['sortOrder'] = params.sortOrder;
    }
    return this.client.get<PaginatedResult<Product>>('/catalog/products', { params: httpParams });
  }

  autocomplete(q: string): Observable<ProductAutocompleteItem[]> {
    return this.client.get<ProductAutocompleteItem[]>('/catalog/autocomplete', { params: { q } });
  }

  getProductById(id: string, includeInactive = false): Observable<Product> {
    return this.client.get<Product>(`/catalog/products/${id}`, {
      params: { includeInactive },
    });
  }

  createProduct(dto: any): Observable<Product> {
    return this.client.post<Product>('/catalog/products', dto);
  }

  updateProduct(id: string, dto: any): Observable<Product> {
    return this.client.patch<Product>(`/catalog/products/${id}`, dto);
  }

  updatePrice(
    id: string,
    dto: { newPriceCdf: number; newPriceUsd: number; reason: string },
  ): Observable<Product> {
    return this.client.patch<Product>(`/catalog/products/${id}/price`, dto);
  }

  getPriceHistory(id: string): Observable<PriceHistoryEntry[]> {
    return this.client.get<PriceHistoryEntry[]>(`/catalog/products/${id}/price-history`);
  }

  deactivateProduct(id: string): Observable<Product> {
    return this.client.patch<Product>(`/catalog/products/${id}/deactivate`, {});
  }

  activateProduct(id: string): Observable<Product> {
    return this.client.patch<Product>(`/catalog/products/${id}/activate`, {});
  }

  addBarcode(id: string, dto: { barcode: string; isPrimary?: boolean }): Observable<Product> {
    return this.client.post<Product>(`/catalog/products/${id}/barcodes`, dto);
  }

  removeBarcode(id: string, barcodeId: string): Observable<Product> {
    return this.client.delete<Product>(`/catalog/products/${id}/barcodes/${barcodeId}`);
  }

  getCategories(): Observable<ProductCategory[]> {
    return this.client.get<ProductCategory[]>('/catalog/categories');
  }

  createCategory(dto: { name: string; description?: string }): Observable<ProductCategory> {
    return this.client.post<ProductCategory>('/catalog/categories', dto);
  }

  updateCategory(id: string, dto: { name?: string; description?: string }): Observable<ProductCategory> {
    return this.client.patch<ProductCategory>(`/catalog/categories/${id}`, dto);
  }

  deleteCategory(id: string): Observable<void> {
    return this.client.delete<void>(`/catalog/categories/${id}`);
  }

  getGalenicForms(): Observable<string[]> {
    return this.client.get<string[]>('/catalog/galenic-forms');
  }

  createGalenicForm(dto: { name: string }): Observable<string[]> {
    return this.client.post<string[]>('/catalog/galenic-forms', dto);
  }

  exportCsv(): Observable<string> {
    return this.client.getText('/catalog/export-csv');
  }

  simulateImport(csvContent: string): Observable<any> {
    return this.client.post<any>('/catalog/import/simulate', { csvContent });
  }

  executeImport(csvContent: string): Observable<any> {
    return this.client.post<any>('/catalog/import/execute', { csvContent });
  }
}
