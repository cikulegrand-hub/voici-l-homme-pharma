import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SuppliersApiService } from '../../core/api/services/suppliers-api.service';
import { AlertService } from '../../core/services/alert.service';
import { Supplier } from '@vhp/shared';

@Component({
  selector: 'app-supplier-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <h2 mat-dialog-title>
          @if (isEdit) {
            Modifier la fiche fournisseur
          } @else {
            Nouveau fournisseur
          }
        </h2>
        <button mat-icon-button mat-dialog-close class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content class="dialog-content">
        <form #supplierForm="ngForm" class="supplier-form">
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Raison sociale / Nom du fournisseur *</mat-label>
            <input
              matInput
              [(ngModel)]="name"
              name="name"
              required
              placeholder="Ex: Laboratoires Kin-Pharma"
            />
          </mat-form-field>

          <div class="form-row">
            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>Personne de contact</mat-label>
              <input
                matInput
                [(ngModel)]="contactName"
                name="contactName"
                placeholder="Ex: Dr. Jean Dupont"
              />
            </mat-form-field>

            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>Téléphone</mat-label>
              <input
                matInput
                [(ngModel)]="phone"
                name="phone"
                placeholder="+243 81 000 0000"
              />
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>Email commercial</mat-label>
              <input
                matInput
                type="email"
                [(ngModel)]="email"
                name="email"
                placeholder="commandes@fournisseur.cd"
              />
            </mat-form-field>

            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>Délai de livraison moyen (jours)</mat-label>
              <input
                matInput
                type="number"
                min="0"
                [(ngModel)]="leadTimeDays"
                name="leadTimeDays"
                placeholder="Ex: 5"
              />
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Conditions de paiement</mat-label>
            <input
              matInput
              [(ngModel)]="paymentTerms"
              name="paymentTerms"
              placeholder="Ex: 50% à la commande, solde à 30 jours fin de mois"
            />
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Adresse physique / Dépôt</mat-label>
            <textarea
              matInput
              rows="2"
              [(ngModel)]="address"
              name="address"
              placeholder="Avenue du Commerce, Limete Industriel, Kinshasa"
            ></textarea>
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-full" *ngIf="isEdit">
            <mat-label>Statut du compte fournisseur</mat-label>
            <mat-select [(ngModel)]="isActive" name="isActive">
              <mat-option [value]="true">Actif (autorisé pour les commandes)</mat-option>
              <mat-option [value]="false">Inactif (archivé / suspendu)</mat-option>
            </mat-select>
          </mat-form-field>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button mat-dialog-close [disabled]="saving()">Annuler</button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="!name.trim() || saving()"
          (click)="save()"
        >
          @if (saving()) {
            <mat-spinner diameter="18" class="inline-spinner"></mat-spinner>
            <span>Enregistrement...</span>
          } @else if (isEdit) {
            <span>Mettre à jour</span>
          } @else {
            <span>Créer le fournisseur</span>
          }
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      width: 100%;
      max-width: 600px;
    }
    @media (max-width: 600px) {
      .form-row {
        flex-direction: column;
      }
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid #e0e0e0;
    }
    .dialog-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }
    .dialog-content {
      padding: 24px !important;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .supplier-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .form-row {
      display: flex;
      gap: 16px;
    }
    .w-full {
      width: 100%;
    }
    .flex-1 {
      flex: 1;
    }
    .dialog-actions {
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
    }
    .inline-spinner {
      display: inline-block;
      margin-right: 8px;
    }
  `],
})
export class SupplierDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<SupplierDialogComponent>);
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly alert = inject(AlertService);

  isEdit = false;
  supplierId = '';
  name = '';
  contactName = '';
  phone = '';
  email = '';
  address = '';
  paymentTerms = 'Comptant à la livraison';
  leadTimeDays = 3;
  isActive = true;

  readonly saving = signal(false);

  constructor(@Inject(MAT_DIALOG_DATA) public data?: { supplier?: Supplier }) {}

  ngOnInit() {
    if (this.data?.supplier) {
      this.isEdit = true;
      const s = this.data.supplier;
      this.supplierId = s.id;
      this.name = s.name;
      this.contactName = s.contactName || '';
      this.phone = s.phone || '';
      this.email = s.email || '';
      this.address = s.address || '';
      this.paymentTerms = s.paymentTerms || '';
      this.leadTimeDays = s.leadTimeDays ?? 3;
      this.isActive = s.isActive ?? true;
    }
  }

  save() {
    if (!this.name.trim()) return;

    this.saving.set(true);
    const payload: any = {
      name: this.name.trim(),
      contactName: this.contactName.trim() || undefined,
      phone: this.phone.trim() || undefined,
      email: this.email.trim() || undefined,
      address: this.address.trim() || undefined,
      paymentTerms: this.paymentTerms.trim() || undefined,
      leadTimeDays: Number(this.leadTimeDays) || 0,
    };

    if (this.isEdit) {
      payload.isActive = this.isActive;
      this.suppliersApi.updateSupplier(this.supplierId, payload).subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.alert.success('Fournisseur mis à jour avec succès.');
          this.dialogRef.close(updated);
        },
        error: (err) => {
          this.saving.set(false);
          this.alert.error(err.error?.message || 'Erreur lors de la mise à jour.');
        },
      });
    } else {
      this.suppliersApi.createSupplier(payload).subscribe({
        next: (created) => {
          this.saving.set(false);
          this.alert.success('Fournisseur créé avec succès.');
          this.dialogRef.close(created);
        },
        error: (err) => {
          this.saving.set(false);
          this.alert.error(err.error?.message || 'Erreur lors de la création.');
        },
      });
    }
  }
}

