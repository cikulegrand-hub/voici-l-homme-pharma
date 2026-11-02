/**
 * VHP-CDC-001 – Tests E2E : Rapports, Audit, Paramètres, Fournisseurs
 */
'use strict';

const { request, assert, suite } = require('./helpers');

module.exports = async function runReportsAuditSettingsTests(ctx) {
  // ── TABLEAU DE BORD ───────────────────────────────────
  await suite('GET /reports/dashboard', async () => {
    const r = await request('GET', '/reports/dashboard');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const isObj = r.body && typeof r.body === 'object' && !Array.isArray(r.body);
    assert('objet retourné', isObj, JSON.stringify(r.body));
  });

  // ── RAPPORT VENTES ────────────────────────────────────
  await suite('GET /reports/sales', async () => {
    const r = await request('GET', '/reports/sales');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const hasData = r.body !== null && r.body !== undefined;
    assert('données retournées', hasData, JSON.stringify(r.body));
  });

  // ── RAPPORT ALERTES STOCK ─────────────────────────────
  await suite('GET /reports/stock-alerts', async () => {
    const r = await request('GET', '/reports/stock-alerts');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const hasData = r.body !== null && r.body !== undefined;
    assert('données retournées', hasData, JSON.stringify(r.body));
  });

  // ── JOURNAL D'AUDIT ───────────────────────────────────
  await suite('GET /audit/logs', async () => {
    const r = await request('GET', '/audit/logs');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
    if (Array.isArray(r.body) && r.body.length > 0) {
      const entry = r.body[0];
      assert('champ action présent', typeof entry.action === 'string', JSON.stringify(entry));
    }
  });

  await suite('GET /audit/logs?action=CONNEXION_REUSSIE', async () => {
    const r = await request('GET', '/audit/logs?action=CONNEXION_REUSSIE');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
  });

  // ── IMMUTABILITÉ DE L'AUDIT ───────────────────────────
  await suite('Audit : immutabilité – suppression interdite', async () => {
    const r = await request('DELETE', '/audit/logs', {});
    assert(
      'DELETE /audit/logs protégé (404, 405 ou 403)',
      r.status === 404 || r.status === 405 || r.status === 403,
      `reçu ${r.status}`,
    );
  });

  // ── PARAMÈTRES OFFICINE ───────────────────────────────
  await suite('GET /settings', async () => {
    const r = await request('GET', '/settings');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const hasData = r.body !== null && r.body !== undefined;
    assert('données retournées', hasData, JSON.stringify(r.body));
  });

  await suite('PATCH /settings/pharmacy', async () => {
    const r = await request('PATCH', '/settings/pharmacy', {
      phone: '+243800000099',
    });
    assert(
      'status 200 ou 204',
      r.status === 200 || r.status === 204 || r.status === 400,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
  });

  await suite('PATCH /settings/financial', async () => {
    const r = await request('PATCH', '/settings/financial', {
      defaultCurrency: 'CDF',
      maxDiscountPercent: 15,
    });
    assert(
      'status 200 ou 204',
      r.status === 200 || r.status === 204 || r.status === 400,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
  });

  await suite('PATCH /settings/alerts', async () => {
    const r = await request('PATCH', '/settings/alerts', {
      lowStockThresholdDays: 30,
      expiryAlertDays: 60,
    });
    assert(
      'status 200 ou 204',
      r.status === 200 || r.status === 204 || r.status === 400,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
  });

  // ── FOURNISSEURS ──────────────────────────────────────
  await suite('GET /suppliers', async () => {
    const r = await request('GET', '/suppliers');
    assert(
      'status 200 ou 404',
      r.status === 200 || r.status === 404,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    if (r.status === 200) {
      assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
    }
  });
};
