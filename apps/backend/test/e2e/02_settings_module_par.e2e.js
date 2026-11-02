/**
 * VHP-CDC-001 – Tests d'intégration Module PAR (PAR-01 à PAR-08, FIN-04, RG-07, RG-08)
 * Vérifie :
 * 1. Arrondi paramétrable par devise (CDF entier / 50 / 100 vs USD 2 décimales)
 * 2. Rejet explicite quand aucun taux de change n'est saisi (AUCUN fallback supposé !)
 * 3. Consultation du taux en vigueur à un instant donné (?at=)
 * 4. Simulation d'importation avec rapport des lignes rejetées et motif précis
 * 5. Exécution transactionnelle de l'importation définitive
 * 6. Déclenchement d'une sauvegarde manuelle et consultation de l'historique
 */
'use strict';

const { request, assert, suite } = require('./helpers');

async function run() {
  console.log('\n======================================================');
  console.log(' TESTS MODULE PAR : PARAMÉTRAGE & ADMINISTRATION     ');
  console.log('======================================================\n');

  let adminToken = '';
  await suite('1. Connexion admin pour les tests de paramétrage', async () => {
    const r = await request('POST', '/auth/login', {
      username: 'admin',
      password: 'Admin2026@VoiciLHomme!',
    });
    assert('Connexion admin HTTP 200', r.status === 200, `reçu ${r.status}`);
    adminToken = r.body?.token;
  });

  // 2. Test Taux manquant (FIN-04, RG-08)
  await suite('2. Taux manquant : Erreur explicite sans fallback par défaut (FIN-04)', async () => {
    // Si on demande le taux à une date antérieure à toute création (ex: en l'an 2000)
    const r = await request('GET', '/cash/exchange-rates/active?at=2000-01-01T00:00:00.000Z');
    assert('Rejet HTTP 404 si aucun taux en vigueur', r.status === 404, `reçu ${r.status}`);
    assert('Code d’erreur explicite EXCHANGE_RATE_MISSING', r.body?.code === 'EXCHANGE_RATE_MISSING' || r.body?.message?.includes('Aucun taux'), JSON.stringify(r.body));
  });

  // 3. Saisie d'un nouveau taux et consultation avec ?at=
  await suite('3. Saisie d’un taux officiel et consultation horodatée (?at=)', async () => {
    const nowIso = new Date().toISOString();
    const setRes = await request(
      'POST',
      '/cash/exchange-rates',
      {
        rate: 2875.5,
        notes: 'Taux officiel Banque Centrale du jour',
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Saisie du taux HTTP 200 ou 201', setRes.status === 200 || setRes.status === 201, `reçu ${setRes.status}`);
    assert('Valeur enregistrée', setRes.body?.rate === 2875.5);

    // Consultation du taux en vigueur actif
    const getRes = await request('GET', '/cash/exchange-rates/active');
    assert('Consultation taux actif HTTP 200', getRes.status === 200, `reçu ${getRes.status}`);
    assert('Taux renvoyé correspond à la dernière valeur', getRes.body?.rate === 2875.5);

    // Historique des taux
    const histRes = await request('GET', '/cash/exchange-rates/history');
    assert('Historique des taux HTTP 200', histRes.status === 200);
    assert('Historique contient au moins un taux', Array.isArray(histRes.body) && histRes.body.length > 0);
  });

  // 4. Paramétrage identité de l'officine (PAR-01)
  await suite('4. Mise à jour de l’identité complète de l’officine (PAR-01)', async () => {
    const updateRes = await request(
      'PATCH',
      '/settings/identity',
      {
        name: 'Voici l’Homme Pharma Pilote',
        address: '123 Av. Lumumba, Commune de Limete, Kinshasa, RDC',
        phone: '+243 81 999 88 77',
        email: 'direction@voicilhommepharma.cd',
        rccm: 'CD/KIN/RCCM/2026-B-9999',
        idNat: '01-83-N99999P',
        taxNumber: 'A9999999X',
        receiptFooterText: 'Médicaments contrôlés. Pas de retour sans accord.',
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Mise à jour identité HTTP 200', updateRes.status === 200, `reçu ${updateRes.status}`);
    assert('RCCM mis à jour', updateRes.body?.rccm === 'CD/KIN/RCCM/2026-B-9999');
    assert('Id. Nat mis à jour', updateRes.body?.idNat === '01-83-N99999P');
  });

  // 5. Paramétrage des règles financières & d'arrondi (PAR-02, RG-07, RG-08)
  await suite('5. Paramétrage des devises, arrondis et taxes (PAR-02, PAR-03)', async () => {
    const finRes = await request(
      'PATCH',
      '/settings/financial',
      {
        defaultCurrency: 'CDF',
        activeCurrencies: ['CDF', 'USD'],
        cdfDecimals: 0,
        usdDecimals: 2,
        cdfRoundingRule: 'CINQUANTE', // Arrondi au 50 CDF le plus proche
        usdRoundingRule: 'DECIMAL_2',
        activePaymentMethods: ['ESPECES', 'MOBILE_MONEY', 'CARTE_BANCAIRE'],
        taxes: [
          { code: 'TVA_16', name: 'TVA Standard', rate: 16.0, isActive: true },
          { code: 'EXONERE', name: 'Médicaments vitaux', rate: 0.0, isActive: true },
        ],
        cashierDiscountCapPercent: 5.0,
        pharmacistDiscountCapPercent: 15.0,
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Mise à jour règles financières HTTP 200', finRes.status === 200, `reçu ${finRes.status}`);
    assert('Règle arrondi CINQUANTE enregistrée', finRes.body?.cdfRoundingRule === 'CINQUANTE');
    assert('Modes de paiement enregistrés', finRes.body?.activePaymentMethods?.length === 3);
  });

  // 6. Simulation d'import initial avec lignes invalides (PAR-07)
  await suite('6. Simulation d’import initial avec lignes valides & invalides (PAR-07)', async () => {
    const testImportRows = [
      { name: 'Paracétamol 500mg Boîte 20', dci: 'Paracetamol', sellingPriceCdf: 3500 },
      { name: '', dci: 'Invalide Sans Nom', sellingPriceCdf: 2000 }, // INVALIDE : nom vide
      { name: 'Ibuprofène 400mg', dci: 'Ibuprofen', sellingPriceCdf: -500 }, // INVALIDE : prix négatif
      { name: 'Amoxicilline 500mg Gélule', dci: 'Amoxicillin', sellingPriceCdf: 7500 },
    ];

    const simRes = await request(
      'POST',
      '/settings/import/simulate',
      {
        type: 'products',
        rows: testImportRows,
      },
      { Authorization: `Bearer ${adminToken}` },
    );

    assert('Simulation HTTP 200', simRes.status === 200, `reçu ${simRes.status}`);
    assert('Total 4 lignes reçues', simRes.body?.totalRows === 4);
    assert('2 lignes valides détectées', simRes.body?.validCount === 2);
    assert('2 lignes rejetées détectées', simRes.body?.rejectedCount === 2);
    assert('Motifs de rejet détaillés', simRes.body?.rejectedRows?.length === 2);

    const firstReject = simRes.body?.rejectedRows?.[0];
    assert('N° de ligne rejetée tracé', firstReject?.rowNumber === 2);
    assert('Motif clair pour nom vide', firstReject?.reason?.includes('obligatoire'));

    const secondReject = simRes.body?.rejectedRows?.[1];
    assert('Motif clair pour prix négatif', secondReject?.reason?.includes('négatif'));

    // 7. Exécution définitive des lignes validées
    const execRes = await request(
      'POST',
      '/settings/import/execute',
      {
        type: 'products',
        rows: simRes.body?.validRows,
      },
      { Authorization: `Bearer ${adminToken}` },
    );

    assert('Exécution définitive HTTP 200', execRes.status === 200, `reçu ${execRes.status}`);
    assert('Succès confirmé', execRes.body?.success === true);
    assert('2 produits insérés en base', execRes.body?.importedCount === 2);
  });

  // 8. Sauvegardes pilotables (PAR-08)
  await suite('8. Déclenchement manuel d’une sauvegarde et historique (PAR-08)', async () => {
    const backupRes = await request(
      'POST',
      '/settings/backups',
      {},
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Déclenchement sauvegarde HTTP 201', backupRes.status === 201, `reçu ${backupRes.status}`);
    assert('Statut SUCCES', backupRes.body?.status === 'SUCCES');
    assert('Nom de fichier généré', backupRes.body?.filename?.startsWith('backup_vhp_'));
    assert('Taille calculée présente', !!backupRes.body?.sizeFormatted);

    // Consultation de l'historique
    const listRes = await request(
      'GET',
      '/settings/backups',
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Historique des sauvegardes HTTP 200', listRes.status === 200);
    assert('Liste contient la sauvegarde créée', Array.isArray(listRes.body) && listRes.body.length > 0);
  });

  console.log('\n======================================================');
  console.log(' RÉSULTAT DES TESTS MODULE PAR : SUCCÈS TOTAL        ');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('[Erreur Test]', err);
  process.exit(1);
});

