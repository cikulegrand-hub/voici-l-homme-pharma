import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  SyncStatus,
  OfflineSalePayload,
  OfflineSyncBatchRequest,
  OfflineSyncBatchResult,
  Product,
} from '@vhp/shared';

const DB_NAME = 'vhp_pos_offline_v2';
const DB_VERSION = 1;
const STORE_SALES = 'offline_sales';
const STORE_CATALOG = 'offline_catalog';
const STORE_SETTINGS = 'offline_settings';

@Injectable({
  providedIn: 'root',
})
export class OfflineSyncService {
  private readonly http = inject(HttpClient);
  private db: IDBDatabase | null = null;
  private isDbReady = false;

  readonly isOnline = signal<boolean>(navigator.onLine);
  readonly syncStatus = signal<SyncStatus>(navigator.onLine ? 'SYNCHRONISE' : 'LOCAL');
  readonly isSyncing = signal<boolean>(false);
  readonly pendingSalesCount = signal<number>(0);
  readonly lastSyncResult = signal<OfflineSyncBatchResult | null>(null);

  readonly connectionLabel = computed(() => {
    if (this.isSyncing()) return 'Synchronisation en cours...';
    if (!this.isOnline()) return 'Hors-ligne';
    if (this.pendingSalesCount() > 0) return `${this.pendingSalesCount()} vente(s) à synchroniser`;
    return 'En ligne';
  });

  constructor() {
    this.initDatabase().then(() => {
      this.refreshPendingCount();
    });

    window.addEventListener('online', () => {
      this.isOnline.set(true);
      this.syncStatus.set('EN_ATTENTE');
      this.autoSyncIfOnline();
    });

    window.addEventListener('offline', () => {
      this.isOnline.set(false);
      this.syncStatus.set('LOCAL');
    });
  }

