import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { permissionGuard } from './permission.guard';
import { PermissionService } from '../permissions/permission.service';

describe('permissionGuard', () => {
  let permissionServiceSpy: jasmine.SpyObj<PermissionService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    permissionServiceSpy = jasmine.createSpyObj('PermissionService', ['hasPermission']);
    routerSpy = jasmine.createSpyObj('Router', ['createUrlTree']);

    TestBed.configureTestingModule({
      providers: [
        { provide: PermissionService, useValue: permissionServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  function executeGuard(routeData: any): any {
    const route = { data: routeData } as unknown as ActivatedRouteSnapshot;
    const state = {} as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => permissionGuard(route, state));
  }

  it('devrait autoriser l’accès si aucune permission n’est requise', () => {
    const result = executeGuard({});
    expect(result).toBeTrue();
  });

  it('devrait autoriser l’accès si l’utilisateur possède la permission requise', () => {
    permissionServiceSpy.hasPermission.and.returnValue(true);
    const result = executeGuard({ permission: 'stock.consulter' });
    expect(result).toBeTrue();
    expect(permissionServiceSpy.hasPermission).toHaveBeenCalledWith('stock.consulter');
  });

  it('devrait rediriger vers /dashboard si la permission est manquante', () => {
    permissionServiceSpy.hasPermission.and.returnValue(false);
    const expectedTree = {} as UrlTree;
    routerSpy.createUrlTree.and.returnValue(expectedTree);

    const result = executeGuard({ permission: 'admin.utilisateurs' });
    expect(result).toBe(expectedTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });
});
