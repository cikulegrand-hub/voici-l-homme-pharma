/**
 * VHP-CDC-001 – Tests E2E : Stock (lots, mouvements, alertes, CUMP, quarantaine)
 */
'use strict';

const { request, assert, suite, sleep } = require('./helpers');

module.exports = async function runStockTests(ctx) {
  // ── RÉCEPTION D'UN LOT ────────────────────────────────
  await suite('POST /stock/lots (réceptionner un lot)', async () => {
    if (!ctx.productId) {
      assert('skip (produit non créé en étape catalog)', false, '');
      return;
    }
    const unique = Date.now().toString().slice(-5);
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    const expiryDate = futureDate.toISOString().split('T')[0];

    const r = await request('POST', '/stock/lots', {
      productId: ctx.productId,
      lotNumber: `E2E-LOT-${unique}`,
      quantity: 50,
      expiryDate,
      purchasePriceCdf: 2500,
      purchasePriceUsd: 0.88,
    });
    assert(
      'status 201 ou 200',
      r.status === 201 || r.status === 200,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    if (r.body?.id) ctx.lotId = r.body.id;
    if (r.body?.lotNumber) ctx.lotNumber = r.body.lotNumber;
  });

  // ── STOCK PAR PRODUIT ─────────────────────────────────
  await suite('GET /stock/products/:productId', async () => {
    if (!ctx.productId) {
      assert('skip', false, '');
      return;
    }
    await sleep(500);
    const r = await request('GET', `/stock/products/${ctx.productId}`);
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const hasData = Array.isArray(r.body) || (r.body && typeof r.body === 'object');
    assert('données retournées', hasData, JSON.stringify(r.body));
  });

  // ── ALERTES STOCK ─────────────────────────────────────
  await suite('GET /stock/alerts', async () => {
    const r = await request('GET', '/stock/alerts');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const isObj = r.body && typeof r.body === 'object';
    assert('réponse objet', isObj, JSON.stringify(r.body));
  });

  // ── VALORISATION CUMP ─────────────────────────────────
  await suite('GET /stock/cump-valuation', async () => {
    const r = await request('GET', '/stock/cump-valuation');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const isObjOrArray = r.body && (typeof r.body === 'object' || Array.isArray(r.body));
    assert('réponse non vide', isObjOrArray, JSON.stringify(r.body));
  });

  // ── REGISTRE STUPÉFIANTS ──────────────────────────────
  await suite('GET /stock/controlled-substances-register', async () => {
    const r = await request('GET', '/stock/controlled-substances-register');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const isOk = Array.isArray(r.body) || (r.body && (Array.isArray(r.body.movements) || typeof r.body === 'object'));
    assert('registre valide', isOk, JSON.stringify(r.body));
  });

  // ── JOURNAL DES MOUVEMENTS ────────────────────────────
  await suite('GET /stock/movements', async () => {
    const r = await request('GET', '/stock/movements');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const items = Array.isArray(r.body) ? r.body : r.body?.data;
    assert('tableau retourné', Array.isArray(items), JSON.stringify(r.body));
  });

  await suite('GET /stock/movements?lotId=', async () => {
    if (!ctx.lotId) {
      assert('skip', false, '');
      return;
    }
    const r = await request('GET', `/stock/movements?lotId=${ctx.lotId}`);
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const items = Array.isArray(r.body) ? r.body : r.body?.data;
    assert('tableau retourné', Array.isArray(items), JSON.stringify(r.body));
    if (Array.isArray(items)) {
      assert('au moins un mouvement', items.length >= 1, `longueur=${items.length}`);
    }
  });

  // ── DEMANDE D'AJUSTEMENT ──────────────────────────────
  await suite('POST /stock/adjustments/request', async () => {
    if (!ctx.lotId) {
      assert('skip', false, '');
      return;
    }
    const r = await request('POST', '/stock/adjustments/request', {
      lotId: ctx.lotId,
      variance: -1,
      reason: 'Casse constatée lors du test E2E',
    });
    assert(
      'status 201 ou 200',
      r.status === 201 || r.status === 200,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    if (r.body?.id) ctx.adjustmentId = r.body.id;
  });

  await suite('GET /stock/adjustments/pending', async () => {
    const r = await request('GET', '/stock/adjustments/pending');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
  });

  // ── QUARANTAINE D'UN LOT ──────────────────────────────
  await suite('POST /stock/lots/:id/quarantine', async () => {
    if (!ctx.lotId) {
      assert('skip', false, '');
      return;
    }
    const r = await request('POST', `/stock/lots/${ctx.lotId}/quarantine`, {
      reason: 'Test quarantaine E2E – non conforme',
    });
    assert(
      'status 200 ou 204',
      r.status === 200 || r.status === 204,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    ctx.lotQuarantined = true;
  });
};
