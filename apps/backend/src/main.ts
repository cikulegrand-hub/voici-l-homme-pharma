import * as dotenv from 'dotenv';
dotenv.config({ path: 'apps/backend/.env' });
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // 1. Limitation et contrôle des payloads (protection contre DoS sur la taille)
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ limit: '15mb', extended: true }));

  // 2. En-têtes HTTP de sécurité renforcés (standards OWASP & CSP)
  app.use((req: any, res: any, next: any) => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );

    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
  });

  // 3. Préfixe de versionnage imposé par le CDC (Section 7.1 : /api/v1)
  app.setGlobalPrefix('api/v1');

  // 4. Validation stricte des DTOs (anti Mass-Assignment)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 5. Configuration CORS restrictive (protection Cross-Origin)
  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:4200', 'http://127.0.0.1:4200'];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin && !isProduction) {
        return callback(null, true);
      }
      if (!origin) {
        return callback(null, false);
      }
      if (configuredOrigins.includes(origin) || (!isProduction && origin.includes('localhost'))) {
        return callback(null, true);
      }
      return callback(new Error('Origine non autorisée par la politique de sécurité CORS (SEC-CORS).'));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Requested-With'],
  });

  const port = process.env.PORT || 3000;

  // 6. Documentation OpenAPI / Swagger (protégée / masquée en production sauf accord explicite)
  const enableSwagger = process.env.ENABLE_SWAGGER === 'true' || !isProduction;
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('Voici l’Homme Pharma API')
      .setDescription(
        'API REST de gestion d’officine conforme au cahier des charges VHP-CDC-001',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    console.log(`[VHP-API] Swagger UI disponible sur http://localhost:${port}/api/docs`);
  } else {
    console.log(`[VHP-API] Swagger UI désactivé en production (activer via ENABLE_SWAGGER=true)`);
  }

  await app.listen(port);
  console.log(`[VHP-API] Serveur démarré en mode ${isProduction ? 'PRODUCTION' : 'DEVELOPPEMENT'} sur http://localhost:${port}/api/v1`);
}
bootstrap();
