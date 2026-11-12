import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import {
  LoginDto,
  CreateUserDto,
  UpdateUserDto,
  VerifyPinDto,
  ResetPasswordDto,
  ChangeMyPasswordDto,
  ChangeMyPinDto,
} from '../generated/models';
import { AuthSession, UserProfile, ExchangeRate, RoleItem, CreateRoleDto, UpdateRoleDto } from '@vhp/shared';

export interface PinAuthResult {
  valid: boolean;
  action: string;
  authorizationToken: string;
  expiresAt: string;
  supervisorName: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthApiService {
  private readonly client = inject(BaseApiClient);

  login(dto: LoginDto): Observable<AuthSession> {
    return this.client.post<AuthSession>('/auth/login', dto);
  }

  refreshToken(refreshToken: string): Observable<{ token: string; refreshToken: string }> {
    return this.client.post<{ token: string; refreshToken: string }>('/auth/refresh', { refreshToken });
  }

  getMe(): Observable<{ user: UserProfile; activeRate: ExchangeRate }> {
    return this.client.get<{ user: UserProfile; activeRate: ExchangeRate }>('/auth/me');
  }

  getAllUsers(): Observable<UserProfile[]> {
    return this.client.get<UserProfile[]>('/auth/users');
  }

  getUserById(id: string): Observable<UserProfile> {
    return this.client.get<UserProfile>(`/auth/users/${id}`);
  }

  createUser(dto: CreateUserDto): Observable<UserProfile> {
    return this.client.post<UserProfile>('/auth/users', dto);
  }

  updateUser(id: string, dto: UpdateUserDto): Observable<UserProfile> {
    return this.client.patch<UserProfile>(`/auth/users/${id}`, dto);
  }

  deactivateUser(username: string): Observable<{ success: boolean; message: string }> {
    return this.client.patch<{ success: boolean; message: string }>(`/auth/users/${username}/deactivate`);
  }

  activateUser(username: string): Observable<{ success: boolean; message: string }> {
    return this.client.patch<{ success: boolean; message: string }>(`/auth/users/${username}/activate`);
  }

  resetPassword(userId: string, dto: ResetPasswordDto): Observable<{ success: boolean; message: string }> {
    return this.client.patch<{ success: boolean; message: string }>(`/auth/users/${userId}/reset-password`, dto);
  }

  changeMyPassword(dto: ChangeMyPasswordDto): Observable<{ success: boolean; message: string }> {
    return this.client.post<{ success: boolean; message: string }>('/auth/change-password', dto);
  }

  changeMyPin(dto: ChangeMyPinDto): Observable<{ success: boolean; message: string }> {
    return this.client.post<{ success: boolean; message: string }>('/auth/change-pin', dto);
  }

  verifyPin(dto: VerifyPinDto): Observable<PinAuthResult> {
    return this.client.post<PinAuthResult>('/auth/verify-pin', dto);
  }

  getUserPermissions(userId: string): Observable<{
    role: string;
    categories: Array<{
      category: string;
      permissions: Array<{
        code: string;
        label: string;
        isGrantedByRole: boolean;
        isOverridden: boolean;
        overrideType: 'GRANT' | 'DENY' | null;
        isEffective: boolean;
      }>;
    }>;
  }> {
    return this.client.get(`/auth/users/${userId}/permissions`);
  }

  updateUserPermissions(
    userId: string,
    overrides: Array<{ permission: string; overrideType: 'GRANT' | 'DENY' | null }>
  ): Observable<{ success: boolean; effectivePermissions: string[] }> {
    return this.client.put(`/auth/users/${userId}/permissions`, { overrides });
  }

  getAllRoles(): Observable<RoleItem[]> {
    return this.client.get<RoleItem[]>('/auth/roles');
  }

  getRoleById(id: string): Observable<RoleItem> {
    return this.client.get<RoleItem>(`/auth/roles/${id}`);
  }

  createRole(dto: CreateRoleDto): Observable<RoleItem> {
    return this.client.post<RoleItem>('/auth/roles', dto);
  }

  updateRole(id: string, dto: UpdateRoleDto): Observable<RoleItem> {
    return this.client.put<RoleItem>(`/auth/roles/${id}`, dto);
  }

  deleteRole(id: string): Observable<{ success: boolean; message: string }> {
    return this.client.delete<{ success: boolean; message: string }>(`/auth/roles/${id}`);
  }

  getPermissionsCatalog(): Observable<{
    categories: Array<{
      category: string;
      label: string;
      permissions: Array<{
        code: string;
        label: string;
        category: string;
        description?: string;
      }>;
    }>;
  }> {
    return this.client.get('/auth/permissions/catalog');
  }
}
