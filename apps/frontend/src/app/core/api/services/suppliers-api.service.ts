import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import { Supplier, PurchaseOrder } from '@vhp/shared';

export interface CreateSupplierDto {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
}

export interface UpdateSupplierDto {
  name?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  isActive?: boolean;
}

export interface CreatePurchaseOrderItemDto {
  productId: string;
  orderedQuantity: number;
  unitPriceCdf: number;
  unitPriceUsd?: number;
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  items: CreatePurchaseOrderItemDto[];
  expectedDeliveryDate?: string;
  notes?: string;
}

export interface ReceivedLineDto {
  productId: string;
  lotNumber: string;
  expiryDate: string;
  receivedQuantity: number;
  actualPurchasePriceCdf: number;
  actualPurchasePriceUsd?: number;
  purchaseOrderItemId?: string;
}

export interface ReceiveOrderDto {
  idempotencyKey?: string;
  lines: ReceivedLineDto[];
  supplierInvoiceNumber?: string;
  notes?: string;
}

export interface PurchaseOrderQueryDto {
  supplierId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

@Injectable({
  providedIn: 'root',
})
export class SuppliersApiService {
  private readonly client = inject(BaseApiClient);
  private readonly http = inject(HttpClient);

  // ==========================================
  // FOURNISSEURS (ACH-01)
  // ==========================================

  getSuppliers(includeInactive = true): Observable<Supplier[]> {
    return this.client.get<Supplier[]>('/suppliers', { params: { includeInactive: String(includeInactive) } });
  }

  getSupplierById(id: string): Observable<Supplier> {
    return this.client.get<Supplier>(`/suppliers/${id}`);
  }

  createSupplier(dto: CreateSupplierDto): Observable<Supplier> {
    return this.client.post<Supplier>('/suppliers', dto);
  }

  updateSupplier(id: string, dto: UpdateSupplierDto): Observable<Supplier> {
    return this.client.patch<Supplier>(`/suppliers/${id}`, dto);
  }

  toggleSupplierActive(id: string, isActive: boolean): Observable<Supplier> {
    return this.updateSupplier(id, { isActive });
  }

  // ==========================================
  // BONS DE COMMANDE (ACH-02, ACH-04)
  // ==========================================

  getPurchaseOrders(query?: PurchaseOrderQueryDto): Observable<PurchaseOrder[]> {
    return this.client.get<PurchaseOrder[]>('/suppliers/orders', { params: query || {} });
  }

  getPurchaseOrderById(id: string): Observable<PurchaseOrder> {
    return this.client.get<PurchaseOrder>(`/suppliers/orders/${id}`);
  }

  createPurchaseOrder(dto: CreatePurchaseOrderDto): Observable<PurchaseOrder> {
    return this.client.post<PurchaseOrder>('/suppliers/orders', dto);
  }

  updateOrderStatus(id: string, status: string): Observable<PurchaseOrder> {
    return this.client.patch<PurchaseOrder>(`/suppliers/orders/${id}/status`, { status });
  }

  receiveOrder(orderId: string, dto: ReceiveOrderDto): Observable<PurchaseOrder> {
    return this.client.post<PurchaseOrder>(`/suppliers/orders/${orderId}/receive`, dto);
  }

  downloadPurchaseOrderPdf(orderId: string): Observable<Blob> {
    return this.client.getBlob(`/suppliers/orders/${orderId}/pdf`);
  }
}
