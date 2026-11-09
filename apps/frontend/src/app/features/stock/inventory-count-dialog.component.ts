import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InventoryLine, InventorySession } from '@vhp/shared';
import { StockApiService } from '../../core/api/services/stock-api.service';
import { AlertService } from '../../core/services/alert.service';

@Component({
  selector: 'app-inventory-count-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Comptage {{ session.reference }} ({{ session.type || 'COMPLET' }})</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Scan / recherche lot ou produit</mat-label>
        <input matInput [(ngModel)]="scan" (ngModelChange)="filterLines()" />
      </mat-form-field>

      @if (loading()) {
        <mat-spinner diameter="32"></mat-spinner>
      } @else {
        <div class="table-container">
        <table class="count-table">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Lot</th>
              <th>Système</th>
              <th>Compté</th>
              <th>Écart</th>
              <th>Justification</th>
            </tr>
          </thead>
          <tbody>
            @for (line of filtered(); track line.lotId) {
              <tr [class.large]="isLarge(line)">
                <td>{{ line.productName }}</td>
                <td>{{ line.lotNumber }}</td>
                <td>{{ line.systemQuantity }}</td>
                <td>
                  <input type="number" min="0" class="qty" [(ngModel)]="line.countedQuantity" (ngModelChange)="recalc(line)" />
                </td>
                <td>{{ line.variance }}</td>
                <td>
                  <input
                    type="text"
                    class="just"
                    [(ngModel)]="line.justification"
                    [placeholder]="isLarge(line) ? 'Obligatoire' : 'Optionnel'"
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)" [disabled]="saving()">Fermer</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="saving() || !canSave()">
        Enregistrer les comptages
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .w-full { width: 100%; }
    .table-container { overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%; }
    .count-table { width: 100%; min-width: 520px; border-collapse: collapse; font-size: 0.85rem; }
    .count-table th, .count-table td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
    .qty { width: 72px; }
    .just { width: 140px; }
    tr.large { background: #fff7ed; }
  `],
})
export class InventoryCountDialogComponent implements OnInit {
  private readonly api = inject(StockApiService);
  private readonly alert = inject(AlertService);
  readonly dialogRef = inject(MatDialogRef<InventoryCountDialogComponent>);
  readonly loading = signal(true);
  readonly saving = signal(false);
  scan = '';
  session!: InventorySession;
  lines: InventoryLine[] = [];
  filteredLines: InventoryLine[] = [];

  constructor(@Inject(MAT_DIALOG_DATA) public data: { inventoryId: string }) {}

  ngOnInit() {
    this.api.getInventoryById(this.data.inventoryId).subscribe({
      next: (inv) => {
        this.session = inv;
        this.lines = (inv.lines || []).map((l) => ({ ...l }));
        this.filteredLines = this.lines;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  filtered() {
    return this.filteredLines;
  }

  filterLines() {
    const q = this.scan.trim().toLowerCase();
    this.filteredLines = !q
      ? this.lines
      : this.lines.filter(
          (l) =>
            (l.lotNumber || '').toLowerCase().includes(q) ||
            (l.productName || '').toLowerCase().includes(q),
        );
  }

  recalc(line: InventoryLine) {
    line.variance = Number(line.countedQuantity) - Number(line.systemQuantity);
  }

  isLarge(line: InventoryLine): boolean {
    const abs = Math.abs(line.variance || 0);
    const pct = Math.max(5, Math.ceil(Math.abs(line.systemQuantity) * 0.1));
    return abs >= pct;
  }

  canSave(): boolean {
    return this.lines.every((l) => !this.isLarge(l) || !!l.justification?.trim());
  }

  save() {
    if (!this.canSave()) {
      this.alert.warning('Justifiez les écarts importants avant d’enregistrer.');
      return;
    }
    this.saving.set(true);
    const pending = this.lines.map((l) =>
      this.api.recordInventoryCount(this.data.inventoryId, {
        lotId: l.lotId,
        countedQuantity: Number(l.countedQuantity),
        justification: l.justification?.trim() || undefined,
      }),
    );
    let remaining = pending.length;
    if (remaining === 0) {
      this.dialogRef.close(true);
      return;
    }
    pending.forEach((obs) =>
      obs.subscribe({
        next: () => {
          remaining -= 1;
          if (remaining === 0) {
            this.saving.set(false);
            this.alert.success('Comptages enregistrés.');
            this.dialogRef.close(true);
          }
        },
        error: (err) => {
          this.saving.set(false);
          this.alert.error(err.error?.message || 'Erreur de saisie du comptage.');
        },
      }),
    );
  }
}
