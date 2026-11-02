import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { authInterceptor, AuthTokenRefreshQueue } from './auth.interceptor';
import { AuthService } from '../auth/auth.service';

describe('AuthInterceptor & Refresh Queue (AUT-03)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let queue: AuthTokenRefreshQueue;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj('AuthService', [
      'getAccessToken',
      'getRefreshToken',
      'refreshToken',
      'logout',
    ]);

    TestBed.configureTestingModule({
      providers: [
        AuthTokenRefreshQueue,
        { provide: AuthService, useValue: authServiceSpy },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    queue = TestBed.inject(AuthTokenRefreshQueue);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('devrait injecter l’en-tête Authorization: Bearer <token> sur une requête standard', () => {
    authServiceSpy.getAccessToken.and.returnValue('valid-access-token');

    http.get('/api/v1/catalog/products').subscribe();

    const req = httpMock.expectOne('/api/v1/catalog/products');
    expect(req.request.headers.has('Authorization')).toBeTrue();
    expect(req.request.headers.get('Authorization')).toBe('Bearer valid-access-token');
    req.flush([]);
  });

  it('ne devrait PAS injecter de token pour les routes /auth/login et /auth/refresh', () => {
    authServiceSpy.getAccessToken.and.returnValue('valid-access-token');

    http.post('/api/v1/auth/login', { username: 'admin', password: 'password' }).subscribe();

    const req = httpMock.expectOne('/api/v1/auth/login');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('devrait intercepter un 401, rafraîchir le jeton et rejouer la requête avec succès', () => {
    authServiceSpy.getAccessToken.and.returnValue('expired-token');
    authServiceSpy.refreshToken.and.returnValue(
      of({ token: 'new-fresh-token', refreshToken: 'new-refresh-token' }),
    );

    let responseData: any = null;
    http.get('/api/v1/catalog/products').subscribe((data) => {
      responseData = data;
    });

    // 1ère requête envoyée avec le vieux token
    const firstReq = httpMock.expectOne('/api/v1/catalog/products');
    expect(firstReq.request.headers.get('Authorization')).toBe('Bearer expired-token');

    // Réponse 401 Unauthorized
    firstReq.flush({ message: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

    // Le refresh doit avoir été appelé
    expect(authServiceSpy.refreshToken).toHaveBeenCalled();

    // 2ème requête (rejouée) avec le nouveau token
    const retriedReq = httpMock.expectOne('/api/v1/catalog/products');
    expect(retriedReq.request.headers.get('Authorization')).toBe('Bearer new-fresh-token');

    retriedReq.flush([{ id: '1', name: 'Paracétamol' }]);
    expect(responseData).toEqual([{ id: '1', name: 'Paracétamol' }]);
  });

  it('devrait déconnecter l’utilisateur si le renouvellement du jeton échoue', () => {
    authServiceSpy.getAccessToken.and.returnValue('expired-token');
    authServiceSpy.refreshToken.and.returnValue(
      throwError(() => new Error('Refresh failed')),
    );

    let errorReceived = false;
    http.get('/api/v1/stock/lots').subscribe({
      error: () => {
        errorReceived = true;
      },
    });

    const req = httpMock.expectOne('/api/v1/stock/lots');
    req.flush({ message: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.refreshToken).toHaveBeenCalled();
    expect(authServiceSpy.logout).toHaveBeenCalledWith('session_expired');
    expect(errorReceived).toBeTrue();
  });
});

