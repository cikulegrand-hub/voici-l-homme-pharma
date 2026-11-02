import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HasPermissionDirective } from './has-permission.directive';
import { PermissionService } from './permission.service';

@Component({
  standalone: true,
  imports: [HasPermissionDirective],
  template: `
    <button id="btn-cancel" *hasPermission="'vente.annuler'">Annuler Vente</button>
    <div id="div-stock" *hasPermission="['stock.ajuster', 'stock.entree']">Zone Stock</div>
  `,
})
class TestHostComponent {}

describe('HasPermissionDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let permissionServiceSpy: jasmine.SpyObj<PermissionService>;

  beforeEach(async () => {
    permissionServiceSpy = jasmine.createSpyObj('PermissionService', ['hasPermission', 'getAllPermissions']);
    permissionServiceSpy.getAllPermissions.and.returnValue([]);

    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        { provide: PermissionService, useValue: permissionServiceSpy },
      ],
    }).compileComponents();
  });

  it('devrait afficher l’élément si la permission est accordée', () => {
    permissionServiceSpy.hasPermission.and.callFake((perm) => perm === 'vente.annuler');

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#btn-cancel')).not.toBeNull();
    expect(compiled.querySelector('#btn-cancel')?.textContent).toContain('Annuler Vente');
  });

  it('devrait masquer l’élément si la permission est refusée', () => {
    permissionServiceSpy.hasPermission.and.returnValue(false);

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#btn-cancel')).toBeNull();
    expect(compiled.querySelector('#div-stock')).toBeNull();
  });

  it('devrait passer les permissions et le flag requireAll au service', () => {
    permissionServiceSpy.hasPermission.and.returnValue(true);

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    expect(permissionServiceSpy.hasPermission).toHaveBeenCalledWith('vente.annuler', false);
    expect(permissionServiceSpy.hasPermission).toHaveBeenCalledWith(['stock.ajuster', 'stock.entree'], false);
  });
});

