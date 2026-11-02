import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PermissionService } from './permission.service';
import { AuthService } from '../auth/auth.service';

describe('PermissionService', () => {
  let service: PermissionService;
  let mockAuthService: { userPermissions: ReturnType<typeof signal<string[]>> };

  beforeEach(() => {
    mockAuthService = {
      userPermissions: signal<string[]>([]),
    };

    TestBed.configureTestingModule({
      providers: [
        PermissionService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    service = TestBed.inject(PermissionService);
  });

  it('devrait être créé avec succès', () => {
    expect(service).toBeTruthy();
  });

  it('devrait refuser l’accès si l’utilisateur n’a aucune permission', () => {
    mockAuthService.userPermissions.set([]);
    expect(service.hasPermission('vente.annuler')).toBeFalse();
  });

  it('devrait autoriser TOUT pour le rôle ADMIN avec le wildcard (*)', () => {
    mockAuthService.userPermissions.set(['*']);
    expect(service.hasPermission('vente.annuler')).toBeTrue();
    expect(service.hasPermission('stock.ajuster')).toBeTrue();
    expect(service.hasPermission('prix.modifier')).toBeTrue();
    expect(service.hasPermission(['a', 'b', 'c'], true)).toBeTrue();
  });

  it('devrait autoriser une permission nominative possédée par l’utilisateur', () => {
    mockAuthService.userPermissions.set(['vente.annuler', 'pos.access']);
    expect(service.hasPermission('vente.annuler')).toBeTrue();
    expect(service.hasPermission('pos.access')).toBeTrue();
    expect(service.hasPermission('stock.ajuster')).toBeFalse();
  });

  it('devrait gérer la condition OU (requireAll = false) sur un tableau de permissions', () => {
    mockAuthService.userPermissions.set(['stock.consulter']);
    // L'utilisateur n'a pas stock.ajuster, mais il a stock.consulter
    expect(service.hasPermission(['stock.ajuster', 'stock.consulter'], false)).toBeTrue();
    // L'utilisateur n'a aucune des deux
    expect(service.hasPermission(['stock.ajuster', 'stock.supprimer'], false)).toBeFalse();
  });

  it('devrait gérer la condition ET (requireAll = true) sur un tableau de permissions', () => {
    mockAuthService.userPermissions.set(['stock.consulter', 'stock.ajuster']);
    // Possède les deux
    expect(service.hasPermission(['stock.consulter', 'stock.ajuster'], true)).toBeTrue();
    // Il manque stock.supprimer
    expect(service.hasPermission(['stock.consulter', 'stock.supprimer'], true)).toBeFalse();
  });
});

