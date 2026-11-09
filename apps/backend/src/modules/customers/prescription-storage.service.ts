import { BadRequestException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

@Injectable()
export class PrescriptionStorageService implements OnModuleInit {
  /** Local fallback is durable across restarts when this directory is mounted/persisted. */
  private readonly localRoot = resolve(process.env.PRESCRIPTIONS_STORAGE_PATH || join(process.cwd(), '.data', 'prescriptions'));
  private get config() {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_PRESCRIPTIONS_BUCKET || 'prescriptions';
    return { url, serviceKey, bucket };
  }

  /** Production must use the private Supabase bucket; this check is read-only. */
  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') return;

    if (!this.isStorageConfigured()) {
      throw new Error(
        'Configuration invalide : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont obligatoires en production; le stockage local des ordonnances est interdit.',
      );
    }

    await this.assertPrivateBucket();
  }

  private async assertPrivateBucket(): Promise<void> {
    const { url, serviceKey, bucket } = this.config;
    try {
      const response = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const metadata = (await response.json()) as { public?: boolean };
      if (metadata.public === true) throw new Error('public-bucket');
    } catch (error: any) {
      const reason = error?.message === 'public-bucket'
        ? `Le bucket Supabase « ${bucket} » est public.`
        : `Impossible de vérifier la confidentialité du bucket Supabase « ${bucket} ».`;
      throw new Error(`Démarrage refusé : ${reason} Aucun stockage local de secours n'est autorisé en production.`);
    }
  }

  /** Returns true only if Supabase Storage is properly configured (non-placeholder values). */
  private isStorageConfigured(): boolean {
    const { url, serviceKey } = this.config;
    if (!url || !serviceKey) return false;
    // Detect placeholder / template values left in .env
    if (url.includes('votre-projet') || url.includes('your-project') || url.includes('example')) return false;
    if (serviceKey.startsWith('votre-') || serviceKey.startsWith('your-') || serviceKey.length < 20) return false;
    return true;
  }

  usesLocalStorage(): boolean {
    return !this.isStorageConfigured();
  }

  validateImage(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file?.buffer?.length) throw new BadRequestException('Une image d’ordonnance est requise.');
    if (file.size > MAX_IMAGE_SIZE) throw new BadRequestException('L’image ne peut pas dépasser 8 Mo.');

    const bytes = file.buffer;
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) {
      throw new BadRequestException('Format invalide : seules les images JPEG, PNG et WebP sont acceptées.');
    }
  }

  async upload(customerId: string, file: Express.Multer.File): Promise<string> {
    this.validateImage(file);
    const { url, serviceKey, bucket } = this.config;
    const extension = this.extension(file.buffer);
    const path = `${customerId}/${randomUUID()}.${extension}`;

    if (!this.isStorageConfigured()) {
      // Stockage local / mock en l'absence de Supabase configuré
      const localDirectory = join(this.localRoot, customerId);
      await mkdir(localDirectory, { recursive: true });
      await writeFile(join(localDirectory, basename(path)), file.buffer);
      return path;
    }

    const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'content-type': this.contentType(extension),
        'x-upsert': 'false',
      },
      body: file.buffer as unknown as BodyInit,
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Impossible d’enregistrer l’image de l’ordonnance pour le moment.');
    }
    return path;
  }

  async uploadProfilePhoto(customerId: string, file: Express.Multer.File): Promise<string> {
    return this.upload(`profiles/${customerId}`, file);
  }

  async createProfilePhotoSignedUrl(path: string, expiresInSeconds = 300): Promise<{ signedUrl: string; expiresAt: string }> {
    return this.createSignedUrl(path, expiresInSeconds);
  }

  async deleteStoredFile(path: string): Promise<void> {
    if (!path) return;
    const { url, serviceKey, bucket } = this.config;
    if (this.isStorageConfigured()) {
      await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }).catch(() => undefined);
      return;
    }
    const normalized = path.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.includes('..')) return;
    await unlink(resolve(this.localRoot, normalized)).catch(() => undefined);
  }

  async createSignedUrl(path: string, expiresInSeconds = 300): Promise<{ signedUrl: string; expiresAt: string }> {
    const { url, serviceKey, bucket } = this.config;

    if (!path) {
      throw new BadRequestException('Le fichier image de l’ordonnance est introuvable.');
    }

    if (!this.isStorageConfigured()) {
      return {
        signedUrl: `local-prescription://${encodeURIComponent(path)}`,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      };
    }

    try {
      const response = await fetch(`${url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      });
      if (response.ok) {
        const body = (await response.json()) as { signedURL?: string; signedUrl?: string };
        const signedPath = body.signedURL || body.signedUrl;
        if (signedPath) {
          return {
            signedUrl: signedPath.startsWith('http') ? signedPath : `${url}/storage/v1${signedPath}`,
            expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
          };
        }
      }
    } catch {
      // Fallback local en cas d'indisponibilité
    }

    return {
      signedUrl: `local-prescription://${encodeURIComponent(path)}?expires=${Date.now() + expiresInSeconds * 1000}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  private extension(buffer: Buffer): 'jpg' | 'png' | 'webp' {
    if (buffer[0] === 0xff) return 'jpg';
    if (buffer[0] === 0x89) return 'png';
    return 'webp';
  }

  async readLocal(path: string): Promise<Buffer> {
    if (this.isStorageConfigured()) {
      const { url, serviceKey, bucket } = this.config;
      try {
        const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`, {
          headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        });
        if (!response.ok) {
          throw new NotFoundException('Fichier introuvable sur le stockage distant.');
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (e: any) {
        if (e instanceof NotFoundException) throw e;
        throw new ServiceUnavailableException('Impossible de récupérer le fichier depuis le stockage distant.');
      }
    }
    const normalized = path.replace(/\\/g, '/');
    if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
      throw new BadRequestException('Le fichier de l’ordonnance n’est pas valide.');
    }
    const target = resolve(this.localRoot, normalized);
    if (!target.startsWith(`${this.localRoot}\\`) && !target.startsWith(`${this.localRoot}/`)) {
      throw new BadRequestException('Le fichier de l’ordonnance n’est pas valide.');
    }
    try {
      return await readFile(target);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new NotFoundException('Le fichier image est introuvable.');
      }
      throw error;
    }
  }

  private contentType(extension: string): string {
    return extension === 'jpg' ? 'image/jpeg' : extension === 'png' ? 'image/png' : 'image/webp';
  }
}
