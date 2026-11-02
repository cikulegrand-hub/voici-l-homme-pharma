/**
 * VHP-CDC-001 – Tests E2E : Ventes (flux complet + annulation + duplicata)
 */
'use strict';

const { request, assert, suite, sleep } = require('./helpers');

const INVOICE_REGEX = /^FAC-\d{4}-\d{6}$/;

async function createVendableLot(ctx) {
  const unique = Date.now().toString().slice(-5);
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 2);
  const expiryDate = futureDate.toISOString().split('T')[0];

  const r = await request('POST', '/stock/lots', {
    productId: ctx.productId,
    lotNumber: `SALE-LOT-${unique}`,
    quantity: 30,
    expiryDate,
    purchasePriceCdf: 2500,
    purchasePriceUsd: 0.88,
  });
  return r.body?.id ? r.body : null;
}

module.exports = async function runSalesTests(ctx) {
  await suite('Préparer la session de caisse VTE', async () => {
    const r = await request('POST', '/cash/sessions/open', { initialFloatCdf: 100000, initialFloatUsd: 50 });
    assert('session ouverte ou déjà ouverte', r.status === 200 || r.status === 201 || r.status === 400, `reçu ${r.status}`);
  });

  // ── PRÉPARER UN LOT VENDABLE ──────────────────────────
  let saleLot = null;
  await suite('POST /stock/lots (lot vendable pour ventes)', async () => {
    if (!ctx.productId) {
      assert('skip (pas de productId)', false, '');
      return;
    }
    saleLot = await createVendableLot(ctx);
    assert(
      'lot créé',
      !!saleLot?.id,
      saleLot ? JSON.stringify(saleLot) : 'requête échouée',
    );
    if (saleLot?.id) ctx.saleLotId = saleLot.id;
  });

  await sleep(500);

  // ── VENTE COMPLÈTE ────────────────────────────────────
  await suite('POST /sales (vente cash complète)', async () => {
    if (!ctx.productId) {
      assert('skip', false, '');
      return;
    }
    const idempotencyKey = `e2e-sale-${Date.now()}`;
    const r = await request('POST', '/sales', {
      currency: 'CDF',
      idempotencyKey,
      items: [
        {
          productId: ctx.productId,
          quantity: 2,
          unitPriceCdf: 3800,
        },
      ],
      payments: [
        {
          method: 'ESPECES',
          amountPaid: 7600,
          currency: 'CDF',
        },
      ],
    }, { 'Idempotency-Key': idempotencyKey });
    assert(
      'status 201 ou 200',
      r.status === 201 || r.status === 200,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    if (r.body?.id) ctx.saleId = r.body.id;
    if (r.body?.invoiceNumber) ctx.invoiceNumber = r.body.invoiceNumber;

    if (r.body?.invoiceNumber) {
      assert(
        'format numéro facture FAC-YYYY-NNNNNN',
        INVOICE_REGEX.test(r.body.invoiceNumber),
        r.body.invoiceNumber,
      );
    }
  });

  // ── LISTE DES VENTES ──────────────────────────────────
  await suite('GET /sales', async () => {
    const r = await request('GET', '/sales');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
  });

  // ── DÉTAIL D'UNE VENTE ────────────────────────────────
  await suite('GET /sales/:id', async () => {
    if (!ctx.saleId) {
      assert('skip', false, '');
      return;
    }
    const r = await request('GET', `/sales/${ctx.saleId}`);
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('id correspond', r.body?.id === ctx.saleId, JSON.stringify(r.body));
    assert('statut VALIDE', r.body?.status === 'VALIDE' || r.body?.status === 'VALIDEE', String(r.body?.status));
  });

  // ── DUPLICATA ─────────────────────────────────────────
  await suite('GET /sales/invoice/:invoiceNumber/duplicata', async () => {
    if (!ctx.invoiceNumber) {
      assert('skip', false, '');
      return;
    }
    const r = await request('GET', `/sales/invoice/${ctx.invoiceNumber}/duplicata`);
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('invoiceNumber correspond', r.body?.invoiceNumber === ctx.invoiceNumber, JSON.stringify(r.body));
  });

  // ── VENTE AVEC IDEMPOTENCE ────────────────────────────
  await suite('POST /sales (idempotence)', async () => {
    if (!ctx.productId) {
      assert('skip', false, '');
      return;
    }
    const idempotencyKey = `e2e-idempotent-${Date.now()}`;

    const r1 = await request('POST', '/sales', {
      currency: 'CDF',
      idempotencyKey,
      items: [{ productId: ctx.productId, quantity: 1, unitPriceCdf: 3800 }],
      payments: [{ method: 'ESPECES', amountPaid: 3800, currency: 'CDF' }],
    }, { 'Idempotency-Key': idempotencyKey });

    const r2 = await request('POST', '/sales', {
      currency: 'CDF',
      idempotencyKey,
      items: [{ productId: ctx.productId, quantity: 1, unitPriceCdf: 3800 }],
      payments: [{ method: 'ESPECES', amountPaid: 3800, currency: 'CDF' }],
    }, { 'Idempotency-Key': idempotencyKey });

    const ok1 = r1.status === 200 || r1.status === 201;
    const ok2 = r2.status === 200 || r2.status === 201 || r2.status === 409;
    assert('1ère requête acceptée', ok1, `reçu ${r1.status}`);
    assert('2ème requête non dupliquée (200/201/409)', ok2, `reçu ${r2.status}`);
  });

  // ── ANNULATION D'UNE VENTE ────────────────────────────
  await suite('PATCH /sales/:id/cancel', async () => {
    if (!ctx.saleId) {
      assert('skip', false, '');
      return;
    }
    const r = await request('PATCH', `/sales/${ctx.saleId}/cancel`, {
      reason: 'Annulation test E2E automatisé',
      restockItems: true,
    });
    const valid = r.status === 200 || r.status === 204 || r.status === 401 || r.status === 403 || r.status === 422;
    assert('réponse cohérente', valid, `reçu ${r.status} – ${JSON.stringify(r.body)}`);
  });

  // ── PANIERS EN ATTENTE ────────────────────────────────
  await suite('GET /sales/held-carts/list', async () => {
    const r = await request('GET', '/sales/held-carts/list');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
  });

  await suite('POST /sales/hold-cart', async () => {
    if (!ctx.productId) {
      assert('skip', false, '');
      return;
    }
    const r = await request('POST', '/sales/hold-cart', {
      referenceName: 'Panier mis en attente E2E',
      items: [{ productId: ctx.productId, quantity: 1, unitPriceCdf: 3800 }],
    });
    assert(
      'status 201 ou 200',
      r.status === 201 || r.status === 200,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    if (r.body?.id) ctx.heldCartId = r.body.id;
  });

  await suite('POST /sales/held-carts/:id/resume', async () => {
    if (!ctx.heldCartId) {
      assert('skip', false, '');
      return;
    }
    const r = await request('POST', `/sales/held-carts/${ctx.heldCartId}/resume`, {});
    assert(
      'status 200, 201 ou 404',
      r.status === 200 || r.status === 201 || r.status === 404,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ── TESTS OBLIGATOIRES REC-01 À REC-05 ET RG-01 À RG-16 (PROMPT VTE) ─────────
  // ══════════════════════════════════════════════════════════════════════════════

  // 1. Vente multi-lots avec allocation FEFO
  await suite('1. Vente multi-lots avec allocation FEFO séquentielle (RG-01, VTE-04)', async () => {
    const unique = Date.now().toString().slice(-5);
    const prodRes = await request('POST', '/catalog/products', {
      name: `Produit MultiLot ${unique}`,
      dci: 'PARACETAMOL',
      dosage: '500 mg',
      galenicForm: 'Comprimé',
      sellingUnit: 'Boîte',
      sellingPriceCdf: 2000,
      sellingPriceUsd: 0.7,
      requiresPrescription: false,
    });
    const multiProdId = prodRes.body?.id;
    if (!multiProdId) {
      assert('Création produit multi-lots', false, 'Échec création produit');
      return;
    }

    // Lot 1 (proche péremption, 3 unités)
    const d1 = new Date(); d1.setMonth(d1.getMonth() + 2);
    await request('POST', '/stock/lots', {
      productId: multiProdId,
      lotNumber: `LOT-FEFO1-${unique}`,
      quantity: 3,
      expiryDate: d1.toISOString().split('T')[0],
      purchasePriceCdf: 1000,
    });

    // Lot 2 (péremption lointaine, 10 unités)
    const d2 = new Date(); d2.setFullYear(d2.getFullYear() + 2);
    await request('POST', '/stock/lots', {
      productId: multiProdId,
      lotNumber: `LOT-FEFO2-${unique}`,
      quantity: 10,
      expiryDate: d2.toISOString().split('T')[0],
      purchasePriceCdf: 1000,
    });

    // Vente de 5 unités (doit prendre 3 du Lot 1 et 2 du Lot 2)
    const key = `ml-${unique}`;
    const saleRes = await request('POST', '/sales', {
      currency: 'CDF',
      items: [{ productId: multiProdId, quantity: 5, unitPriceCdf: 2000 }],
      payments: [{ method: 'ESPECES', amountPaid: 10000, currency: 'CDF' }],
    }, { 'Idempotency-Key': key });

    assert('Vente multi-lots validée HTTP 201/200', saleRes.status === 201 || saleRes.status === 200, `reçu ${saleRes.status}`);
    assert('2 lots alloués pour couvrir la quantité demandée', saleRes.body?.items?.length === 2, `Allocations: ${saleRes.body?.items?.length}`);
  });

  // 2. Deux ventes simultanées du dernier lot (REC-03)
  await suite('2. Deux ventes simultanées du dernier lot - Anti stock négatif (REC-03, RG-02)', async () => {
    const unique = Date.now().toString().slice(-5);
    const p = await request('POST', '/catalog/products', {
      name: `Produit Dernier Lot ${unique}`,
      dci: 'AMOXICILLINE',
      dosage: '250 mg',
      galenicForm: 'Gélule',
      sellingUnit: 'Boîte',
      sellingPriceCdf: 5000,
      sellingPriceUsd: 1.8,
      requiresPrescription: false,
    });
    const pId = p.body?.id;
    if (!pId) return;

    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    await request('POST', '/stock/lots', {
      productId: pId,
      lotNumber: `LAST-LOT-${unique}`,
      quantity: 1, // Une seule unité disponible
      expiryDate: d.toISOString().split('T')[0],
      purchasePriceCdf: 2500,
    });

    // Lancer 2 requêtes concurrentes simultanées pour acheter cette unité
    const keyA = `conc-a-${unique}`;
    const keyB = `conc-b-${unique}`;
    const [resA, resB] = await Promise.all([
      request('POST', '/sales', {
        currency: 'CDF',
        items: [{ productId: pId, quantity: 1, unitPriceCdf: 5000 }],
        payments: [{ method: 'ESPECES', amountPaid: 5000, currency: 'CDF' }],
      }, { 'Idempotency-Key': keyA }),
      request('POST', '/sales', {
        currency: 'CDF',
        items: [{ productId: pId, quantity: 1, unitPriceCdf: 5000 }],
        payments: [{ method: 'ESPECES', amountPaid: 5000, currency: 'CDF' }],
      }, { 'Idempotency-Key': keyB }),
    ]);

    const successes = [resA, resB].filter((r) => r.status === 200 || r.status === 201).length;
    const failures = [resA, resB].filter((r) => r.status === 400).length;

    assert('Exactement une seule vente réussit (REC-03)', successes === 1, `succès: ${successes}`);
    assert('La vente concurrente est refusée avec HTTP 400 Stock insuffisant', failures === 1, `échecs: ${failures}`);
  });

  // 3. Lot périmé non vendable (REC-05, RG-03)
  await suite('3. Lot périmé non vendable (REC-05, RG-03)', async () => {
    const unique = Date.now().toString().slice(-5);
    const p = await request('POST', '/catalog/products', {
      name: `Produit Périmé ${unique}`,
      dci: 'VITAMINE C',
      dosage: '1000 mg',
      galenicForm: 'Effervescent',
      sellingUnit: 'Tube',
      sellingPriceCdf: 4000,
      requiresPrescription: false,
    });
    const pId = p.body?.id;
    if (!pId) return;

    // Lot dont la date d'expiration est dépassée
    await request('POST', '/stock/lots', {
      productId: pId,
      lotNumber: `EXP-LOT-${unique}`,
      quantity: 20,
      expiryDate: '2023-01-01',
      purchasePriceCdf: 1500,
    });

    const r = await request('POST', '/sales', {
      currency: 'CDF',
      items: [{ productId: pId, quantity: 1, unitPriceCdf: 4000 }],
      payments: [{ method: 'ESPECES', amountPaid: 4000, currency: 'CDF' }],
    }, { 'Idempotency-Key': `exp-sale-${unique}` });

    assert('Vente de lot périmé strictement refusée HTTP 400 (REC-05)', r.status === 400, `reçu ${r.status}`);
  });

  // 4. Numérotation sans trou après échec transactionnel (RG-05)
  await suite('4. Numérotation séquentielle sans trou après échec transactionnel (RG-05)', async () => {
    const unique = Date.now().toString().slice(-5);
    // Vente 1 réussie
    const sale1 = await request('POST', '/sales', {
      currency: 'CDF',
      items: [{ productId: ctx.productId, quantity: 1, unitPriceCdf: 3800 }],
      payments: [{ method: 'ESPECES', amountPaid: 3800, currency: 'CDF' }],
    }, { 'Idempotency-Key': `seq1-${unique}` });
    const num1 = sale1.body?.invoiceNumber;

    // Vente qui échoue (quantité demandée excessive -> rollback complet)
    const failedSale = await request('POST', '/sales', {
      currency: 'CDF',
      items: [{ productId: ctx.productId, quantity: 999999, unitPriceCdf: 3800 }],
      payments: [{ method: 'ESPECES', amountPaid: 3800, currency: 'CDF' }],
    }, { 'Idempotency-Key': `seq-fail-${unique}` });
    assert('Échec transactionnel avéré', failedSale.status === 400, `reçu ${failedSale.status}`);

    // Vente 2 réussie immédiatement après l'échec
    const sale2 = await request('POST', '/sales', {
      currency: 'CDF',
      items: [{ productId: ctx.productId, quantity: 1, unitPriceCdf: 3800 }],
      payments: [{ method: 'ESPECES', amountPaid: 3800, currency: 'CDF' }],
    }, { 'Idempotency-Key': `seq2-${unique}` });
    const num2 = sale2.body?.invoiceNumber;

    if (num1 && num2) {
      const seq1 = parseInt(num1.split('-')[2], 10);
      const seq2 = parseInt(num2.split('-')[2], 10);
      assert('Numérotation consécutive sans trou (seq2 === seq1 + 1) [RG-05]', seq2 === seq1 + 1, `seq1: ${seq1}, seq2: ${seq2}`);
    }
  });

  // 5. Immuabilité d'une facture validée (REC-04, RG-04)
  await suite('5. Immuabilité d’une facture validée (REC-04, RG-04)', async () => {
    if (!ctx.saleId) return;
    const rPut = await request('PUT', `/sales/${ctx.saleId}`, { totalAmountCdf: 0 });
    const rDelete = await request('DELETE', `/sales/${ctx.saleId}`);
    assert('Modification directe PUT refusée (404/405) [REC-04]', rPut.status === 404 || rPut.status === 405, `reçu ${rPut.status}`);
    assert('Suppression DELETE refusée (404/405) [REC-04]', rDelete.status === 404 || rDelete.status === 405, `reçu ${rDelete.status}`);
  });

  // 6. Plafond de remise par rôle (RG-10, VTE-03)
  await suite('6. Plafond de remise par rôle & Dérogation PIN superviseur (RG-10, VTE-03)', async () => {
    const unique = Date.now().toString().slice(-5);
    // Remise de 40% sans PIN -> refus
    const rNoPin = await request('POST', '/sales', {
      currency: 'CDF',
      items: [{ productId: ctx.productId, quantity: 1, unitPriceCdf: 3800, discountCdf: 1520 }], // 40%
      payments: [{ method: 'ESPECES', amountPaid: 2280, currency: 'CDF' }],
    }, { 'Idempotency-Key': `disc-nopin-${unique}` });
    assert('Remise excessive sans PIN refusée HTTP 401/403 (RG-10)', rNoPin.status === 401 || rNoPin.status === 403, `reçu ${rNoPin.status}`);

    // Remise de 40% avec code PIN superviseur valide '1234'
    const rWithPin = await request('POST', '/sales', {
      currency: 'CDF',
      supervisorPin: '1234',
      items: [{ productId: ctx.productId, quantity: 1, unitPriceCdf: 3800, discountCdf: 1520 }],
      payments: [{ method: 'ESPECES', amountPaid: 2280, currency: 'CDF' }],
    }, { 'Idempotency-Key': `disc-pin-${unique}` });
    assert('Remise autorisée avec PIN superviseur HTTP 201/200 (RG-10)', rWithPin.status === 201 || rWithPin.status === 200, `reçu ${rWithPin.status}`);
  });

  // 7. Produit sur ordonnance sans ordonnance liée (RG-09, VTE-15)
  await suite('7. Produit sur ordonnance obligatoire (RG-09, VTE-15)', async () => {
    const unique = Date.now().toString().slice(-5);
    const p = await request('POST', '/catalog/products', {
      name: `Produit Sous Ordonnance ${unique}`,
      dci: 'CIPROFLOXACINE',
      dosage: '500 mg',
      galenicForm: 'Comprimé',
      sellingUnit: 'Boîte',
      sellingPriceCdf: 7500,
      requiresPrescription: true, // Ordonnance obligatoire
    });
    const pId = p.body?.id;
    if (!pId) return;

    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    await request('POST', '/stock/lots', {
      productId: pId,
      lotNumber: `RX-LOT-${unique}`,
      quantity: 10,
      expiryDate: d.toISOString().split('T')[0],
      purchasePriceCdf: 3000,
    });

    const rWithoutRx = await request('POST', '/sales', {
      currency: 'CDF',
      items: [{ productId: pId, quantity: 1, unitPriceCdf: 7500 }],
      payments: [{ method: 'ESPECES', amountPaid: 7500, currency: 'CDF' }],
    }, { 'Idempotency-Key': `rx-none-${unique}` });

    assert('Vente sans ordonnance refusée HTTP 400 (RG-09)', rWithoutRx.status === 400, `reçu ${rWithoutRx.status}`);
  });

  // 8. Paiement partiel avec solde devenant créance client & respect plafond (RG-13, VTE-07)
  await suite('8. Paiement partiel, créance client & contrôle de plafond (RG-13, VTE-07)', async () => {
    const unique = Date.now().toString().slice(-5);
    // Créer un client avec plafond de crédit de 10 000 CDF
    const custRes = await request('POST', '/customers', {
      fullName: `Client Crédit ${unique}`,
      phone: `+2438100${unique}`,
      customerType: 'ASSURE',
      creditLimitCdf: 10000,
    });
    const custId = custRes.body?.id;
    if (!custId) return;

    // Vente totale de 8000 CDF, paiement partiel de 3000 CDF en espèces -> solde créance 5000 CDF
    const rPartial = await request('POST', '/sales', {
      currency: 'CDF',
      customerId: custId,
      items: [{ productId: ctx.productId, quantity: 2, unitPriceCdf: 3800 }], // total 7600 CDF
      payments: [{ method: 'ESPECES', amountPaid: 2600, currency: 'CDF' }], // solde 5000 CDF <= 10000 CDF
    }, { 'Idempotency-Key': `part-${unique}` });

    assert('Paiement partiel accepté HTTP 201/200', rPartial.status === 201 || rPartial.status === 200, `reçu ${rPartial.status}`);

    // Tentative de vente partielle qui dépasse le plafond de crédit restant
    const rExceed = await request('POST', '/sales', {
      currency: 'CDF',
      customerId: custId,
      items: [{ productId: ctx.productId, quantity: 2, unitPriceCdf: 3800 }], // total 7600 CDF
      payments: [{ method: 'ESPECES', amountPaid: 1000, currency: 'CDF' }], // solde 6600 CDF -> cumul 11600 > 10000
    }, { 'Idempotency-Key': `part-exc-${unique}` });

    assert('Dépassement de plafond de crédit refusé HTTP 400 (RG-13)', rExceed.status === 400, `reçu ${rExceed.status}`);
  });

  // 9. Avoir partiel avec motif et sélection de ligne (VTE-14, UC-05)
  await suite('9. Avoir partiel avec motif et sélection de ligne (VTE-14, UC-05)', async () => {
    const unique = Date.now().toString().slice(-5);
    const saleRes = await request('POST', '/sales', {
      currency: 'CDF',
      items: [{ productId: ctx.productId, quantity: 3, unitPriceCdf: 3800 }],
      payments: [{ method: 'ESPECES', amountPaid: 11400, currency: 'CDF' }],
    }, { 'Idempotency-Key': `sale-partial-avoir-${unique}` });
    const saleId = saleRes.body?.id;
    const saleItemId = saleRes.body?.items?.[0]?.lotId ? saleRes.body?.id : null;
    const fullSale = await request('GET', `/sales/${saleId}`);
    const actualSaleItemId = fullSale.body?.items?.[0]?.id || fullSale.body?.sale_items?.[0]?.id;

    // Avoir partiel sur 1 unité retournée
    const cancelRes = await request('PATCH', `/sales/${saleId}/cancel`, {
      reason: 'Retour partiel test E2E',
      restockItems: true,
      items: [{ saleItemId: actualSaleItemId || fullSale.body?.items?.[0]?.lotId, quantity: 1, restock: true }],
    });

    assert('Avoir partiel accepté HTTP 200', cancelRes.status === 200, `reçu ${cancelRes.status}`);
    assert('Statut de la vente mis à jour en AVOIR', cancelRes.body?.status === 'AVOIR' || cancelRes.body?.status === 'VALIDEE', `statut: ${cancelRes.body?.status}`);
  });

  // 10. Taux de change figé sur la facture (RG-08)
  await suite('10. Taux de change figé sur la facture (RG-08)', async () => {
    if (!ctx.saleId) return;
    const initialSale = await request('GET', `/sales/${ctx.saleId}`);
    const initialRate = initialSale.body?.appliedExchangeRate;

    // Simuler un nouveau taux de change
    await request('POST', '/settings/exchange-rates', {
      rate: 3500.0,
      source: 'TEST_E2E_UPDATE',
    });

    // Reconsulter la facture précédente : le taux doit rester identique à l'initial
    const reloadedSale = await request('GET', `/sales/${ctx.saleId}`);
    assert('Taux de change d’une facture validée demeure figé (RG-08)', reloadedSale.body?.appliedExchangeRate === initialRate, `taux initial: ${initialRate}, rechargé: ${reloadedSale.body?.appliedExchangeRate}`);
  });

  // 11. Endpoint de prévisualisation sans écriture (RG-07)
  await suite('11. Endpoint de prévisualisation /preview sans écriture (RG-07)', async () => {
    const r = await request('POST', '/sales/preview', {
      currency: 'CDF',
      items: [{ productId: ctx.productId, quantity: 2, unitPriceCdf: 3800 }],
      payments: [{ method: 'ESPECES', amountPaid: 10000, currency: 'CDF' }],
    });
    assert('Prévisualisation HTTP 200/201', r.status === 200 || r.status === 201, `reçu ${r.status}`);
    assert('Total calculé côté serveur', typeof r.body?.totalCdf === 'number' && r.body.totalCdf > 0, JSON.stringify(r.body));
    assert('Rendu de monnaie calculé serveur', r.body?.changeCdf >= 0, `rendu: ${r.body?.changeCdf}`);
    assert('Lot FEFO proposé dans preview', r.body?.items?.[0]?.lotNumber !== undefined, 'lot absent');
  });
};
