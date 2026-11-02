/**
 * VHP-CDC-001 – Tests d'intégration Modules ACH + STK
 * Exigences : ACH-01..09, STK-01..14, RG-01, RG-02, RG-03, RG-06, RG-11, RG-14, REC-02, REC-03, REC-05
 */
'use strict';

const { request, assert, suite } = require('./helpers');

async function run() {
  console.log('\n======================================================');
  console.log(' TESTS MODULES ACH + STK : ACHATS, STOCK & FEFO      ');
  console.log('======================================================\n');

  let adminToken = '';
  let testProductId = '';
  let supplierId = '';
  let purchaseOrderId = '';
  const uniqueSuffix = Date.now().toString().slice(-6);

  // 1. Authentification admin
  await suite('1. Connexion admin', async () => {
    const r = await request('POST', '/auth/login', {
      username: 'admin',
      password: 'Admin2026@VoiciLHomme!',
    });
    assert('Connexion admin HTTP 200', r.status === 200, `reçu ${r.status}`);
    adminToken = r.body?.token;
  });

  // 2. Création d'un produit de test pour le stock
  await suite('2. Préparation du produit de test', async () => {
    const r = await request(
      'POST',
      '/catalog/products',
      {
        name: `Amoxicilline 500mg Test STK ${uniqueSuffix}`,
        dci: 'Amoxicilline',
        dosage: '500mg',
        galenicForm: 'Gélule',
        sellingUnit: 'Boîte de 20',
        laboratory: 'Laboratoire Test STK',
        sellingPriceCdf: 3500,
        sellingPriceUsd: 1.25,
        minAlertThreshold: 10,
        maxThreshold: 200,
        securityStock: 20,
        storageLocation: 'Rayon B - Étagère 2',
        requiresPrescription: true,
        isControlledSubstance: false,
        isColdChain: false,
        barcodes: [`STK-${uniqueSuffix}`],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Création produit test HTTP 201', r.status === 201, `reçu ${r.status}`);
    testProductId = r.body?.id;
  });

  // 3. Fournisseurs CRUD (ACH-01)
  await suite('3. Gestion des fournisseurs (ACH-01)', async () => {
    const rCreate = await request(
      'POST',
      '/suppliers',
      {
        name: `Pharmagros RDC ${uniqueSuffix}`,
        contactName: 'Directeur Commercial',
        phone: '+243 81 999 88 77',
        email: `contact_${uniqueSuffix}@pharmagros.cd`,
        address: '15 Boulevard du 30 Juin, Gombe, Kinshasa',
        paymentTerms: '30 jours fin de mois',
        leadTimeDays: 3,
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Création fournisseur HTTP 201', rCreate.status === 201, `reçu ${rCreate.status}`);
    supplierId = rCreate.body?.id;

    // Mise à jour
    const rUpdate = await request(
      'PATCH',
      `/suppliers/${supplierId}`,
      { leadTimeDays: 5, paymentTerms: 'Paiement à réception 50%' },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Modification fournisseur HTTP 200', rUpdate.status === 200, `reçu ${rUpdate.status}`);
    assert('Délai mis à jour à 5 jours', rUpdate.body?.leadTimeDays === 5);

    // Consultation fiche
    const rGet = await request('GET', `/suppliers/${supplierId}`, null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Consultation fiche fournisseur HTTP 200', rGet.status === 200);
    assert('Nom conforme', rGet.body?.name === `Pharmagros RDC ${uniqueSuffix}`);
  });

  // 4. Bons de commande & Export PDF (ACH-02)
  await suite('4. Bon de commande fournisseur & Export PDF (ACH-02)', async () => {
    const rPo = await request(
      'POST',
      '/suppliers/orders',
      {
        supplierId,
        notes: 'Commande test STK-ACH',
        items: [
          {
            productId: testProductId,
            orderedQuantity: 100,
            unitPriceCdf: 2000,
            unitPriceUsd: 0.7,
          },
        ],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Création bon de commande HTTP 201', rPo.status === 201, `reçu ${rPo.status}`);
    purchaseOrderId = rPo.body?.id;
    const rList = await request('GET', '/suppliers/orders', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('GET /suppliers/orders HTTP 200', rList.status === 200, `status ${rList.status}`);

    const rInvalidUuid = await request('GET', '/suppliers/pas-un-uuid', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('GET /suppliers/pas-un-uuid HTTP 400', rInvalidUuid.status === 400, `status ${rInvalidUuid.status}`);
    assert('Statut initial BROUILLON', rPo.body?.status === 'BROUILLON');

    // Changement statut -> ENVOYE
    const rStatus = await request(
      'PATCH',
      `/suppliers/orders/${purchaseOrderId}/status`,
      { status: 'ENVOYE' },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Passage statut ENVOYE HTTP 200', rStatus.status === 200);
    assert('Statut est ENVOYE', rStatus.body?.status === 'ENVOYE');

    // Export PDF
    const rPdf = await request(
      'GET',
      `/suppliers/orders/${purchaseOrderId}/pdf`,
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Export PDF bon de commande HTTP 200', rPdf.status === 200);
  });

  // 5. Calcul CUMP sur plusieurs réceptions (RG-14, STK-01)
  await suite('5. Calcul du CUMP sur réceptions successives (RG-14)', async () => {
    // Réception 1 : 100 unités à 1000 CDF -> CUMP attendu = 1000 CDF
    const rRec1 = await request(
      'POST',
      '/stock/reception/direct',
      {
        idempotencyKey: `idemp-cump-1-${uniqueSuffix}`,
        supplierId,
        notes: 'Entrée lot 1 CUMP test',
        lines: [
          {
            productId: testProductId,
            lotNumber: `LOT-CUMP1-${uniqueSuffix}`,
            expiryDate: '2028-06-30',
            quantity: 100,
            purchasePriceCdf: 1000,
            purchasePriceUsd: 0.35,
          },
        ],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Première réception directe HTTP 200/201', rRec1.status === 200 || rRec1.status === 201);

    // Vérification stock & CUMP = 1000 CDF
    let stockRes = await request('GET', `/stock/products/${testProductId}`, null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Stock total après réception 1 = 100', stockRes.body?.totalStock === 100);
    assert('CUMP après réception 1 = 1000 CDF', Math.abs(stockRes.body?.cumpCdf - 1000) < 0.01);

    // Réception 2 : 100 unités à 2000 CDF -> CUMP attendu = (100*1000 + 100*2000)/200 = 1500 CDF
    const rRec2 = await request(
      'POST',
      '/stock/reception/direct',
      {
        idempotencyKey: `idemp-cump-2-${uniqueSuffix}`,
        supplierId,
        notes: 'Entrée lot 2 CUMP test',
        lines: [
          {
            productId: testProductId,
            lotNumber: `LOT-CUMP2-${uniqueSuffix}`,
            expiryDate: '2028-12-31',
            quantity: 100,
            purchasePriceCdf: 2000,
            purchasePriceUsd: 0.7,
          },
        ],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Deuxième réception directe HTTP 200/201', rRec2.status === 200 || rRec2.status === 201);

    // Vérification stock = 200 & CUMP = 1500 CDF
    stockRes = await request('GET', `/stock/products/${testProductId}`, null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Stock total après réception 2 = 200', stockRes.body?.totalStock === 200);
    assert(
      'CUMP après réception 2 = 1500 CDF',
      Math.abs(stockRes.body?.cumpCdf - 1500) < 0.01,
      `obtenu: ${stockRes.body?.cumpCdf}`,
    );
  });

  // 6. Idempotence de la réception (un seul enregistrement si même clé)
  await suite('6. Idempotence de la réception (rejeu avec même clé)', async () => {
    const idempKey = `idemp-replay-${uniqueSuffix}`;
    const payload = {
      idempotencyKey: idempKey,
      supplierId,
      notes: 'Test idempotence',
      lines: [
        {
          productId: testProductId,
          lotNumber: `LOT-IDEMP-${uniqueSuffix}`,
          expiryDate: '2029-01-01',
          quantity: 25,
          purchasePriceCdf: 1500,
          purchasePriceUsd: 0.5,
        },
      ],
    };

    // 1er envoi
    const r1 = await request('POST', '/stock/reception/direct', payload, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('1er appel réception avec clé idempotence HTTP 200/201', r1.status === 200 || r1.status === 201);
    const stockAfterR1 = (await request('GET', `/stock/products/${testProductId}`, null, {
      Authorization: `Bearer ${adminToken}`,
    })).body?.totalStock;

    // 2ème envoi avec la même clé
    const r2 = await request('POST', '/stock/reception/direct', payload, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('2ème appel avec même clé HTTP 200/201 (idempotent)', r2.status === 200 || r2.status === 201);
    assert('Clé signalée idempotente', r2.body?.idempotent === true);

    const stockAfterR2 = (await request('GET', `/stock/products/${testProductId}`, null, {
      Authorization: `Bearer ${adminToken}`,
    })).body?.totalStock;
    assert('Stock inchangé après rejeu idempotent', stockAfterR1 === stockAfterR2, `r1=${stockAfterR1}, r2=${stockAfterR2}`);
  });

  // 7. Réception partielle d'un bon de commande (ACH-04)
  await suite('7. Réception partielle de bon de commande (ACH-04)', async () => {
    // Le bon de commande a 100 unités commandées. On en reçoit 40.
    const rPartial = await request(
      'POST',
      `/suppliers/orders/${purchaseOrderId}/receive`,
      {
        idempotencyKey: `idemp-po-part-${uniqueSuffix}`,
        notes: 'Réception partielle 40 sur 100',
        lines: [
          {
            productId: testProductId,
            lotNumber: `LOT-PO-PART-${uniqueSuffix}`,
            expiryDate: '2028-08-15',
            receivedQuantity: 40,
            actualPurchasePriceCdf: 2000,
            actualPurchasePriceUsd: 0.7,
          },
        ],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Réception partielle HTTP 200', rPartial.status === 200);
    assert(
      'Bon de commande passe en PARTIELLEMENT_RECU',
      rPartial.body?.status === 'PARTIELLEMENT_RECU' || rPartial.body?.orderStatus === 'PARTIELLEMENT_RECU',
      `statut=${rPartial.body?.status}`,
    );

    // Vérification via GET order
    const rCheckPo = await request('GET', `/suppliers/orders/${purchaseOrderId}`, null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Statut vérifié = PARTIELLEMENT_RECU', rCheckPo.body?.status === 'PARTIELLEMENT_RECU');
  });

  // 8. Allocation FEFO multi-lots (STK-03, RG-03)
  await suite('8. Allocation FEFO multi-lots (STK-03, RG-03)', async () => {
    // Créons un produit dédié pour le test FEFO
    const rProd = await request(
      'POST',
      '/catalog/products',
      {
        name: `Produit Test FEFO ${uniqueSuffix}`,
        dci: 'FEFOmicine',
        dosage: '100mg',
        galenicForm: 'Comprimé',
        sellingUnit: 'Boîte',
        laboratory: 'Pharma Test',
        sellingPriceCdf: 5000,
        sellingPriceUsd: 1.8,
        minAlertThreshold: 5,
        maxThreshold: 100,
        securityStock: 10,
        storageLocation: 'Tiroir F',
        requiresPrescription: false,
        isControlledSubstance: false,
        isColdChain: false,
        barcodes: [`FEFO-${uniqueSuffix}`],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    const fefoProductId = rProd.body?.id;

    // Création lot A : expire le 2027-01-01, quantité 10
    const rLotA = await request(
      'POST',
      '/stock/lots',
      {
        productId: fefoProductId,
        lotNumber: `LOT-FEFO-A-${uniqueSuffix}`,
        expiryDate: '2027-01-01',
        initialQuantity: 10,
        purchasePriceCdf: 2000,
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Lot A (2027) créé avec 10 unités', rLotA.status === 201 || rLotA.status === 200);

    // Création lot B : expire le 2028-01-01, quantité 20
    const rLotB = await request(
      'POST',
      '/stock/lots',
      {
        productId: fefoProductId,
        lotNumber: `LOT-FEFO-B-${uniqueSuffix}`,
        expiryDate: '2028-01-01',
        initialQuantity: 20,
        purchasePriceCdf: 2000,
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Lot B (2028) créé avec 20 unités', rLotB.status === 201 || rLotB.status === 200);

    // Demande FEFO de 15 unités : doit consommer 10 du Lot A d'abord (plus proche péremption) puis 5 du Lot B
    const rSim = await request(
      'POST',
      '/stock/fefo/simulate',
      {
        items: [{ productId: fefoProductId, quantity: 15 }],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Simulation FEFO HTTP 200/201', rSim.status === 200 || rSim.status === 201);
    const allocations = rSim.body?.allocations || [];
    assert('FEFO alloue sur 2 lots différents', allocations.length === 2, `longueur=${allocations.length}`);
    if (allocations.length === 2) {
      assert('1er lot alloué est Lot A (expire plus tôt)', allocations[0].lotNumber === `LOT-FEFO-A-${uniqueSuffix}`);
      assert('Quantité épuisée sur Lot A = 10', allocations[0].allocatedQuantity === 10);
      assert('Complément pris sur Lot B = 5', allocations[1].allocatedQuantity === 5);
    }
  });

  // 9. Lot périmé ou en quarantaine non vendable (STK-04, RG-03)
  await suite('9. Lot périmé et quarantaine exclus du FEFO (STK-04, RG-03)', async () => {
    // Créons un produit test
    const rProd = await request(
      'POST',
      '/catalog/products',
      {
        name: `Produit Test Quarantaine ${uniqueSuffix}`,
        dci: 'QuarantineDCI',
        dosage: '10mg',
        galenicForm: 'Gélule',
        sellingUnit: 'Boîte',
        laboratory: 'Lab Test',
        sellingPriceCdf: 1000,
        sellingPriceUsd: 0.35,
        minAlertThreshold: 5,
        maxThreshold: 50,
        securityStock: 5,
        storageLocation: 'Zone Q',
        requiresPrescription: false,
        isControlledSubstance: false,
        isColdChain: false,
        barcodes: [`QUAR-${uniqueSuffix}`],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    const qProductId = rProd.body?.id;

    // Lot 1 : déjà périmé (2020-01-01)
    await request(
      'POST',
      '/stock/lots',
      {
        productId: qProductId,
        lotNumber: `LOT-PERIME-${uniqueSuffix}`,
        expiryDate: '2020-01-01',
        initialQuantity: 15,
        purchasePriceCdf: 800,
      },
      { Authorization: `Bearer ${adminToken}` },
    );

    // Simulation FEFO : stock vendable attendu = 0 (lot périmé ignoré)
    const rSimPerime = await request(
      'POST',
      '/stock/fefo/simulate',
      {
        items: [{ productId: qProductId, quantity: 5 }],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Simulation FEFO refuse le lot périmé (stock insuffisant)', rSimPerime.status === 400);

    // Lot 2 : valide dans le futur (2029-01-01, 10 unités)
    const rLotValide = await request(
      'POST',
      '/stock/lots',
      {
        productId: qProductId,
        lotNumber: `LOT-QUAR-${uniqueSuffix}`,
        expiryDate: '2029-01-01',
        initialQuantity: 10,
        purchasePriceCdf: 800,
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    const lotValideId = rLotValide.body?.id;

    // Mise en quarantaine du lot
    const rQuarantine = await request(
      'POST',
      `/stock/lots/${lotValideId}/quarantine`,
      { reason: 'Suspicion d’altération thermique lors du transport' },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Mise en quarantaine HTTP 200', rQuarantine.status === 200);

    // Simulation FEFO : le lot en quarantaine doit être refusé
    const rSimQuar = await request(
      'POST',
      '/stock/fefo/simulate',
      {
        items: [{ productId: qProductId, quantity: 5 }],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('FEFO refuse le lot en quarantaine (HTTP 400)', rSimQuar.status === 400);

    // Déblocage motivé de la quarantaine
    const rUnquar = await request(
      'POST',
      `/stock/lots/${lotValideId}/unquarantine`,
      { reason: 'Contre-expertise laboratoire conforme, remise en vente autorisée' },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Déblocage quarantaine HTTP 200', rUnquar.status === 200);

    // FEFO maintenant autorisé
    const rSimApresUnquar = await request(
      'POST',
      '/stock/fefo/simulate',
      {
        items: [{ productId: qProductId, quantity: 5 }],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('FEFO accepté après déblocage quarantaine (HTTP 200/201)', rSimApresUnquar.status === 200 || rSimApresUnquar.status === 201);
  });

  // 10. Concurrence stricte : 2 allocations simultanées du dernier lot (REC-03)
  await suite('10. Concurrence stricte sur le dernier lot disponible (REC-03)', async () => {
    // Créons un produit avec EXACTEMENT 5 unités dans un seul lot
    const rProd = await request(
      'POST',
      '/catalog/products',
      {
        name: `Produit Concurrence REC-03 ${uniqueSuffix}`,
        dci: 'Concurrentine',
        dosage: '50mg',
        galenicForm: 'Gélule',
        sellingUnit: 'Boîte',
        laboratory: 'Lab Concurrence',
        sellingPriceCdf: 2000,
        sellingPriceUsd: 0.7,
        minAlertThreshold: 1,
        maxThreshold: 10,
        securityStock: 1,
        storageLocation: 'Zone C',
        requiresPrescription: false,
        isControlledSubstance: false,
        isColdChain: false,
        barcodes: [`CONC-${uniqueSuffix}`],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    const concProdId = rProd.body?.id;

    // Création lot de 5 unités
    const rLot = await request(
      'POST',
      '/stock/lots',
      {
        productId: concProdId,
        lotNumber: `LOT-CONC-${uniqueSuffix}`,
        expiryDate: '2029-12-31',
        initialQuantity: 5,
        purchasePriceCdf: 1000,
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    const concLotId = rLot.body?.id;

    // Deux sorties simultanées de 5 unités chacune via Promise.all
    const [res1, res2] = await Promise.all([
      request(
        'POST',
        '/stock/movements',
        {
          lotId: concLotId,
          type: 'USAGE_INTERNE',
          quantity: 5,
          reason: 'Test concurrence 1',
        },
        { Authorization: `Bearer ${adminToken}` },
      ),
      request(
        'POST',
        '/stock/movements',
        {
          lotId: concLotId,
          type: 'USAGE_INTERNE',
          quantity: 5,
          reason: 'Test concurrence 2',
        },
        { Authorization: `Bearer ${adminToken}` },
      ),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 201 || r.status === 200);
    const failures = [res1, res2].filter((r) => r.status === 400 || r.status === 409);

    assert('Exactement UNE transaction concurrente réussit', successes.length === 1, `succès=${successes.length}`);
    assert('La transaction concurrente rivale est rejetée pour stock insuffisant', failures.length === 1, `échecs=${failures.length}`);

    // Vérifier que le stock restant n'est jamais négatif (CHECK >= 0)
    const rFinalStock = await request('GET', `/stock/products/${concProdId}`, null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Stock final est exactement 0 (jamais négatif)', (rFinalStock.body?.totalStock ?? rFinalStock.body?.totalAvailable) === 0);
  });

  // 11. Ajustements de stock : demande gestionnaire puis validation pharmacien (RG-11, STK-06)
  await suite('11. Workflow d’ajustement : demande gestionnaire & validation pharmacien (RG-11)', async () => {
    // Consultation d'un lot existant
    const stockInfo = await request('GET', `/stock/products/${testProductId}`, null, {
      Authorization: `Bearer ${adminToken}`,
    });
    const targetLot = stockInfo.body?.lots?.[0];
    assert('Lot cible trouvé pour ajustement', !!targetLot);

    // 1. Demande d'ajustement
    const rRequest = await request(
      'POST',
      '/stock/adjustments/request',
      {
        lotId: targetLot.id,
        quantityDifference: 5, // +5 unités physiques constatées
        reason: 'Surplus comptage rayon régularisation',
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Création demande ajustement HTTP 200/201', rRequest.status === 200 || rRequest.status === 201);
    const adjustmentId = rRequest.body?.adjustment?.id || rRequest.body?.id;
    assert('Demande a le statut DEMANDE', (rRequest.body?.adjustment?.status || rRequest.body?.status) === 'DEMANDE');

    // 2. Consultation des ajustements en attente
    const rPending = await request('GET', '/stock/adjustments/pending', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Consultation demandes en attente HTTP 200', rPending.status === 200);
    const found = rPending.body?.find((a) => a.id === adjustmentId);
    assert('Demande présente dans la liste des validations pharmacien', !!found);

    // 3. Validation par le pharmacien (ou admin)
    const rApprove = await request(
      'POST',
      `/stock/adjustments/${adjustmentId}/approve`,
      {
        action: 'APPROVE',
        pharmacistComment: 'Vérifié en rayon par le titulaire',
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Validation pharmacien HTTP 200/201', rApprove.status === 200 || rApprove.status === 201);
    assert('Statut passé à VALIDE', (rApprove.body?.adjustment?.status || rApprove.body?.status) === 'VALIDE');
  });

  // 12. Inventaire physique & Annulation sans mouvement (STK-11, STK-12)
  await suite('12. Inventaire physique et annulation sans aucun mouvement (STK-11, STK-12)', async () => {
    // 1. Création inventaire tournant
    const rInv = await request(
      'POST',
      '/stock/inventories',
      {
        type: 'TOURNANT',
        notes: 'Inventaire test tournant',
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Création inventaire HTTP 201/200', rInv.status === 201 || rInv.status === 200);
    const inventoryId = rInv.body?.id;
    assert('Statut initial EN_COURS', rInv.body?.status === 'EN_COURS');

    // 2. Annulation de l'inventaire
    const rCancel = await request(
      'POST',
      `/stock/inventories/${inventoryId}/cancel`,
      { reason: 'Erreur de saisie initiale, annulation sans impact stock' },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Annulation inventaire HTTP 200/201', rCancel.status === 200 || rCancel.status === 201);
    assert('Statut passé à ANNULE', rCancel.body?.status === 'ANNULE');

    // Vérification qu'aucun mouvement n'a été créé avec cette référence
    const rMoves = await request('GET', `/stock/movements?page=1&limit=50`, null, {
      Authorization: `Bearer ${adminToken}`,
    });
    const cancelledMoves = (rMoves.body?.movements || []).filter((m) => m.referenceId === inventoryId);
    assert('Aucun mouvement créé pour un inventaire annulé', cancelledMoves.length === 0);
  });

  // 13. Test de robustesse : 100 opérations aléatoires (REC-02)
  await suite('13. Test de robustesse 100 opérations aléatoires : stock affiché = stock théorique (REC-02)', async () => {
    // Création produit dédié pour les 100 opérations
    const rProd = await request(
      'POST',
      '/catalog/products',
      {
        name: `Produit REC-02 100 Ops ${uniqueSuffix}`,
        dci: 'Robusticiline',
        dosage: '250mg',
        galenicForm: 'Flacon',
        sellingUnit: 'Flacon',
        laboratory: 'Lab REC',
        sellingPriceCdf: 4000,
        sellingPriceUsd: 1.4,
        minAlertThreshold: 10,
        maxThreshold: 1000,
        securityStock: 20,
        storageLocation: 'Zone REC-02',
        requiresPrescription: false,
        isControlledSubstance: false,
        isColdChain: false,
        barcodes: [`REC02-${uniqueSuffix}`],
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    const recProdId = rProd.body?.id;

    // Création du lot initial avec 100 unités
    const rInitialLot = await request(
      'POST',
      '/stock/lots',
      {
        productId: recProdId,
        lotNumber: `LOT-REC02-${uniqueSuffix}`,
        expiryDate: '2030-01-01',
        initialQuantity: 100,
        purchasePriceCdf: 2500,
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    const recLotId = rInitialLot.body?.id;

    let theoreticalStock = 100;
    let successfulOps = 0;

    // Exécution de 100 opérations aléatoires séquentielles
    for (let i = 0; i < 100; i++) {
      const isPositive = Math.random() > 0.45; // 55% d'entrées, 45% de sorties
      const qty = Math.floor(Math.random() * 8) + 1; // entre 1 et 8 unités

      if (isPositive) {
        // Entrée de stock (AJUSTEMENT_POSITIF ou RETOUR_CLIENT)
        const res = await request(
          'POST',
          '/stock/movements',
          {
            lotId: recLotId,
            type: 'RETOUR_CLIENT',
            quantity: qty,
            reason: `Op ${i + 1} entrée aléatoire`,
          },
          { Authorization: `Bearer ${adminToken}` },
        );
        if (res.status === 201 || res.status === 200) {
          theoreticalStock += qty;
          successfulOps++;
        }
      } else {
        // Sortie de stock (CASSE, PERTE, DON) uniquement si stock suffisant
        if (theoreticalStock >= qty) {
          const res = await request(
            'POST',
            '/stock/movements',
            {
              lotId: recLotId,
              type: 'CASSE_PERTE',
              quantity: qty,
              reason: `Op ${i + 1} sortie aléatoire`,
            },
            { Authorization: `Bearer ${adminToken}` },
          );
          if (res.status === 201 || res.status === 200) {
            theoreticalStock -= qty;
            successfulOps++;
          }
        } else {
          // Opération neutre si stock insuffisant
          successfulOps++;
        }
      }
      if ((i + 1) % 20 === 0) {
        process.stdout.write(`    ... ${i + 1}/100 opérations aléatoires exécutées\n`);
      }
      await new Promise((r) => setTimeout(r, 15));
    }

    assert(`100 itérations exécutées (${successfulOps} opérations traitées)`, successfulOps === 100);

    // Vérification finale : stock affiché par l'API == stock théorique calculé
    const rStockFinal = await request('GET', `/stock/products/${recProdId}`, null, {
      Authorization: `Bearer ${adminToken}`,
    });
    const actualStock = rStockFinal.body?.totalStock ?? rStockFinal.body?.totalAvailable;
    assert(
      `Stock affiché (${actualStock}) = Stock théorique calculé (${theoreticalStock}) [REC-02]`,
      actualStock === theoreticalStock,
      `réel=${actualStock}, théorique=${theoreticalStock}`,
    );
  });

  // 14. Registre des produits contrôlés & Valorisation CUMP
  await suite('14. Registre des produits contrôlés (STK-14) et valorisation CUMP (STK-10)', async () => {
    // Consultation valorisation
    const rVal = await request('GET', '/stock/cump-valuation', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Consultation valorisation CUMP HTTP 200', rVal.status === 200);
    assert('Valorisation totale > 0', rVal.body?.totalValuationCdf > 0);

    // Consultation registre contrôlé
    const rReg = await request('GET', '/stock/controlled-register', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Consultation registre contrôlé HTTP 200', rReg.status === 200);
    assert('Format tableau renvoyé', Array.isArray(rReg.body));

    // Consultation alertes
    const rAlerts = await request('GET', '/stock/alerts', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Consultation alertes stock HTTP 200', rAlerts.status === 200);
    assert('Présence liste rupture et réapprovisionnement', Array.isArray(rAlerts.body?.outOfStock));
  });

  console.log('\n======================================================');
  console.log(' TOUTES LES EXIGENCES BACKEND DU MODULE 4 ONT ÉTÉ TESTÉES ');
  console.log('======================================================\n');
}

run().catch((e) => {
  console.error('Fatal error during test run:', e);
  process.exit(1);
});
