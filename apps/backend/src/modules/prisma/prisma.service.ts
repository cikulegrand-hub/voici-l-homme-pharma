import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

export interface PrismaService extends PrismaClient {}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('PrismaService');
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    const connectionString =
      configService.get<string>('DATABASE_URL') ||
      process.env.DATABASE_URL ||
      '';

    let cleanConnectionString = connectionString;
    let sslConfig: boolean | { rejectUnauthorized: boolean } | undefined = undefined;

    if (
      connectionString.includes('supabase.com') ||
      connectionString.includes('sslmode=') ||
      connectionString.includes('render.com') ||
      process.env.NODE_ENV === 'production'
    ) {
      cleanConnectionString = connectionString
        .replace(/(\?|&)sslmode=[^&]*/g, '')
        .replace(/\?&/, '?')
        .replace(/\?$/, '');
      sslConfig = { rejectUnauthorized: false };
    }

    const pool = new Pool({
      connectionString: cleanConnectionString,
      ssl: sslConfig,
      max: 10,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      // Simple requête de vérification
      await this.$queryRawUnsafe('SELECT 1');
      this.isConnected = true;
      this.logger.log('Connecté avec succès à PostgreSQL via Prisma.');
    } catch (error: any) {
      this.isConnected = false;
      const safeMsg = this.sanitizeErrorMessage(error.message);
      this.logger.error(`Échec de connexion PostgreSQL : ${safeMsg}`);
      this.diagnoseError(error.message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Déconnexion de PostgreSQL (Prisma) effectuée.');
  }

  /**
   * Route de santé : exécute un SELECT 1 simple sans exposer d'information sensible
   */
  async healthCheck(): Promise<{ status: string; responseTimeMs: number }> {
    const start = Date.now();
    await this.$queryRawUnsafe('SELECT 1');
    const responseTimeMs = Date.now() - start;
    return { status: 'UP', responseTimeMs };
  }

  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Masque les identifiants, mots de passe et URLs complètes pour respecter la règle de sécurité
   */
  private sanitizeErrorMessage(msg: string): string {
    if (!msg) return 'Erreur inconnue';
    return msg
      .replace(/postgresql:\/\/[^@]+@/g, 'postgresql://****:****@')
      .replace(/postgres:[^@]+@/g, 'postgres:****@')
      .replace(/password=[^&\s]+/g, 'password=****');
  }

  /**
   * Diagnostic bienveillant sans fuite d'information sensible
   */
  private diagnoseError(rawMsg: string): void {
    if (/ENOTFOUND|ETIMEDOUT/i.test(rawMsg)) {
      this.logger.warn(
        'Diagnostic : Échec réseau (ENOTFOUND/ETIMEDOUT). Probablement un réseau local sans support IPv6 direct. Assurez-vous d’utiliser l’URL du Session Pooler Supabase (port 5432 ou 6543) plutôt qu’une adresse directe IPv6.',
      );
    } else if (/password authentication failed/i.test(rawMsg)) {
      this.logger.warn(
        'Diagnostic : Échec d’authentification. Vérifiez le mot de passe dans DATABASE_URL (attention aux caractères spéciaux à encoder en URL percent-encoding) et le nom d’utilisateur (format "postgres.[ref-projet]" pour le pooler Supabase).',
      );
    } else if (/SSL|certificate|handshake/i.test(rawMsg)) {
      this.logger.warn(
        'Diagnostic : Erreur SSL. Supabase exige une connexion sécurisée. Assurez-vous d’ajouter "?sslmode=require" à votre chaîne de connexion DATABASE_URL.',
      );
    }
  }
}
