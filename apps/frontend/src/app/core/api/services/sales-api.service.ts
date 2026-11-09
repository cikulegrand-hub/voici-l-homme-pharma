import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import { CreateSaleRequestDto, CancelSaleDto } from '../generated/models';
import { Sale, ResolveConflictDto } from '@vhp/shared';

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

  getSales(params?: { query?: string; startDate?: string; endDate?: string; status?: string }): Observable<Sale[]> {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          cleanParams[key] = String(value);
        }
      });
    }
    return this.client.get<Sale[]>('/sales', { params: Object.keys(cleanParams).length ? cleanParams : undefined });
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

  getInvoiceHtml(invoiceNumber: string, ticket = false, duplicate = false): Observable<string> {
    const suffix = duplicate ? '/duplicata/html' : ticket ? '/ticket-html' : '/html';
    return this.client.getText(`/sales/invoice/${encodeURIComponent(invoiceNumber)}${suffix}`);
  }

  requestCancellation(id: string, dto: any): Observable<any> {
    return this.client.post<any>(`/sales/${id}/request-cancellation`, dto);
  }

  listCancellationRequests(): Observable<any[]> {
    return this.client.get<any[]>('/sales/cancellation-requests');
  }

  approveCancellationRequest(requestId: string): Observable<Sale> {
    return this.client.post<Sale>(`/sales/cancellation-requests/${requestId}/approve`, {});
  }

  rejectCancellationRequest(requestId: string, reason: string): Observable<any> {
    return this.client.post<any>(`/sales/cancellation-requests/${requestId}/reject`, { reason });
  }

  listConflicts(): Observable<any[]> {
    return this.client.get<any[]>('/sales/conflicts');
  }

  resolveConflict(id: string, dto: ResolveConflictDto): Observable<any> {
    return this.client.post<any>(`/sales/${id}/resolve-conflict`, dto);
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
