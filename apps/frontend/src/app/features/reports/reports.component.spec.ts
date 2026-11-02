import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ReportsComponent } from './reports.component';
import { ReportsApiService } from '../../core/api/services/reports-api.service';
import { AuthService } from '../../core/auth/auth.service';

describe('ReportsComponent (RPT-08/RPT-10)', () => {
  let component: ReportsComponent;
  let fixture: ComponentFixture<ReportsComponent>;
  let api: jasmine.SpyObj<ReportsApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ReportsApiService>('ReportsApiService', ['getReport', 'downloadExport']);
    api.getReport.and.returnValue(of({ reportKey: 'sales-journal', filters: {} as any, data: [], totals: { rowCount: 0, isEmpty: true } }));
    api.downloadExport.and.returnValue(of(new Blob()));
    const auth = jasmine.createSpyObj<AuthService>('AuthService', [], { userRole: signal('ADMIN') });

    await TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [
        { provide: ReportsApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ reportKey: 'sales-journal' })) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('charge le rapport et conserve les filtres communs lors du rechargement', () => {
    expect(api.getReport).toHaveBeenCalledWith('sales-journal', { period: 'day', page: 1, limit: 50, sortBy: 'createdAt', sortDirection: 'desc' });
    component.userId.set('user-1');
    component.categoryId.set('category-1');
    component.reloadFromFilter();
    expect(api.getReport).toHaveBeenCalledWith('sales-journal', { period: 'day', page: 1, limit: 50, sortBy: 'createdAt', sortDirection: 'desc', userId: 'user-1', categoryId: 'category-1' });
  });

  it('expose les onze familles de rapports RPT-08', () => {
    expect(component.reports.length).toBe(11);
    expect(component.reports.map((report) => report.key)).toContain('treasury');
    expect(component.reports.map((report) => report.key)).toContain('stock-entries-exits');
  });
});
