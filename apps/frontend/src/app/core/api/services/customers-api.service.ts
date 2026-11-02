import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import { CreateCustomerDto } from '../generated/models';
import { Customer } from '@vhp/shared';

export interface CustomerStatement {
  customer: Customer;
  currentBalanceCdf: number;
  availableCreditCdf: number;
  generatedAt?: string;
  purchases: Array<{ id: string; invoiceNumber: string; date: string; totalCdf: number; creditCdf: number }>;
  payments: Array<{ id: string; amountPaidCdf: number; currency: string; method: string; receiptReference?: string; createdAt: string; allocations: Array<{ saleId: string; amountCdf: number }> }>;
}

export interface SettleDebtRequest {
  amountPaidCdf: number;
  paymentMethod: 'ESPECES' | 'MOBILE_MONEY' | 'CARTE_BANCAIRE' | 'VIREMENT';
  currency: 'CDF' | 'USD';
  idempotencyKey: string;
  cashSessionId?: string;
  notes?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CustomersApiService {
  private readonly client = inject(BaseApiClient);

  getCustomers(params?: { search?: string; customerType?: string }): Observable<Customer[]> {
    const cleanParams: Record<string, string> = {};
    if (params?.search && params.search.trim() && params.search.trim() !== 'undefined') {
      cleanParams['search'] = params.search.trim();
    }
    if (params?.customerType && params.customerType.trim() && params.customerType !== 'undefined') {
      cleanParams['customerType'] = params.customerType.trim();
    }
    return this.client.get<Customer[]>('/customers', { params: cleanParams });
  }

  getCustomerById(id: string): Observable<Customer> {
    return this.client.get<Customer>(`/customers/${id}`);
  }

  createCustomer(dto: CreateCustomerDto): Observable<Customer> {
    return this.client.post<Customer>('/customers', dto);
  }

  getStatement(id: string): Observable<CustomerStatement> {
    return this.client.get<CustomerStatement>(`/customers/${id}/statement`);
  }

  getPrivacyNotice(): Observable<{ text: string; updatedAt: string | null }> {
    return this.client.get<{ text: string; updatedAt: string | null }>('/customers/privacy-notice');
  }

  settleDebt(id: string, dto: SettleDebtRequest): Observable<any> {
    return this.client.patch<any>(`/customers/${id}/settle-debt`, dto);
  }

  uploadPrescription(metadata: { customerId: string; prescriberName: string; healthCenter?: string; prescriptionDate: string; prescriptionText?: string }, file: File): Observable<any> {
    const form = new FormData();
    Object.entries(metadata).forEach(([key, value]) => { if (value) form.append(key, value); });
    form.append('file', file);
    return this.client.post<any>('/customers/prescriptions', form);
  }

  getPrescriptionPreview(id: string): Observable<{ signedUrl: string; expiresAt: string; storageMode?: 'local' | 'supabase' }> {
    return this.client.get<{ signedUrl: string; expiresAt: string; storageMode?: 'local' | 'supabase' }>(`/customers/prescriptions/${id}/signed-url`);
  }

  getPrescriptionImage(id: string): Observable<Blob> {
    return this.client.getBlob(`/customers/prescriptions/${id}/file`);
  }

  getPrescriptions(customerId: string): Observable<Array<{ id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string }>> {
    return this.client.get<Array<{ id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string }>>(`/customers/${customerId}/prescriptions`);
  }
}
