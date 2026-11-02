import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/services/alert.service';
import { Router, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let alertServiceSpy: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['login', 'isAuthenticated']);
    authServiceSpy.isAuthenticated.and.returnValue(false);

    routerSpy = jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl']);
    alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [LoginComponent, NoopAnimationsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: AlertService, useValue: alertServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParams: {},
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait créer le composant de connexion', () => {
    expect(component).toBeTruthy();
    expect(component.loginForm.valid).toBeFalse();
  });

  it('devrait invalider le formulaire si les champs sont vides', () => {
    expect(component.loginForm.get('username')?.valid).toBeFalse();
    expect(component.loginForm.get('password')?.valid).toBeFalse();
    expect(component.loginForm.invalid).toBeTrue();
  });

  it('devrait valider le formulaire lorsque les champs sont remplis', () => {
    component.loginForm.setValue({ username: 'admin', password: 'Admin2026@VoiciLHomme!' });
    expect(component.loginForm.valid).toBeTrue();
  });

  it('devrait appeler authService.login et rediriger en cas de succès', () => {
    const mockSession: any = {
      token: 'jwt_access_123',
      refreshToken: 'jwt_refresh_123',
      user: { id: '1', username: 'admin', fullName: 'Admin Principal', role: 'ADMIN', permissions: ['*'] },
    };
    authServiceSpy.login.and.returnValue(of(mockSession));

    component.loginForm.setValue({ username: 'admin', password: 'Admin2026@VoiciLHomme!' });
    component.onSubmit();

    expect(authServiceSpy.login).toHaveBeenCalledWith({
      username: 'admin',
      password: 'Admin2026@VoiciLHomme!',
    });
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    expect(component.isLoading()).toBeFalse();
  });

  it('devrait afficher le message d’erreur en cas d’échec 401', () => {
    const errorResponse = {
      status: 401,
      error: { message: 'Identifiants incorrects.' },
    };
    authServiceSpy.login.and.returnValue(throwError(() => errorResponse));

    component.loginForm.setValue({ username: 'baduser', password: 'WrongPassword10!' });
    component.onSubmit();

    expect(component.errorMessage()).toBe('Identifiants incorrects.');
    expect(component.isLoading()).toBeFalse();
  });

  it('devrait basculer la visibilité du mot de passe', () => {
    expect(component.hidePassword()).toBeTrue();
    component.togglePasswordVisibility();
    expect(component.hidePassword()).toBeFalse();
    component.togglePasswordVisibility();
    expect(component.hidePassword()).toBeTrue();
  });
});

