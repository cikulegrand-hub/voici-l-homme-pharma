#!/usr/bin/env node
/**
 * VHP-CDC-001 – Runner E2E principal
 * ===================================
 * Usage : node apps/backend/test/e2e/run_e2e_tests.js
 *
 * Le serveur NestJS DOIT être lancé AVANT ce script.
 * Exemple (PowerShell, depuis la racine du monorepo) :
 *
 *   cd "E:\voici l'homme pharma\apps\backend"
 *   node dist/apps/backend/src/main.js &
 *   # attendre ~3 secondes, puis :
 *   node apps/backend/test/e2e/run_e2e_tests.js
 *
 * SÉCURITÉ : ce script ne lit ni n'affiche DATABASE_URL.
 * Il ne se connecte pas directement à la base — tout passe par l'API HTTP.
 */
'use strict';

const http = require('http');

// ── Vérification préalable : le serveur doit répondre ────────────────────────
async function waitForServer(url, maxRetries = 20, delayMs = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      process.stdout.write(`  Tentative ${i + 1}/${maxRetries} – serveur pas encore prêt…\n`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

// ── Import des suites de tests ────────────────────────────────────────────────
const runAuth      = require('./01_auth.e2e');
const runCatalog   = require('./02_catalog.e2e');
const runStock     = require('./03_stock.e2e');
const runSales     = require('./04_sales.e2e');
const runCustomers = require('./05_customers.e2e');
const runCash      = require('./06_cash.e2e');
const runReports   = require('./07_reports_audit_settings.e2e');
const runAuditAndNotifs = require('./08_audit_and_notifications.e2e');
const { printSummary } = require('./helpers');

// ── Contexte partagé (données créées dans un test, réutilisées dans les suivants)
const ctx = {
  token: null,
  refreshToken: null,
  adminId: null,
  testUsername: null,
  categoryId: null,
  productId: null,
  productName: null,
  lotId: null,
  lotNumber: null,
  lotQuarantined: false,
  saleLotId: null,
  saleId: null,
  invoiceNumber: null,
  heldCartId: null,
  customerId: null,
  prescriptionId: null,
  cashSessionId: null,
  exchangeRateId: null,
  adjustmentId: null,
};

// ── Exécution ─────────────────────────────────────────────────────────────────
(async () => {
  const E2E_PORT = process.env.E2E_PORT || process.env.PORT || '3000';
  const HEALTH_URL = `http://localhost:${E2E_PORT}/api/v1/health`;

  process.stdout.write('\n\x1b[1m═══════════════════════════════════════════════════════\x1b[0m\n');
  process.stdout.write('\x1b[1m  VHP-CDC-001 – Suite de tests E2E API\x1b[0m\n');
  process.stdout.write('\x1b[1m═══════════════════════════════════════════════════════\x1b[0m\n');
  process.stdout.write('\nVérification disponibilité serveur…\n');

  const ready = await waitForServer(HEALTH_URL);
  if (!ready) {
    process.stderr.write(
      `\x1b[31mERREUR : Le serveur NestJS ne répond pas sur http://localhost:${E2E_PORT}\x1b[0m\n` +
      'Lancez le serveur avec : node dist/apps/backend/src/main.js\n',
    );
    process.exit(2);
  }
  process.stdout.write('\x1b[32mServeur prêt ✓\x1b[0m\n');

  // Exécution séquentielle des suites
  await runAuth(ctx);
  await runCatalog(ctx);
  await runStock(ctx);
  await runSales(ctx);
  await runCustomers(ctx);
  await runCash(ctx);
  await runReports(ctx);
  await runAuditAndNotifs(ctx);

  const failures = printSummary();
  process.exit(failures > 0 ? 1 : 0);
})();

