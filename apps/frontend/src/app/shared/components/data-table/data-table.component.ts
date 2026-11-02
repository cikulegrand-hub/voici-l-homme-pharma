import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { LoadingStateComponent } from '../loading-state/loading-state.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  type?: 'text' | 'number' | 'date' | 'currency' | 'badge';
  currencyCode?: 'CDF' | 'USD';
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    LoadingStateComponent,
    EmptyStateComponent,
  ],
  template: `
    <!-- Barre de recherche -->
    <div class="table-toolbar" *ngIf="filterable">
      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Rechercher...</mat-label>
        <input matInput [(ngModel)]="filterValue" (input)="applyFilter()" placeholder="Rechercher...">
        <mat-icon matPrefix>search</mat-icon>
      </mat-form-field>
    </div>

    <!-- État de chargement -->
    <app-loading-state *ngIf="loading"></app-loading-state>

    <!-- État vide -->
    <app-empty-state
      *ngIf="!loading && dataSource.data.length === 0"
      [title]="emptyTitle"
      [description]="emptyDescription"
      [icon]="emptyIcon"
    ></app-empty-state>

    <!-- Tableau -->
    <div class="table-container" *ngIf="!loading && dataSource.data.length > 0">
      <table mat-table [dataSource]="dataSource" matSort class="full-width-table">
        @for (col of columns; track col.key) {
          <ng-container [matColumnDef]="col.key">
            <th mat-header-cell *matHeaderCellDef [mat-sort-header]="col.sortable !== false ? '' : ''" [disabled]="col.sortable === false">
              {{ col.label }}
            </th>
            <td mat-cell *matCellDef="let row">
              <ng-container [ngSwitch]="col.type">
                <span *ngSwitchCase="'number'">{{ row[col.key] | number:'1.0-0':'fr-FR' }}</span>
                <span *ngSwitchCase="'currency'">
                  {{ row[col.key] | number:'1.0-2':'fr-FR' }} {{ col.currencyCode || 'CDF' }}
                </span>
                <span *ngSwitchCase="'date'">{{ row[col.key] | date:'dd/MM/yyyy':'':'fr' }}</span>
                <span *ngSwitchDefault>{{ row[col.key] }}</span>
              </ng-container>
            </td>
          </ng-container>
        }

        <!-- Colonne actions -->
        <ng-container matColumnDef="actions" *ngIf="showActions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let row">
            <ng-content select="[table-actions]"></ng-content>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            [class.clickable-row]="rowClickable"
            (click)="onRowClick(row)"></tr>
      </table>

      <mat-paginator
        [pageSizeOptions]="pageSizeOptions"
        [pageSize]="pageSize"
        showFirstLastButtons
      ></mat-paginator>
    </div>
  `,
  styles: [`
    .table-toolbar {
      margin-bottom: 16px;
    }

    .search-field {
      width: 100%;
      max-width: 400px;
    }

    .table-container {
      overflow-x: auto;
    }

    .full-width-table {
      width: 100%;
    }

    .clickable-row {
      cursor: pointer;
    }

    .clickable-row:hover {
      background-color: #f8f9fa;
    }

    th.mat-header-cell {
      font-weight: 600;
      color: var(--vhp-text-primary, #202124);
    }
  `],
})
export class DataTableComponent implements AfterViewInit, OnChanges {
  @Input() columns: DataTableColumn[] = [];
  @Input() data: any[] = [];
  @Input() loading = false;
  @Input() filterable = true;
  @Input() showActions = false;
  @Input() rowClickable = false;
  @Input() pageSize = 20;
  @Input() pageSizeOptions = [10, 20, 50, 100];
  @Input() emptyTitle = 'Aucune donnée disponible';
  @Input() emptyDescription = '';
  @Input() emptyIcon = 'inbox';

  @Output() rowClick = new EventEmitter<any>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  dataSource = new MatTableDataSource<any>([]);
  filterValue = '';

  get displayedColumns(): string[] {
    const cols = this.columns.map((c) => c.key);
    if (this.showActions) {
      cols.push('actions');
    }
    return cols;
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.dataSource.data = this.data || [];
    }
  }

  applyFilter(): void {
    this.dataSource.filter = this.filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  onRowClick(row: any): void {
    if (this.rowClickable) {
      this.rowClick.emit(row);
    }
  }
}

