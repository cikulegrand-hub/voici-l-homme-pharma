import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface RequestOptions {
  headers?: HttpHeaders | Record<string, string | string[]>;
  params?: HttpParams | Record<string, any>;
  reportProgress?: boolean;
  withCredentials?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class BaseApiClient {
  protected readonly http = inject(HttpClient);
  protected get baseUrl(): string {
    if (typeof window !== 'undefined' && (window as any).__VHP_API_BASE__) {
      return (window as any).__VHP_API_BASE__;
    }
    return '/api/v1';
  }

  get<T>(endpoint: string, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(this.formatUrl(endpoint), options);
  }

  getBlob(endpoint: string): Observable<Blob> {
    return this.http.get(this.formatUrl(endpoint), { responseType: 'blob' });
  }

  getText(endpoint: string): Observable<string> {
    return this.http.get(this.formatUrl(endpoint), { responseType: 'text' });
  }

  post<T>(endpoint: string, body: any = {}, options?: RequestOptions): Observable<T> {
    return this.http.post<T>(this.formatUrl(endpoint), body, options);
  }

  put<T>(endpoint: string, body: any = {}, options?: RequestOptions): Observable<T> {
    return this.http.put<T>(this.formatUrl(endpoint), body, options);
  }

  patch<T>(endpoint: string, body: any = {}, options?: RequestOptions): Observable<T> {
    return this.http.patch<T>(this.formatUrl(endpoint), body, options);
  }

  delete<T>(endpoint: string, options?: RequestOptions): Observable<T> {
    return this.http.delete<T>(this.formatUrl(endpoint), options);
  }

  private formatUrl(endpoint: string): string {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (cleanEndpoint.startsWith('/api/v1/')) {
      return cleanEndpoint;
    }
    return `${this.baseUrl}${cleanEndpoint}`;
  }
}
