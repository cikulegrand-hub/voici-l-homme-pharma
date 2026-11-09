import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomersApiService } from '../../core/api/services/customers-api.service';

/** Formulaire compact réutilisable depuis la caisse (CLI-02 / VTE-15 / CLI-10). */
@Component({
  selector: 'app-quick-customer-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="quick-customer-dialog">
      <div class="dialog-header">
        <h4>Nouveau client rapide</h4>
        <button type="button" class="close-btn" (click)="cancelled.emit()">×</button>
      </div>

      <div class="privacy-banner" *ngIf="privacyNotice">
        <span class="icon">🔒</span>
        <small>{{ privacyNotice }}</small>
      </div>

      <form (ngSubmit)="save()">
        <div class="form-group">
          <label for="qc-name">Nom complet *</label>
          <input id="qc-name" required [(ngModel)]="model.fullName" name="fullName" placeholder="Ex: M. Pierre Mukendi" class="form-control">
        </div>
        <label class="consent-line"><input type="checkbox" required [(ngModel)]="model.consentementDonnees" name="consentementDonnees"> Le client consent à la collecte de ses données.</label>

        <div class="form-group">
          <label for="qc-phone">Téléphone <span class="optional">(facultatif)</span></label>
          <input id="qc-phone" [(ngModel)]="model.phone" name="phone" placeholder="+243..." class="form-control">
        </div>
        <div class="quick-help">Ce formulaire est réservé aux particuliers qui paient directement au comptoir. Pour une Assurance ou une Entreprise, recherchez la fiche déjà enregistrée.</div>
        <div class="form-group">
          <label>Type de client</label>
          <div class="fixed-type">Particulier</div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn-cancel" (click)="cancelled.emit()">Annuler</button>
          <button type="submit" class="btn-primary" [disabled]="saving || !model.fullName.trim() || !model.consentementDonnees">
            <span *ngIf="saving">Création en cours...</span>
            <span *ngIf="!saving">Créer et sélectionner</span>
          </button>
        </div>

        <p class="error-msg" *ngIf="error">{{ error }}</p>
      </form>
    </div>
  `,
  styles: [`
    .quick-customer-dialog { background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #d0d7d3; max-width: 440px; width: 100%; box-sizing: border-box; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .dialog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .dialog-header h4 { margin: 0; color: #116149; font-size: 16px; font-weight: 600; }
    .close-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: #666; line-height: 1; }
    .privacy-banner { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 8px; margin-bottom: 12px; color: #065f46; font-size: 11px; display: flex; gap: 6px; align-items: flex-start; }
    .form-group { margin-bottom: 12px; }
    .form-group label { display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #374151; }
    .optional { font-weight: 400; color: #6b7280; }
    .quick-help { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 6px; padding: 8px; margin: 8px 0 12px; font-size: 11px; line-height: 1.4; }
    .fixed-type { padding: 8px; background: #f3f4f6; border-radius: 4px; color: #374151; font-size: 13px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .form-control { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #cbd5d0; border-radius: 4px; font-size: 13px; }
    .form-control:focus { outline: none; border-color: #116149; }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .btn-primary { background: #116149; color: white; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-cancel { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .error-msg { color: #dc2626; font-size: 12px; margin-top: 8px; }
    @media (max-width: 480px) {
      .form-actions { flex-direction: column; }
      .form-actions button { width: 100%; }
    }
  `],
})
export class QuickCustomerFormComponent implements OnInit {
  private readonly api = inject(CustomersApiService);
  @Output() created = new EventEmitter<any>();
  @Output() cancelled = new EventEmitter<void>();

  saving = false;
  error = '';
  privacyNotice = '';
  model = { fullName: '', phone: '', consentementDonnees: false };

  ngOnInit() {
    this.api.getPrivacyNotice().subscribe({
      next: (res) => (this.privacyNotice = res.text),
      error: () => {},
    });
  }

  save() {
    if (!this.model.fullName.trim()) return;
    this.saving = true;
    this.error = '';
    this.api.createQuickCustomer(this.model).subscribe({
      next: (customer) => {
        this.saving = false;
        this.created.emit(customer);
      },
      error: (e) => {
        this.saving = false;
        this.error = e.error?.message || 'Création impossible.';
      },
    });
  }
}
