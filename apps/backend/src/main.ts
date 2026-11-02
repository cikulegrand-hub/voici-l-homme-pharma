import * as dotenv from 'dotenv';
dotenv.config({ path: 'apps/backend/.env' });
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use((req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Préfixe de versionnage imposé par le CDC (Section 7.1 : /api/v1)
  app.setGlobalPrefix('api/v1');

  // Validation stricte des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS pour le frontend Angular
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Documentation OpenAPI / Swagger (Section 7.1)
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

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`[VHP-API] Serveur démarré sur http://localhost:${port}/api/v1`);
  console.log(`[VHP-API] Swagger UI disponible sur http://localhost:${port}/api/docs`);
}
bootstrap();

