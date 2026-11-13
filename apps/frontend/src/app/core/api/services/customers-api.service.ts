import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import { Customer } from '@vhp/shared';

export type CustomerProfileRequest = {
  fullName: string; customerType: 'PARTICULIER' | 'ENTREPRISE' | 'ASSURANCE'; creditLimitCdf: number; phone?: string; email?: string; companyName?: string; address?: string; medicalNotes?: string;
  nom?: string; postnom?: string; prenom?: string; sexe?: 'M' | 'F'; dateNaissance?: string; nationalite?: string; telephonePrincipal?: string; telephoneSecondaire?: string; consentementDonnees: boolean;
  addressDetails?: { province?: string; ville?: string; commune?: string; quartier?: string; avenueRue?: string; numeroParcelle?: string; pointDeRepere?: string; latitude?: number; longitude?: number };
  identityDocuments?: Array<{ documentType: string; documentNumber: string; issueDate?: string; expirationDate?: string; isPrimary?: boolean }>;
  contacts?: Array<{ name: string; relationship?: string; phone: string; address?: string }>;
  insurance?: { insurerId?: string; insurerName?: string; policyNumber?: string; insuredCardNumber?: string; insuredStatus?: string; principalInsuredName?: string; relationshipToPrincipal?: string; subscribingEmployer?: string; coverageRate?: number; ceiling?: number; startDate?: string; endDate?: string };
  enterprise?: { legalName: string; rccm?: string; nationalId?: string; taxId?: string; representativeName: string; representativeFunction?: string; representativePhone: string; representativeDocumentNumber: string };
};

export type QuickCustomerRequest = { fullName: string; phone?: string; consentementDonnees: boolean };

export interface CustomerStatement {
  customer: Customer;
  currentBalanceCdf: number;
  availableCreditCdf: number;
  generatedAt?: string;
  purchases: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    totalCdf: number;
    creditCdf: number;
    items?: Array<{
      id?: string;
      productName: string;
      dci?: string;
      dosage?: string;
      galenicForm?: string;
      lotNumber?: string;
      expiryDate?: string;
      quantity: number;
      unitPriceCdf: number;
      totalLineCdf: number;
    }>;
  }>;
  payments: Array<{
    id: string;
    amountPaidCdf: number;
    currency: string;
    method: string;
    receiptReference?: string;
    createdAt: string;
    allocations: Array<{ saleId: string; invoiceNumber?: string; amountCdf: number }>;
  }>;
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

  createCustomer(dto: CustomerProfileRequest): Observable<Customer> {
    return this.client.post<Customer>('/customers', dto);
  }
  createQuickCustomer(dto: QuickCustomerRequest): Observable<Customer> { return this.client.post<Customer>('/customers/quick', dto); }

  updateCustomer(id: string, dto: CustomerProfileRequest): Observable<Customer> { return this.client.patch<Customer>(`/customers/${id}`, dto); }
  uploadProfilePhoto(id: string, file: File): Observable<{ hasPhoto: boolean }> {
    const form = new FormData(); form.append('file', file); return this.client.post<{ hasPhoto: boolean }>(`/customers/${id}/photo`, form);
  }
  getProfilePhoto(id: string): Observable<{ signedUrl: string; expiresAt: string; storageMode?: 'local' | 'supabase' }> { return this.client.get(`/customers/${id}/photo/signed-url`); }
  getProfilePhotoImage(id: string): Observable<Blob> { return this.client.getBlob(`/customers/${id}/photo/file`); }
  removeProfilePhoto(id: string): Observable<{ hasPhoto: boolean }> { return this.client.delete<{ hasPhoto: boolean }>(`/customers/${id}/photo`); }
  getInsurers(): Observable<Array<{ id: string; name: string }>> { return this.client.get<Array<{ id: string; name: string }>>('/customers/insurers'); }

  revealIdentityNumber(documentId: string): Observable<{ number: string }> {
    return this.client.get<{ number: string }>(`/customers/identity-documents/${documentId}/number`);
  }

  getIdentityScan(documentId: string): Observable<{ signedUrl: string; expiresAt: string; storageMode?: 'local' | 'supabase' }> {
    return this.client.get<{ signedUrl: string; expiresAt: string; storageMode?: 'local' | 'supabase' }>(`/customers/identity-documents/${documentId}/signed-url`);
  }

  getIdentityScanImage(documentId: string): Observable<Blob> {
    return this.client.getBlob(`/customers/identity-documents/${documentId}/file`);
  }

  deactivateCustomer(id: string): Observable<{ success: boolean }> {
    return this.client.patch<{ success: boolean }>(`/customers/${id}/deactivate`, {});
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

  downloadCustomerPdf(customerId: string, includeHistory = false): Observable<Blob> {
    return this.client.getBlob(`/customers/${customerId}/pdf?includeHistory=${includeHistory}`);
  }

  getPrescriptions(customerId: string): Observable<Array<{ id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string }>> {
    return this.client.get<Array<{ id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string }>>(`/customers/${customerId}/prescriptions`);
  }
}
