/**
 * VHP-CDC-001 – Tests E2E : Catalogue produits
 */
'use strict';

const { request, assert, suite } = require('./helpers');

module.exports = async function runCatalogTests(ctx) {
  // ── CATÉGORIES ─────────────────────────────────────────
  await suite('POST /catalog/categories', async () => {
    const unique = Date.now().toString().slice(-6);
    const r = await request('POST', '/catalog/categories', {
      name: `Antibiotiques_E2E_${unique}`,
      description: 'Catégorie créée par tests E2E',
    });
    assert(
      'status 201 ou 200',
      r.status === 201 || r.status === 200,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    if (r.body?.id) ctx.categoryId = r.body.id;
  });

  await suite('GET /catalog/categories', async () => {
    const r = await request('GET', '/catalog/categories');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body) || Array.isArray(r.body?.data), JSON.stringify(r.body));
    assert('au moins 1 catégorie', Array.isArray(r.body) && r.body.length > 0, 'tableau vide');
  });

  // ── PRODUITS ───────────────────────────────────────────
  await suite('POST /catalog/products', async () => {
    const unique = Date.now().toString().slice(-6);
    ctx.productName = `Amoxicilline 500mg E2E ${unique}`;
    const r = await request('POST', '/catalog/products', {
      name: ctx.productName,
      dci: 'AMOXICILLINE',
      dosage: '500 mg',
      galenicForm: 'Comprimé',
      sellingUnit: 'Boîte de 30',
      sellingPriceCdf: 3500,
      sellingPriceUsd: 1.25,
      minAlertThreshold: 10,
      requiresPrescription: false,
      isControlledSubstance: false,
      isColdChain: false,
      barcodes: [`3582910${unique}`],
      categoryId: ctx.categoryId || undefined,
    });
    assert(
      'status 201 ou 200',
      r.status === 201 || r.status === 200,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    if (r.body?.id) {
      ctx.productId = r.body.id;
      ctx.productE2eId = r.body.id;
    }
  });

  await suite('GET /catalog/products?q=', async () => {
    const r = await request('GET', `/catalog/products?q=${encodeURIComponent('Amoxicilline')}`);
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const products = Array.isArray(r.body) ? r.body : r.body?.data;
    assert('tableau retourné', Array.isArray(products), JSON.stringify(r.body));
    if (Array.isArray(products) && products.length > 0) {
      assert('champ name présent', typeof products[0].name === 'string', JSON.stringify(products[0]));
    }
  });

  await suite('GET /catalog/products/:id', async () => {
    if (!ctx.productId) {
      assert('skip (produit non créé)', false, '');
      return;
    }
    const r = await request('GET', `/catalog/products/${ctx.productId}`);
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('id correspond', r.body?.id === ctx.productId, JSON.stringify(r.body));
  });

  await suite('PATCH /catalog/products/:id/price', async () => {
    if (!ctx.productId) {
      assert('skip (produit non créé)', false, '');
      return;
    }
    const r = await request('PATCH', `/catalog/products/${ctx.productId}/price`, {
      newPriceCdf: 3800,
      newPriceUsd: 1.35,
      reason: 'Réévaluation prix E2E test',
    });
    assert(
      'status 200 ou 204',
      r.status === 200 || r.status === 204,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
  });

  await suite('GET /catalog/products/:id/price-history', async () => {
    if (!ctx.productId) {
      assert('skip (produit non créé)', false, '');
      return;
    }
    const r = await request('GET', `/catalog/products/${ctx.productId}/price-history`);
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
    assert(
      'historique non vide',
      Array.isArray(r.body) && r.body.length >= 1,
      `longueur = ${Array.isArray(r.body) ? r.body.length : 'N/A'}`,
    );
  });

  await suite('GET /catalog/export-csv', async () => {
    const r = await request('GET', '/catalog/export-csv');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('contenu non vide', r.body && r.body.length > 0, 'body vide');
  });
};