  private async initDatabase(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        resolve(null as any);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_SALES)) {
          const salesStore = db.createObjectStore(STORE_SALES, { keyPath: 'idempotencyKey' });
          salesStore.createIndex('syncStatus', 'syncStatus', { unique: false });
          salesStore.createIndex('localCreatedAt', 'localCreatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_CATALOG)) {
          const catalogStore = db.createObjectStore(STORE_CATALOG, { keyPath: 'id' });
          catalogStore.createIndex('name', 'name', { unique: false });
          catalogStore.createIndex('dci', 'dci', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.isDbReady = true;
        resolve(this.db);
      };

      request.onerror = (err) => {
        console.error('[OfflineSyncService] Erreur ouverture IndexedDB:', err);
        reject(err);
      };
    });
  }

  async refreshPendingCount(): Promise<number> {
    const pending = await this.getPendingSales();
    this.pendingSalesCount.set(pending.length);
    if (!this.isOnline()) {
      this.syncStatus.set('LOCAL');
    } else if (pending.length > 0) {
      this.syncStatus.set('EN_ATTENTE');
    } else {
      this.syncStatus.set('SYNCHRONISE');
    }
    return pending.length;
  }

  async saveOfflineSale(sale: OfflineSalePayload): Promise<void> {
    const db = await this.initDatabase();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SALES], 'readwrite');
      const store = tx.objectStore(STORE_SALES);
      const req = store.put({
        ...sale,
        syncStatus: 'EN_ATTENTE',
        savedLocallyAt: new Date().toISOString(),
      });

      req.onsuccess = () => {
        this.refreshPendingCount();
        resolve();
      };
      req.onerror = (err) => reject(err);
    });
  }

  async getPendingSales(): Promise<OfflineSalePayload[]> {
    const db = await this.initDatabase();
    if (!db) return [];

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SALES], 'readonly');
      const store = tx.objectStore(STORE_SALES);
      const req = store.getAll();

      req.onsuccess = () => {
        const sales = (req.result || []) as (OfflineSalePayload & { syncStatus: SyncStatus })[];
        const filtered = sales.filter((s) => s.syncStatus === 'EN_ATTENTE' || s.syncStatus === 'LOCAL' || s.syncStatus === 'CONFLIT');
        resolve(filtered);
      };
      req.onerror = (err) => reject(err);
    });
  }

  async removeOfflineSale(idempotencyKey: string): Promise<void> {
    const db = await this.initDatabase();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SALES], 'readwrite');
      const store = tx.objectStore(STORE_SALES);
      const req = store.delete(idempotencyKey);
      req.onsuccess = () => {
        this.refreshPendingCount();
        resolve();
      };
      req.onerror = (err) => reject(err);
    });
  }

  async cacheCatalog(products: Product[]): Promise<void> {
    const db = await this.initDatabase();
    if (!db || !products?.length) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CATALOG], 'readwrite');
      const store = tx.objectStore(STORE_CATALOG);
      for (const prod of products) {
        store.put(prod);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = (err) => reject(err);
    });
  }

  async searchOfflineCatalog(query: string): Promise<Product[]> {
    const db = await this.initDatabase();
    if (!db || !query?.trim()) return [];

    const q = query.trim().toLowerCase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CATALOG], 'readonly');
      const store = tx.objectStore(STORE_CATALOG);
      const req = store.getAll();

      req.onsuccess = () => {
        const all = (req.result || []) as Product[];
        const matched = all.filter((p) => {
          const matchName = p.name?.toLowerCase().includes(q);
          const matchDci = p.dci?.toLowerCase().includes(q);
          const matchLaboratory = (p as any).laboratory?.toLowerCase()?.includes(q);
          const matchBarcode = (p as any).barcodes?.some((b: string) => b.includes(q));
          return matchName || matchDci || matchLaboratory || matchBarcode;
        });
        resolve(matched.slice(0, 15));
      };
      req.onerror = (err) => reject(err);
    });
  }

  async autoSyncIfOnline(): Promise<void> {
    if (!this.isOnline() || this.isSyncing()) return;
    const pending = await this.getPendingSales();
    if (!pending.length) return;

    await this.synchronizeNow();
  }

  async synchronizeNow(): Promise<OfflineSyncBatchResult | null> {
    if (this.isSyncing() || !this.isOnline()) return null;

    const pending = await this.getPendingSales();
    if (!pending.length) return null;

    this.isSyncing.set(true);
    this.syncStatus.set('SYNCHRONISATION');

    const batchRequest: OfflineSyncBatchRequest = {
      sales: pending.map((s: OfflineSalePayload) => ({
        idempotencyKey: s.idempotencyKey,
        userId: s.userId,
        pharmacyId: s.pharmacyId,
        cashSessionId: s.cashSessionId,
        customerId: s.customerId,
        currency: s.currency,
        offlineExchangeRate: s.exchangeRateIndicative,
        offlineCreatedAt: s.localCreatedAt,
        items: s.items.map((it: any) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPriceCdf: it.unitPriceCdf,
          discountCdf: it.discountCdf,
          lotId: it.lotId,
        })),
        amountPaid: s.amountPaid,
        changeGivenCdf: s.changeGivenCdf,
      })),
    };

    try {
      const result = await firstValueFrom(
        this.http.post<OfflineSyncBatchResult>('/api/v1/sales/sync', batchRequest),
      );

      this.lastSyncResult.set(result);

      for (const itemResult of result.results) {
        if (itemResult.status === 'SYNCHRONISE') {
          await this.removeOfflineSale(itemResult.idempotencyKey);
        } else if (itemResult.status === 'CONFLIT') {
          // Marquer en conflit localement pour que le vendeur soit alerté
          const db = await this.initDatabase();
          if (db) {
            const tx = db.transaction([STORE_SALES], 'readwrite');
            const store = tx.objectStore(STORE_SALES);
            const getReq = store.get(itemResult.idempotencyKey);
            getReq.onsuccess = () => {
              if (getReq.result) {
                const updated = {
                  ...getReq.result,
                  syncStatus: 'CONFLIT',
                  conflictDetails: itemResult.conflictDetails,
                  errorMessage: itemResult.errorMessage,
                };
                store.put(updated);
              }
            };
          }
        }
      }

      await this.refreshPendingCount();
      return result;
    } catch (err) {
      console.error('[OfflineSyncService] Erreur lors de la synchronisation par lot:', err);
      this.syncStatus.set('LOCAL');
      return null;
    } finally {
      this.isSyncing.set(false);
    }
  }
}
