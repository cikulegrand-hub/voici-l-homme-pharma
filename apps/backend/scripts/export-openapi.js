const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

const { NestFactory } = require('@nestjs/core');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
// Nest's workspace build emits apps/backend/dist/app.module.js. Keep the
// previous monorepo path as a compatibility fallback for older build layouts.
const compiledAppModule = path.join(__dirname, '..', 'dist', 'app.module.js');
const legacyCompiledAppModule = path.join(__dirname, '..', 'dist', 'apps', 'backend', 'src', 'app.module.js');
const { AppModule } = require(fs.existsSync(compiledAppModule) ? compiledAppModule : legacyCompiledAppModule);

async function exportOpenApi() {
  try {
    const app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');

    const config = new DocumentBuilder()
      .setTitle('Voici l’Homme Pharma API')
      .setDescription('API REST de gestion d’officine conforme au cahier des charges VHP-CDC-001')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    const outputPath = path.join(__dirname, '..', '..', 'frontend', 'openapi.json');
    fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');
    console.log(`[OpenAPI] Spécification exportée avec succès vers ${outputPath}`);
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error('[OpenAPI] Erreur lors de l’export OpenAPI :', err);
    process.exit(1);
  }
}

exportOpenApi();
