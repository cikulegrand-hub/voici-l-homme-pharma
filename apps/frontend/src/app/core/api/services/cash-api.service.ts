import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import { OpenCashSessionDto, CloseCashSessionDto, SetExchangeRateDto } from '../generated/models';
import { CashSession, ExchangeRate } from '@vhp/shared';

@Injectable({
  providedIn: 'root',
})
export class CashApiService {
  private readonly client = inject(BaseApiClient);

  getActiveSession(): Observable<CashSession | null> {
    return this.client.get<CashSession | null>('/cash/sessions/active');
  }

  openSession(dto: OpenCashSessionDto): Observable<CashSession> {
    return this.client.post<CashSession>('/cash/sessions/open', dto);
  }

  closeSession(sessionId: string, dto: CloseCashSessionDto): Observable<CashSession> {
    return this.client.patch<CashSession>(`/cash/sessions/${sessionId}/close`, dto);
  }

  addMovement(sessionId: string, dto: { type: string; amountCdf: number; amountUsd: number; reason: string }): Observable<any> {
    return this.client.post<any>(`/cash/sessions/${sessionId}/movements`, dto);
  }
  getMovements(sessionId: string): Observable<any[]> { return this.client.get<any[]>(`/cash/sessions/${sessionId}/movements`); }

  getActiveRate(at?: string): Observable<ExchangeRate> {
    const query = at ? `?at=${encodeURIComponent(at)}` : '';
    return this.client.get<ExchangeRate>(`/cash/exchange-rates/active${query}`);
  }

  setExchangeRate(dto: SetExchangeRateDto): Observable<ExchangeRate> {
    return this.client.post<ExchangeRate>('/cash/exchange-rates', dto);
  }

  getRatesHistory(): Observable<ExchangeRate[]> {
    return this.client.get<ExchangeRate[]>('/cash/exchange-rates/history');
  }

  getExpenses(params = ''): Observable<any[]> { return this.client.get<any[]>(`/cash/expenses${params}`); }
  createExpense(dto: { description: string; category: string; amountCdf: number; amountUsd?: number; receiptPath?: string }): Observable<any> { return this.client.post('/cash/expenses', dto); }
  uploadReceipt(expenseId: string, file: File): Observable<any> { const body = new FormData(); body.append('file', file); return this.client.post(`/cash/expenses/${expenseId}/receipt`, body); }
  getCategories(): Observable<any[]> { return this.client.get<any[]>('/cash/expense-categories'); }
  createCategory(dto: { name: string }): Observable<any> { return this.client.post('/cash/expense-categories', dto); }
  getPaymentSummary(): Observable<any[]> { return this.client.get<any[]>('/cash/payment-summary'); }
  getVarianceAlerts(): Observable<any[]> { return this.client.get<any[]>('/cash/alerts/variances'); }
  getReceivablesAging(): Observable<any> { return this.client.get('/cash/receivables-aging'); }
  getProfitability(): Observable<any> { return this.client.get('/cash/profitability'); }
}
