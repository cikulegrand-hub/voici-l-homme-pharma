import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { ProductAutocompleteComponent } from '../../shared/components/product-autocomplete/product-autocomplete.component';
import { ProductAutocompleteItem } from '@vhp/shared';

export interface CreateInventoryDialogResult {
  type: 'COMPLET' | 'TOURNANT';
  notes?: string;
  productIds?: string[];
}

@Component({
  selector: 'app-create-inventory-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatIconModule,
    ProductAutocompleteComponent,
  ],
  template: `
    <h2 mat-dialog-title>Nouvel inventaire (STK-11)</h2>
    <mat-dialog-content>
      <mat-radio-group [(ngModel)]="type" class="type-group">
        <mat-radio-button value="COMPLET">Complet (tous les lots)</mat-radio-button>
        <mat-radio-button value="TOURNANT">Tournant (sélection de produits)</mat-radio-button>
      </mat-radio-group>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Notes</mat-label>
        <input matInput [(ngModel)]="notes" placeholder="Rayon B, inventaire mensuel…" />
      </mat-form-field>

      @if (type === 'TOURNANT') {
        <app-product-autocomplete
          placeholder="Ajouter un produit à compter…"
          (productSelected)="addProduct($event)"
        ></app-product-autocomplete>
        <ul class="picked">
          @for (p of products(); track p.id) {
            <li>
              {{ p.name }}
              <button mat-icon-button (click)="removeProduct(p.id)"><mat-icon>close</mat-icon></button>
            </li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Annuler</button>
      <button mat-flat-button color="primary" [disabled]="!canCreate()" (click)="confirm()">Créer</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .type-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .w-full { width: 100%; }
    .picked { list-style: none; padding: 0; }
    .picked li { display: flex; align-items: center; justify-content: space-between; }
  `],
})
export class CreateInventoryDialogComponent {
  readonly dialogRef = inject(MatDialogRef<CreateInventoryDialogComponent, CreateInventoryDialogResult>);
  type: 'COMPLET' | 'TOURNANT' = 'COMPLET';
  notes = '';
  readonly products = signal<ProductAutocompleteItem[]>([]);

  addProduct(item: ProductAutocompleteItem) {
    if (this.products().some((p) => p.id === item.id)) return;
    this.products.set([...this.products(), item]);
  }

  removeProduct(id: string) {
    this.products.set(this.products().filter((p) => p.id !== id));
  }

  canCreate(): boolean {
    return this.type === 'COMPLET' || this.products().length > 0;
  }

  confirm() {
    this.dialogRef.close({
      type: this.type,
      notes: this.notes.trim() || undefined,
      productIds: this.type === 'TOURNANT' ? this.products().map((p) => p.id) : undefined,
    });
  }
}
