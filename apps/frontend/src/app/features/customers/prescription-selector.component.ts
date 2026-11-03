import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CustomersApiService } from '../../core/api/services/customers-api.service';

/** Sélecteur d'ordonnance réutilisable par la caisse (VTE-15 / CLI-06). */
@Component({
  selector: 'app-prescription-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="prescription-selector" *ngIf="customerId">
      <div class="selector-header">
        <span class="title">📋 Ordonnances du patient</span>
        <button type="button" class="btn-refresh" (click)="load()" [disabled]="loading">
          {{ loading ? 'Chargement...' : 'Actualiser' }}
        </button>
      </div>

      <p class="error-msg" *ngIf="error">{{ error }}</p>

      <div *ngIf="!loading && !prescriptions.length" class="empty-hint">
        <small>Aucune ordonnance enregistrée pour ce client.</small>
      </div>

      <ul class="prescription-list" *ngIf="prescriptions.length">
        <li *ngFor="let item of prescriptions" [class.selected]="selectedPrescriptionId === item.id">
          <div class="item-info">
            <strong>{{ item.prescriberName }}</strong>
            <span class="center" *ngIf="item.healthCenter">({{ item.healthCenter }})</span>
            <small class="date">Date: {{ item.prescriptionDate }}</small>
          </div>
          <div class="item-actions">
            <button type="button" class="btn-preview" (click)="preview(item.id)">👁️ Aperçu</button>
            <button type="button" class="btn-select" (click)="select(item)">
              {{ selectedPrescriptionId === item.id ? '✓ Sélectionnée' : 'Sélectionner' }}
            </button>
          </div>
        </li>
      </ul>

      <!-- Modal Aperçu sécurisé temporaire -->
      <div class="preview-backdrop" *ngIf="previewUrl || previewExpired">
        <div class="preview-dialog">
          <div class="dialog-header">
            <h5>Aperçu sécurisé d’ordonnance (Lien temporaire)</h5>
            <button type="button" class="close-btn" (click)="closePreview()">×</button>
          </div>
          <div class="dialog-body">
            <div *ngIf="previewUrl && !previewExpired" class="image-box">
              <img [src]="previewUrl" alt="Ordonnance médicale">
              <p class="timer-warning">⏳ Expire dans {{ remainingSeconds }} secondes. Ce document est strictement confidentiel.</p>
            </div>
            <div *ngIf="previewExpired" class="expired-alert">
              ⚠️ Le lien sécurisé a expiré. Veuillez demander un nouvel accès.
            </div>
          </div>
          <div class="dialog-footer">
            <button type="button" class="btn-secondary" (click)="closePreview()">Fermer</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .prescription-selector { background: #f8faf9; border: 1px solid #d5ded9; border-radius: 8px; padding: 12px; margin-top: 8px; }
    .selector-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .title { font-size: 13px; font-weight: 600; color: #116149; }
    .btn-refresh { background: none; border: 1px solid #cbd5d0; padding: 3px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; }
    .prescription-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    .prescription-list li { background: #fff; border: 1px solid #e2e8e5; border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; }
    .prescription-list li.selected { border-color: #116149; background: #f0fdf4; }
    .item-info { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .center { color: #555; font-size: 12px; }
    .date { color: #777; font-size: 11px; }
    .item-actions { display: flex; gap: 6px; }
    .btn-preview { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; }
    .btn-select { background: #116149; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; }
    .empty-hint { color: #6b7280; font-size: 12px; }
    .error-msg { color: #dc2626; font-size: 12px; }
    .preview-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1100; }
    .preview-dialog { background: white; border-radius: 8px; max-width: 500px; width: 90%; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; }
    .dialog-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
    .dialog-header h5 { margin: 0; font-size: 14px; font-weight: 600; }
    .close-btn { background: none; border: none; font-size: 20px; cursor: pointer; }
    .dialog-body { padding: 16px; overflow-y: auto; text-align: center; }
    .image-box img { max-width: 100%; max-height: 50vh; object-fit: contain; border: 1px solid #ddd; border-radius: 4px; }
    .timer-warning { font-size: 12px; color: #b45309; margin-top: 8px; }
    .expired-alert { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 12px; border-radius: 6px; font-size: 13px; }
    .dialog-footer { padding: 8px 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; }
    .btn-secondary { background: #e5e7eb; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
  `],
})
export class PrescriptionSelectorComponent implements OnChanges {
  private readonly api = inject(CustomersApiService);

  @Input() customerId?: string;
  @Input() selectedPrescriptionId?: string;
  @Output() selected = new EventEmitter<{ id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string }>();

  prescriptions: Array<{ id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string }> = [];
  loading = false;
  error = '';
  previewUrl = '';
  previewExpired = false;
  remainingSeconds = 0;
  private timerHandle: any;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['customerId'] && this.customerId) {
      this.load();
    }
  }

  load() {
    if (!this.customerId) return;
    this.loading = true;
    this.error = '';
    this.api.getPrescriptions(this.customerId).subscribe({
      next: (list) => {
        this.loading = false;
        this.prescriptions = list;
      },
      error: (e) => {
        this.loading = false;
        this.error = e.error?.message || 'Ordonnances indisponibles.';
      },
    });
  }

  select(item: { id: string; prescriberName: string; healthCenter?: string; prescriptionDate: string }) {
    this.selectedPrescriptionId = item.id;
    this.selected.emit(item);
  }

  preview(id: string) {
    this.closePreview();
    this.api.getPrescriptionPreview(id).subscribe({
      next: (res) => {
        this.previewUrl = res.signedUrl;
        this.previewExpired = false;
        const expiresAt = new Date(res.expiresAt).getTime();
        this.remainingSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

        clearInterval(this.timerHandle);
        this.timerHandle = setInterval(() => {
          this.remainingSeconds--;
          if (this.remainingSeconds <= 0) {
            clearInterval(this.timerHandle);
            this.previewUrl = '';
            this.previewExpired = true;
          }
        }, 1000);
      },
      error: (e) => {
        this.error = e.error?.message || 'Impossible de charger l’aperçu de l’ordonnance.';
      },
    });
  }

  closePreview() {
    this.previewUrl = '';
    this.previewExpired = false;
    clearInterval(this.timerHandle);
  }
}
