/**
 * VHP-CDC-001 – Tests E2E : Caisse & Taux de change
 */
'use strict';

const { request, assert, suite, sleep } = require('./helpers');

module.exports = async function runCashTests(ctx) {
  // ── TAUX DE CHANGE ACTIF ──────────────────────────────
  await suite('GET /cash/exchange-rates/active', async () => {
    const r = await request('GET', '/cash/exchange-rates/active');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('rate présent', typeof r.body?.rate === 'number' || typeof r.body?.rate === 'string', JSON.stringify(r.body));
    if (r.body?.rate) {
      const rate = parseFloat(r.body.rate);
      assert('rate > 0', rate > 0, String(rate));
    }
  });

  // ── SAISIR UN TAUX DE CHANGE ──────────────────────────
  await suite('POST /cash/exchange-rates', async () => {
    const r = await request('POST', '/cash/exchange-rates', {
      rate: 2900,
      effectiveDate: new Date().toISOString(),
      notes: 'Ajustement cours officiel E2E',
    });
    assert(
      'status 201 ou 200',
      r.status === 201 || r.status === 200,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    if (r.body?.id) ctx.exchangeRateId = r.body.id;
  });

  // ── HISTORIQUE DES TAUX ───────────────────────────────
  await suite('GET /cash/exchange-rates/history', async () => {
    const r = await request('GET', '/cash/exchange-rates/history');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
    assert('non vide', Array.isArray(r.body) && r.body.length > 0, '');
  });

  // ── OUVRIR UNE SESSION DE CAISSE ──────────────────────
  await suite('POST /cash/sessions/open', async () => {
    const r = await request('POST', '/cash/sessions/open', {
      initialFloatCdf: 100000,
      initialFloatUsd: 50,
    });
    // Si une session est déjà ouverte, l'API renvoie 400 avec message clair
    const ok = r.status === 201 || r.status === 200 || r.status === 400;
    assert('status 201, 200 ou 400', ok, `reçu ${r.status} – ${JSON.stringify(r.body)}`);
    if (r.body?.id) ctx.cashSessionId = r.body.id;
    if (ctx.cashSessionId) {
      const duplicate = await request('POST', '/cash/sessions/open', { initialFloatCdf: 1, initialFloatUsd: 1 });
      assert('double ouverture refusée (RG-12)', duplicate.status === 400 || duplicate.status === 409, `reçu ${duplicate.status}`);
    }
  });

  // ── SESSION EN COURS ──────────────────────────────────
  await suite('GET /cash/sessions/current', async () => {
    const r = await request('GET', '/cash/sessions/current');
    assert('status 200', r.status === 200, `reçu ${r.status} – ${JSON.stringify(r.body)}`);
    if (r.body?.id) {
      ctx.cashSessionId = r.body.id;
    }
  });

  // ── DÉPENSES ──────────────────────────────────────────
  await suite('POST /cash/expenses', async () => {
    const r = await request('POST', '/cash/expenses', {
      description: 'Achat fournitures bureau E2E',
      category: 'FOURNITURES',
      amountCdf: 5000,
      amountUsd: 0,
    });
    assert(
      'status 201 ou 200',
      r.status === 201 || r.status === 200,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
  });

  await suite('GET /cash/expenses', async () => {
    const r = await request('GET', '/cash/expenses');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
  });

  // ── BALANCE ÂGÉE ──────────────────────────────────────
  await suite('GET /cash/receivables-aging', async () => {
    const r = await request('GET', '/cash/receivables-aging');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
  });

  await suite('POST /cash/sessions/:id/movements', async () => {
    if (!ctx.cashSessionId) return assert('session requise', false, '');
    const r = await request('POST', `/cash/sessions/${ctx.cashSessionId}/movements`, {
      type: 'APPORT', amountCdf: 1000, amountUsd: 0, reason: 'Apport E2E',
    });
    assert('mouvement accepté', r.status === 201 || r.status === 200, `reçu ${r.status} – ${JSON.stringify(r.body)}`);
    const list = await request('GET', `/cash/sessions/${ctx.cashSessionId}/movements`);
    assert('mouvements listés', list.status === 200 && Array.isArray(list.body), `reçu ${list.status}`);
  });

  // ── CLÔTURER LA SESSION DE CAISSE ─────────────────────
  await suite('PATCH /cash/sessions/:id/close', async () => {
    if (!ctx.cashSessionId) {
      assert('skip (session non ouverte)', false, '');
      return;
    }
    await sleep(500);
    const missingReason = await request('PATCH', `/cash/sessions/${ctx.cashSessionId}/close`, {
      countedAmountCdf: 100001,
      countedAmountUsd: 50,
    });
    assert('écart sans justification bloqué (UC-04)', missingReason.status === 400, `reçu ${missingReason.status}`);
    const r = await request('PATCH', `/cash/sessions/${ctx.cashSessionId}/close`, {
      countedAmountCdf: 100000,
      countedAmountUsd: 50,
      varianceReason: 'Clôture E2E normale',
    });
    assert(
      'status 200, 204 ou 400',
      r.status === 200 || r.status === 204 || r.status === 400,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
  });
};
