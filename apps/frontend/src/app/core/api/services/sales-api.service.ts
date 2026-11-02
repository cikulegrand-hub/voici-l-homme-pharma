import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import { CreateSaleRequestDto, CancelSaleDto } from '../generated/models';
import { Sale } from '@vhp/shared';

@Injectable({
  providedIn: 'root',
})
export class SalesApiService {
  private readonly client = inject(BaseApiClient);

  createSale(dto: CreateSaleRequestDto, idempotencyKey: string): Observable<Sale> {
    return this.client.post<Sale>('/sales', dto, { headers: { 'Idempotency-Key': idempotencyKey } });
  }

  previewSale(dto: CreateSaleRequestDto): Observable<any> {
    return this.client.post<any>('/sales/preview', dto);
  }

  getSales(params?: { startDate?: string; endDate?: string }): Observable<Sale[]> {
    return this.client.get<Sale[]>('/sales', { params });
  }

  getSaleById(id: string): Observable<Sale> {
    return this.client.get<Sale>(`/sales/${id}`);
  }

  cancelSale(id: string, dto: CancelSaleDto): Observable<Sale> {
    return this.client.patch<Sale>(`/sales/${id}/cancel`, dto);
  }

  getInvoice(id: string): Observable<any> {
    return this.client.get<any>(`/sales/${id}/invoice`);
  }

  getInvoiceDocument(invoiceNumber: string, ticket = false, duplicate = false): Observable<Blob> {
    const suffix = duplicate ? '/duplicata/document' : ticket ? '/ticket' : '/document';
    return this.client.getBlob(`/sales/invoice/${encodeURIComponent(invoiceNumber)}${suffix}`);
  }

  requestCancellation(id: string, dto: any): Observable<any> {
    return this.client.post<any>(`/sales/${id}/request-cancellation`, dto);
  }

  listCancellationRequests(): Observable<any[]> {
    return this.client.get<any[]>('/sales/cancellation-requests');
  }

  holdCart(dto: any): Observable<any> {
    return this.client.post<any>('/sales/hold-cart', dto);
  }

  listHeldCarts(): Observable<any[]> {
    return this.client.get<any[]>('/sales/held-carts/list');
  }

  resumeHeldCart(id: string): Observable<any> {
    return this.client.post<any>(`/sales/held-carts/${id}/resume`, {});
  }
}
