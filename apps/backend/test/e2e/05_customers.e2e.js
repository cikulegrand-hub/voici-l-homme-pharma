/**
 * VHP-CDC-001 – Tests E2E : Module 5 CLI – Clients & Ordonnances
 * Exigences : CLI-01 à CLI-06, CLI-10 ; règles RG-13, RG-16, RG-17 ; SEC-04 ; REC-07.
 */
'use strict';

const crypto = require('crypto');
const { request, assert, suite, sleep } = require('./helpers');

module.exports = async function runCustomersTests(ctx) {
  let adminToken = '';
  let cashierAToken = '';
  let cashierBToken = '';
  let cashierAId = '';
  let cashierBId = '';
  let openSessionId = '';

  // ── 1. AUTHENTIFICATION & PRÉPARATION DES PROFILS (REC-07) ──
  await suite('1. Authentification & Profils de test', async () => {
    const rAdmin = await request('POST', '/auth/login', {
      username: 'admin',
      password: process.env.E2E_ADMIN_PASSWORD || 'Admin2026@VoiciLHomme!',
    });
    assert('connexion administrateur HTTP 200', rAdmin.status === 200, `reçu ${rAdmin.status}`);
    adminToken = rAdmin.body?.token;

    // Création de 2 caissiers distincts pour tester l'isolation stricte des ordonnances (RG-17)
    const unique = Date.now().toString().slice(-5);
    const rUserA = await request('POST', '/auth/users', {
      username: `caissier_a_${unique}`,
      fullName: 'Caissier A Test',
      password: 'Password2026!',
      role: 'CAISSIER',
    }, { Authorization: `Bearer ${adminToken}` });
    assert('création caissier A HTTP 201 ou 200', rUserA.status === 201 || rUserA.status === 200, JSON.stringify(rUserA.body));
    cashierAId = rUserA.body?.id;

    const rUserB = await request('POST', '/auth/users', {
      username: `caissier_b_${unique}`,
      fullName: 'Caissier B Test',
      password: 'Password2026!',
      role: 'CAISSIER',
    }, { Authorization: `Bearer ${adminToken}` });
    assert('création caissier B HTTP 201 ou 200', rUserB.status === 201 || rUserB.status === 200, JSON.stringify(rUserB.body));
    cashierBId = rUserB.body?.id;

    const rLoginA = await request('POST', '/auth/login', {
      username: `caissier_a_${unique}`,
      password: 'Password2026!',
    });
    assert('login caissier A HTTP 200', rLoginA.status === 200, `reçu ${rLoginA.status}`);
    cashierAToken = rLoginA.body?.token;

    const rLoginB = await request('POST', '/auth/login', {
      username: `caissier_b_${unique}`,
      password: 'Password2026!',
    });
    assert('login caissier B HTTP 200', rLoginB.status === 200, `reçu ${rLoginB.status}`);
    cashierBToken = rLoginB.body?.token;

    // Reconnexion admin
    await request('POST', '/auth/login', {
      username: 'admin',
      password: process.env.E2E_ADMIN_PASSWORD || 'Admin2026@VoiciLHomme!',
    });
  });

  // ── 2. MENTION D'INFORMATION CONFIDENTIALITÉ (CLI-10) ─────
  await suite('2. GET /customers/privacy-notice (CLI-10)', async () => {
    const r = await request('GET', '/customers/privacy-notice');
    assert('status HTTP 200', r.status === 200, `reçu ${r.status}`);
    assert('texte de confidentialité retourné', typeof r.body?.text === 'string' && r.body.text.length > 10, JSON.stringify(r.body));
  });

  // ── 3. CRÉATION CLIENT & FICHE (CLI-01) ────────────────────
  await suite('3. POST /customers (CLI-01)', async () => {
    const unique = Date.now().toString().slice(-6);
    const r = await request('POST', '/customers', {
      fullName: `Patient E2E ${unique}`,
      phone: '+243810000001',
      email: `patient.${unique}@test.cd`,
      customerType: 'PARTICULIER',
      creditLimitCdf: 30000,
      medicalNotes: 'Allergie connue aux sulfamides (CLI-07)',
    });
    assert('création client 201 ou 200', r.status === 201 || r.status === 200, `reçu ${r.status} – ${JSON.stringify(r.body)}`);
    assert('solde initial à 0 CDF', r.body?.currentBalanceCdf === 0, JSON.stringify(r.body));
    assert('plafond enregistré', r.body?.creditLimitCdf === 30000, JSON.stringify(r.body));
    if (r.body?.id) ctx.customerId = r.body.id;
  });

  // ── 4. LISTE & RECHERCHE AVEC SOLDE CALCULÉ SERVEUR (CLI-01) ─
  await suite('4. GET /customers & recherche (CLI-01)', async () => {
    const r = await request('GET', '/customers?customerType=PARTICULIER');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
    const found = r.body.find((c) => c.id === ctx.customerId);
    assert('client créé présent dans la liste', !!found, `id ${ctx.customerId}`);
    assert('solde calculé côté serveur', typeof found?.currentBalanceCdf === 'number', JSON.stringify(found));

    // Test de robustesse des paramètres de requête undefined / vides (correction bug frontend query params)
    const rUndefined = await request('GET', '/customers?search=undefined&customerType=undefined');
    assert('requête avec params undefined gérée avec succès (HTTP 200)', rUndefined.status === 200, `reçu ${rUndefined.status} – ${JSON.stringify(rUndefined.body)}`);
    assert('tableau retourné pour params undefined', Array.isArray(rUndefined.body), JSON.stringify(rUndefined.body));
  });

  // ── 5. VÉRIFICATION DU PLAFOND DE CRÉDIT (RG-13) ────────────
  await suite('5. Contrôle du plafond de crédit (RG-13)', async () => {
    // Si pas de produit dans ctx, récupérer un produit existant
    if (!ctx.productId) {
      const rProd = await request('GET', '/catalog/products');
      if (Array.isArray(rProd.body) && rProd.body.length > 0) {
        ctx.productId = rProd.body[0].id;
      }
    }

    // Ouvrir une session de caisse pour l'admin si non ouverte
    const rOpen = await request('POST', '/cash/sessions/open', {
      initialFloatCdf: 50000,
      initialFloatUsd: 20,
    });
    if (rOpen.body?.id) openSessionId = rOpen.body.id;
    if (!openSessionId) {
      const rCurrent = await request('GET', '/cash/sessions/current');
      openSessionId = rCurrent.body?.id;
    }

    // Tentative de vente à crédit dépassant le plafond de 30,000 CDF (ex: 45,000 CDF)
    const rExceed = await request('POST', '/sales', {
      currency: 'CDF',
      customerId: ctx.customerId,
      idempotencyKey: `e2e-credit-exceed-${Date.now()}`,
      items: [{ productId: ctx.productId, quantity: 1, unitPriceCdf: 45000 }],
      payments: [{ method: 'CREDIT_CLIENT', amountPaid: 45000, currency: 'CDF' }],
    }, { 'Idempotency-Key': `e2e-credit-exceed-${Date.now()}` });
    assert('Dépassement de plafond refusé HTTP 400 (RG-13)', rExceed.status === 400, `reçu ${rExceed.status} – ${JSON.stringify(rExceed.body)}`);

    // Vente à crédit autorisée respectant le plafond (ex: 20,000 CDF <= 30,000 CDF)
    const rAllowed = await request('POST', '/sales', {
      currency: 'CDF',
      customerId: ctx.customerId,
      idempotencyKey: `e2e-credit-ok-${Date.now()}`,
      items: [{ productId: ctx.productId, quantity: 1, unitPriceCdf: 20000 }],
      payments: [{ method: 'CREDIT_CLIENT', amountPaid: 20000, currency: 'CDF' }],
    }, { 'Idempotency-Key': `e2e-credit-ok-${Date.now()}` });
    assert('Vente à crédit autorisée HTTP 200 ou 201', rAllowed.status === 200 || rAllowed.status === 201, `reçu ${rAllowed.status} – ${JSON.stringify(rAllowed.body)}`);

    // Vérifier solde mis à jour côté serveur
    const rCheck = await request('GET', `/customers/${ctx.customerId}`);
    assert('solde dû calculé à 20000 CDF', rCheck.body?.currentBalanceCdf === 20000, `solde: ${rCheck.body?.currentBalanceCdf}`);
  });

  // ── 6. RÈGLEMENT PARTIEL, IDEMPOTENCE & SOLDE (CLI-04, RG-16) ─
  await suite('6. Encaissement partiel, idempotence puis solde (CLI-04, RG-16)', async () => {
    const key1 = crypto.randomUUID();
    const rPartiel = await request('PATCH', `/customers/${ctx.customerId}/settle-debt`, {
      amountPaidCdf: 8000,
      paymentMethod: 'ESPECES',
      currency: 'CDF',
      idempotencyKey: key1,
      cashSessionId: openSessionId,
      notes: 'Acompte partiel client E2E',
    });
    assert('règlement partiel HTTP 200', rPartiel.status === 200, `reçu ${rPartiel.status} – ${JSON.stringify(rPartiel.body)}`);
    assert('référence de reçu présente', !!rPartiel.body?.receiptReference, JSON.stringify(rPartiel.body));
    assert('imputation FIFO retournée', Array.isArray(rPartiel.body?.allocations) && rPartiel.body.allocations.length > 0, JSON.stringify(rPartiel.body));

    // Rejeu avec la même clé d'idempotence (RG-16) -> pas de double débit
    const rReplay = await request('PATCH', `/customers/${ctx.customerId}/settle-debt`, {
      amountPaidCdf: 8000,
      paymentMethod: 'ESPECES',
      currency: 'CDF',
      idempotencyKey: key1,
      cashSessionId: openSessionId,
    });
    assert('idempotence respectée HTTP 200', rReplay.status === 200, `reçu ${rReplay.status}`);
    assert('même référence de reçu', rReplay.body?.receiptReference === rPartiel.body?.receiptReference, 'référence différente');

    // Vérifier solde après acompte = 12000 CDF
    const rAfter = await request('GET', `/customers/${ctx.customerId}`);
    assert('solde après acompte = 12000 CDF', rAfter.body?.currentBalanceCdf === 12000, `solde: ${rAfter.body?.currentBalanceCdf}`);

    // Règlement du solde restant (12000 CDF)
    const key2 = crypto.randomUUID();
    const rFinal = await request('PATCH', `/customers/${ctx.customerId}/settle-debt`, {
      amountPaidCdf: 12000,
      paymentMethod: 'ESPECES',
      currency: 'CDF',
      idempotencyKey: key2,
      cashSessionId: openSessionId,
      notes: 'Solde complet créance',
    });
    assert('règlement final HTTP 200', rFinal.status === 200, `reçu ${rFinal.status}`);

    // Solde final vérifié à 0 CDF
    const rZero = await request('GET', `/customers/${ctx.customerId}`);
    assert('créance totalement soldée = 0 CDF', rZero.body?.currentBalanceCdf === 0, `solde: ${rZero.body?.currentBalanceCdf}`);
  });

  // ── 7. RELEVÉ DE COMPTE (CLI-03) ──────────────────────────
  await suite('7. GET /customers/:id/statement (CLI-03)', async () => {
    const r = await request('GET', `/customers/${ctx.customerId}/statement`);
    assert('status HTTP 200', r.status === 200, `reçu ${r.status}`);
    assert('relevé contient customer', !!r.body?.customer, 'customer manquant');
    assert('relevé contient purchases', Array.isArray(r.body?.purchases) && r.body.purchases.length > 0, 'achats manquants');
    assert('relevé contient payments', Array.isArray(r.body?.payments) && r.body.payments.length >= 2, 'paiements manquants');
    assert('solde courant à 0', r.body?.currentBalanceCdf === 0, `solde: ${r.body?.currentBalanceCdf}`);
  });

  // ── 8. ORDONNANCES : SAISIE & ACCÈS PAR RÔLE (CLI-05, CLI-06, RG-17, REC-07) ──
  await suite('8. Enregistrement ordonnance & restriction caissier (CLI-05, CLI-06, RG-17, REC-07)', async () => {
    // Caissier A enregistre une ordonnance
    const rPresc = await request('POST', '/customers/prescriptions', {
      customerId: ctx.customerId,
      prescriberName: 'Dr. Ilunga Mwamba',
      healthCenter: 'Centre Médical de la Gombe',
      prescriptionDate: new Date().toISOString().split('T')[0],
      storageFilePath: `prescriptions/${ctx.customerId}/scan_20261101.jpg`,
      prescriptionText: 'Paracétamol 1g 3x/jour si douleur',
    }, { Authorization: `Bearer ${cashierAToken}` });

    assert('saisie ordonnance par Caissier A HTTP 201 ou 200', rPresc.status === 201 || rPresc.status === 200, JSON.stringify(rPresc.body));
    const prescriptionId = rPresc.body?.id;
    assert('prescriptionId généré', !!prescriptionId, 'id manquant');

    // Caissier A peut obtenir le lien signé de l'ordonnance qu'il a lui-même saisie
    const rA = await request('GET', `/customers/prescriptions/${prescriptionId}/signed-url`, null, {
      Authorization: `Bearer ${cashierAToken}`,
    });
    assert('Caissier A peut consulter sa propre ordonnance HTTP 200', rA.status === 200, `reçu ${rA.status}`);
    assert('Lien signé temporaire présent', typeof rA.body?.signedUrl === 'string' && rA.body.signedUrl.length > 10, JSON.stringify(rA.body));
    assert('Date d’expiration valide dans le futur', new Date(rA.body?.expiresAt) > new Date(), `expiresAt: ${rA.body?.expiresAt}`);

    // Caissier B (autre utilisateur) TENTE d'obtenir le lien signé de cette ordonnance -> 403 Forbidden STRICT (RG-17)
    const rB = await request('GET', `/customers/prescriptions/${prescriptionId}/signed-url`, null, {
      Authorization: `Bearer ${cashierBToken}`,
    });
    assert('Accès refusé HTTP 403 pour un caissier tiers (RG-17, REC-07)', rB.status === 403, `reçu ${rB.status} – attendu 403 Forbidden`);

    // Administrateur / Pharmacien peut consulter l'ordonnance
    const rAdminView = await request('GET', `/customers/prescriptions/${prescriptionId}/signed-url`, null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Administrateur / Pharmacien autorisé HTTP 200', rAdminView.status === 200, `reçu ${rAdminView.status}`);

    // ── 9. JOURNALISATION SYSTÉMATIQUE DE CHAQUE CONSULTATION (CLI-06, RG-17, SEC-04) ──
    const rAudit = await request('GET', '/audit/logs?action=CONSULTATION_IMAGE_ORDONNANCE', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('audit logs HTTP 200', rAudit.status === 200, `reçu ${rAudit.status}`);
    const foundAudit = Array.isArray(rAudit.body) && rAudit.body.some((log) => log.entity_id === prescriptionId || log.action === 'CONSULTATION_IMAGE_ORDONNANCE');
    assert('consultation ordonnance journalisée dans la table audit', foundAudit, 'Entrée d’audit introuvable');
  });
};
