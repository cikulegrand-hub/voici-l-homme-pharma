import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Supervision & Santé système (OBS-01)')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary:
      "Vérification de l'état de santé du backend API et de la connexion PostgreSQL (OBS-01)",
  })
  async check() {
    let dbStatus = 'DOWN';
    let dbResponseTimeMs = -1;

    try {
      // Timeout de 3s pour éviter de bloquer la sonde si le réseau est inaccessible
      const result = await Promise.race([
        this.prisma.healthCheck(),
        new Promise<{ status: string; responseTimeMs: number }>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout de connexion')), 3000),
        ),
      ]);
      dbStatus = result.status;
      dbResponseTimeMs = result.responseTimeMs;
    } catch {
      dbStatus = 'DOWN';
    }

    return {
      status: dbStatus === 'UP' ? 'UP' : 'DEGRADED',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      service: 'Voici l\'Homme Pharma API (VHP-CDC-001)',
      version: '1.0.0',
      database: {
        status: dbStatus,
        responseTimeMs: dbResponseTimeMs,
      },
    };
  }
}
