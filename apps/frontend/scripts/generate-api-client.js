/**
 * Générateur de client d'API typé depuis openapi.json
 * Voici l'Homme Pharma (VHP-CDC-001)
 */
const fs = require('fs');
const path = require('path');

const openApiPath = path.join(__dirname, '..', 'openapi.json');
const outputDir = path.join(__dirname, '..', 'src', 'app', 'core', 'api', 'generated');

if (!fs.existsSync(openApiPath)) {
  console.error(`[ApiGenerator] Erreur: Fichier introuvable : ${openApiPath}`);
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(openApiPath, 'utf-8'));
fs.mkdirSync(outputDir, { recursive: true });

function resolveType(prop) {
  if (!prop) return 'any';
  if (prop.$ref) {
    return prop.$ref.split('/').pop();
  }
  if (prop.allOf && prop.allOf.length > 0) {
    return resolveType(prop.allOf[0]);
  }
  if (prop.oneOf && prop.oneOf.length > 0) {
    return prop.oneOf.map(resolveType).join(' | ');
  }
  if (prop.anyOf && prop.anyOf.length > 0) {
    return prop.anyOf.map(resolveType).join(' | ');
  }
  if (prop.enum) {
    return prop.enum.map((v) => `'${v}'`).join(' | ');
  }

  switch (prop.type) {
    case 'string':
      return prop.format === 'date' || prop.format === 'date-time' ? 'string' : 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return `${resolveType(prop.items)}[]`;
    case 'object':
      if (prop.additionalProperties) {
        return `Record<string, ${resolveType(prop.additionalProperties)}>`;
      }
      return 'Record<string, any>';
    default:
      return 'any';
  }
}

// 1. Génération des modèles (interfaces)
const schemas = spec.components?.schemas || {};
let modelsContent = `/**
 * Ce fichier est généré automatiquement depuis OpenAPI Backend.
 * NE PAS MODIFIER DIRECTEMENT.
 * Régénérer avec : npm run api:generate
 */\n\n`;

for (const [schemaName, schemaObj] of Object.entries(schemas)) {
  const description = schemaObj.description ? `/** ${schemaObj.description} */\n` : '';
  modelsContent += `${description}export interface ${schemaName} {\n`;

  const properties = schemaObj.properties || {};
  const required = new Set(schemaObj.required || []);

  for (const [propName, propDef] of Object.entries(properties)) {
    const isRequired = required.has(propName);
    const tsType = resolveType(propDef);
    const doc = propDef.description ? `  /** ${propDef.description} */\n` : '';
    modelsContent += `${doc}  ${propName}${isRequired ? '' : '?'}: ${tsType};\n`;
  }

  modelsContent += `}\n\n`;
}

fs.writeFileSync(path.join(outputDir, 'models.ts'), modelsContent, 'utf-8');

// 2. Génération des endpoints
let endpointsContent = `/**
 * Endpoints d'API générés depuis OpenAPI.
 * Régénérer avec : npm run api:generate
 */
export const API_ENDPOINTS = {\n`;

const paths = spec.paths || {};
for (const [routePath, methods] of Object.entries(paths)) {
  for (const [method, op] of Object.entries(methods)) {
    if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
      const opId = op.operationId || `${method}_${routePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
      endpointsContent += `  '${opId}': {\n    path: '${routePath}',\n    method: '${method.toUpperCase()}',\n    summary: '${(op.summary || '').replace(/'/g, "\\'")}',\n  },\n`;
    }
  }
}
endpointsContent += `} as const;\n`;

fs.writeFileSync(path.join(outputDir, 'endpoints.ts'), endpointsContent, 'utf-8');

// 3. Génération du Client API Angular de base
const clientServiceContent = `import { Injectable, inject } from '@angular/core';
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

  get<T>(endpoint: string, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(this.formatUrl(endpoint), options);
  }

  getBlob(endpoint: string): Observable<Blob> {
    return this.http.get(this.formatUrl(endpoint), { responseType: 'blob' });
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
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : \`/\${endpoint}\`;
    if (cleanEndpoint.startsWith('/api/v1/')) {
      return cleanEndpoint;
    }
    return \`\${this.baseUrl}\${cleanEndpoint}\`;
  }
}
`;

fs.writeFileSync(path.join(outputDir, 'base-api-client.ts'), clientServiceContent, 'utf-8');

// 4. Index
const indexContent = `export * from './models';
export * from './endpoints';
export * from './base-api-client';
`;
fs.writeFileSync(path.join(outputDir, 'index.ts'), indexContent, 'utf-8');

console.log(`[ApiGenerator] Client API généré avec succès dans : ${outputDir}`);

