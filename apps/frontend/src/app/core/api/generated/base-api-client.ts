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
  protected readonly baseUrl = '/api/v1';

  private sanitizeOptions(options?: RequestOptions): RequestOptions | undefined {
    if (!options) return undefined;
    const sanitized: RequestOptions = { ...options };
    if (sanitized.params && !(sanitized.params instanceof HttpParams)) {
      const cleanParams: Record<string, any> = {};
      for (const [key, val] of Object.entries(sanitized.params)) {
        if (
          val !== undefined &&
          val !== null &&
          val !== '' &&
          val !== 'undefined' &&
          val !== 'null'
        ) {
          cleanParams[key] = val;
        }
      }
      sanitized.params = cleanParams;
    }
    return sanitized;
  }

  get<T>(endpoint: string, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(this.formatUrl(endpoint), this.sanitizeOptions(options));
  }

  getBlob(endpoint: string): Observable<Blob> {
    return this.http.get(this.formatUrl(endpoint), { responseType: 'blob' });
  }

  post<T>(endpoint: string, body: any = {}, options?: RequestOptions): Observable<T> {
    return this.http.post<T>(this.formatUrl(endpoint), body, this.sanitizeOptions(options));
  }

  put<T>(endpoint: string, body: any = {}, options?: RequestOptions): Observable<T> {
    return this.http.put<T>(this.formatUrl(endpoint), body, this.sanitizeOptions(options));
  }

  patch<T>(endpoint: string, body: any = {}, options?: RequestOptions): Observable<T> {
    return this.http.patch<T>(this.formatUrl(endpoint), body, this.sanitizeOptions(options));
  }

  delete<T>(endpoint: string, options?: RequestOptions): Observable<T> {
    return this.http.delete<T>(this.formatUrl(endpoint), this.sanitizeOptions(options));
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
