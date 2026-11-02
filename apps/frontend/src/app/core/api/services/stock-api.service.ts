import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import {
  ProductLot,
  StockMovement,
  PaginatedResult,
  PendingAdjustment,
  StockAlertsSummary,
  CumpValuationSummary,
  ControlledSubstanceRegisterEntry,
  InventorySession,
  MovementType,
} from '@vhp/shared';

export interface ProductStockSummary {
  productId: string;
  productName: string;
  totalStock: number;
  totalAvailable: number;
  cumpCdf: number;
  cumpUsd: number;
  lots: ProductLot[];
}

export interface CreateLotDto {
  productId: string;
  lotNumber: string;
  expiryDate: string;
  initialQuantity?: number;
  quantity?: number;
  purchasePriceCdf: number;
  purchasePriceUsd?: number;
}

export interface DirectReceptionLineDto {
  productId: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePriceCdf: number;
  purchasePriceUsd?: number;
}

export interface DirectReceptionDto {
  idempotencyKey?: string;
  supplierId?: string;
  supplierInvoiceNumber?: string;
  notes?: string;
  lines: DirectReceptionLineDto[];
}

export interface CreateMovementDto {
  lotId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  referenceId?: string;
}

export interface RequestAdjustmentDto {
  lotId: string;
  variance?: number;
  quantityDifference?: number;
  reason: string;
}

export interface ApproveAdjustmentDto {
  action: 'APPROVE' | 'REJECT';
  pharmacistComment?: string;
  approved?: boolean;
  pinCode?: string;
}

export interface QuarantineLotDto {
  quarantined: boolean;
  reason: string;
}

export interface CreateInventoryDto {
  reference?: string;
  type?: 'COMPLET' | 'TOURNANT';
  notes?: string;
  productIds?: string[];
  lines?: { lotId: string; countedQuantity: number; justification?: string }[];
}

export interface ValidateInventoryDto {
  justification?: string;
  validationComment?: string;
  pinCode?: string;
}

export interface StockMovementQueryDto {
  lotId?: string;
  productId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

@Injectable({
  providedIn: 'root',
})
export class StockApiService {
  private readonly client = inject(BaseApiClient);

  // ==========================================
  // STOCKS & LOTS (STK-01, STK-02)
  // ==========================================

  getProductStock(productId: string): Observable<ProductStockSummary> {
    return this.client.get<ProductStockSummary>(`/stock/products/${productId}`);
  }

  getLots(productId?: string): Observable<ProductLot[]> {
    return this.client.get<ProductLot[]>('/stock/lots', { params: productId ? { productId } : {} });
  }

  createLot(dto: CreateLotDto): Observable<ProductLot> {
    return this.client.post<ProductLot>('/stock/lots', dto);
  }

  // ==========================================
  // RÉCEPTIONS DIRECTES & IDEMPOTENCE (STK-01, RG-14)
  // ==========================================

  directReception(dto: DirectReceptionDto): Observable<any> {
    return this.client.post<any>('/stock/reception/direct', dto);
  }

  // ==========================================
  // FEFO (STK-03, RG-03)
  // ==========================================

  simulateFefo(dto: { productId: string; quantity: number }): Observable<any> {
    return this.client.post<any>('/stock/fefo/simulate', {
      items: [{ productId: dto.productId, quantity: dto.quantity }],
    });
  }

  // ==========================================
  // MOUVEMENTS & SORTIES (STK-06, RG-06)
  // ==========================================

  getMovements(query?: StockMovementQueryDto): Observable<PaginatedResult<StockMovement>> {
    return this.client.get<PaginatedResult<StockMovement>>('/stock/movements', { params: query || {} });
  }

  createMovement(dto: CreateMovementDto): Observable<StockMovement> {
    return this.client.post<StockMovement>('/stock/movements', dto);
  }

  // ==========================================
  // AJUSTEMENTS & VALIDATION PHARMACIEN (RG-11)
  // ==========================================

  requestAdjustment(dto: RequestAdjustmentDto): Observable<any> {
    return this.client.post<any>('/stock/adjustments/request', dto);
  }

  getPendingAdjustments(): Observable<PendingAdjustment[]> {
    return this.client.get<PendingAdjustment[]>('/stock/adjustments/pending');
  }

  approveAdjustment(id: string, dto: ApproveAdjustmentDto): Observable<any> {
    return this.client.post<any>(`/stock/adjustments/${id}/approve`, dto);
  }

  // ==========================================
  // QUARANTAINE (STK-04, RG-03)
  // ==========================================

  quarantineLot(lotId: string, dto: QuarantineLotDto): Observable<any> {
    return this.client.patch<any>(`/stock/lots/${lotId}/quarantine`, dto);
  }

  // ==========================================
  // ALERTES, VALORISATION & REGISTRE (STK-08, STK-10, STK-14)
  // ==========================================

  getAlerts(): Observable<StockAlertsSummary> {
    return this.client.get<StockAlertsSummary>('/stock/alerts');
  }

  getCumpValuation(): Observable<CumpValuationSummary> {
    return this.client.get<CumpValuationSummary>('/stock/valuation/cump');
  }

  getControlledRegister(query?: { startDate?: string; endDate?: string }): Observable<ControlledSubstanceRegisterEntry[]> {
    return this.client.get<ControlledSubstanceRegisterEntry[]>('/stock/controlled-register', { params: query || {} });
  }

  // ==========================================
  // INVENTAIRE (STK-11, STK-12)
  // ==========================================

  getInventories(status?: string): Observable<InventorySession[]> {
    return this.client.get<InventorySession[]>('/stock/inventories', { params: status ? { status } : {} });
  }

  getInventoryById(id: string): Observable<InventorySession> {
    return this.client.get<InventorySession>(`/stock/inventories/${id}`);
  }

  createInventory(dto: CreateInventoryDto): Observable<InventorySession> {
    return this.client.post<InventorySession>('/stock/inventories', dto);
  }

  recordInventoryCount(
    id: string,
    dto: { lotId: string; countedQuantity: number; justification?: string },
  ): Observable<any> {
    return this.client.post<any>(`/stock/inventories/${id}/counts`, dto);
  }

  validateInventory(id: string, dto: ValidateInventoryDto): Observable<any> {
    return this.client.post<any>(`/stock/inventories/${id}/validate`, dto);
  }

  cancelInventory(id: string, reason: string): Observable<any> {
    return this.client.post<any>(`/stock/inventories/${id}/cancel`, { reason });
  }
}
