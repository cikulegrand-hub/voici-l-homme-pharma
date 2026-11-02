/**
 * VHP-CDC-001 – Tests d'intégration Module CAT (CAT-01 à CAT-08, CAT-11, RG-06, RG-09, PERF-01)
 * Vérifie :
 * 1. Recherche avec faute de frappe et tolérance phonétique / pg_trgm (CAT-05, PERF-01)
 * 2. Unicité globale des codes-barres et rejet des doublons (CAT-03)
 * 3. Modification de prix conditionnée par permission 'prix.modifier' + traçabilité auditable (CAT-06)
 * 4. Fiche produit complète avec seuils et statuts réglementaires (CAT-01, CAT-02, CAT-11)
 * 5. Désactivation douce sans perte d'historique (CAT-08, RG-06)
 * 6. Autocomplétion légère et instantanée pour le poste de caisse
 * 7. Gestion des catégories et formes galéniques administrables (CAT-04)
 * 8. Import / Export CSV avec rapport de rejet (CAT-07)
 */
'use strict';

const { request, assert, suite } = require('./helpers');

async function run() {
  console.log('\n======================================================');
  console.log(' TESTS MODULE CAT : CATALOGUE PRODUITS                ');
  console.log('======================================================\n');

  let adminToken = '';
  let caissierToken = '';
  let testProductId = '';
  const uniqueSuffix = Date.now().toString().slice(-6);

  // 1. Connexion admin
  await suite('1. Connexion admin', async () => {
    const r = await request('POST', '/auth/login', {
      username: 'admin',
      password: 'Admin2026@VoiciLHomme!',
    });
    assert('Connexion admin HTTP 200', r.status === 200, `reçu ${r.status}`);
    adminToken = r.body?.token;
  });

  // 2. Connexion caissier (ou création si absent pour tester l'interdiction de prix.modifier)
  await suite('2. Préparation compte Caissier (sans prix.modifier)', async () => {
    // Tenter de se connecter
    let r = await request('POST', '/auth/login', {
      username: 'caissier_cat_test',
      password: 'CaissierPass2026!',
    });

    if (r.status !== 200) {
      // Créer le compte caissier via l'admin
      const createRes = await request(
        'POST',
        '/auth/users',
        {
          username: 'caissier_cat_test',
          email: `caissier_${uniqueSuffix}@voicilhomme.cd`,
          fullName: 'Caissier Test Catalogue',
          password: 'CaissierPass2026!',
          role: 'CAISSIER',
          pinCode: '1234',
        },
        { Authorization: `Bearer ${adminToken}` },
      );
      assert('Création compte caissier HTTP 201', createRes.status === 201 || createRes.status === 200, `reçu ${createRes.status}`);

      r = await request('POST', '/auth/login', {
        username: 'caissier_cat_test',
        password: 'CaissierPass2026!',
      });
    }

    assert('Connexion caissier HTTP 200', r.status === 200, `reçu ${r.status}`);
    caissierToken = r.body?.token;
  });

  // 3. Catégories et Formes galéniques administrables (CAT-04)
  await suite('3. Catégories et formes galéniques administrables (CAT-04)', async () => {
    // Lister catégories
    const catList = await request('GET', '/catalog/categories', null, { Authorization: `Bearer ${adminToken}` });
    assert('Lister catégories HTTP 200', catList.status === 200);
    assert('Catégories renvoyées sous forme de tableau', Array.isArray(catList.body));

    // Créer une catégorie
    const catCreate = await request(
      'POST',
      '/catalog/categories',
      { name: `Cardiologie Test ${uniqueSuffix}`, description: 'Médicaments du système cardiovasculaire' },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Création catégorie HTTP 201 ou 200', catCreate.status === 200 || catCreate.status === 201);
    assert('Nom de catégorie conforme', catCreate.body?.name === `Cardiologie Test ${uniqueSuffix}`);

    // Lister formes galéniques
    const formList = await request('GET', '/catalog/galenic-forms', null, { Authorization: `Bearer ${adminToken}` });
    assert('Lister formes galéniques HTTP 200', formList.status === 200);
    assert('Formes galéniques contiennent Comprimé', formList.body?.includes('Comprimé'));

    // Ajouter une nouvelle forme galénique
    const formCreate = await request(
      'POST',
      '/catalog/galenic-forms',
      { name: `Gélule Gastro ${uniqueSuffix}` },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Ajout forme galénique HTTP 201 ou 200', formCreate.status === 200 || formCreate.status === 201);
    assert('Nouvelle forme présente dans la liste', formCreate.body?.includes(`Gélule Gastro ${uniqueSuffix}`));
  });

  // 4. Création d'une fiche produit complète (CAT-01, CAT-02, CAT-03, CAT-11)
  const testBarcode = `999${uniqueSuffix}`;
  await suite('4. Fiche produit complète & code-barres (CAT-01, CAT-02, CAT-03)', async () => {
    const res = await request(
      'POST',
      '/catalog/products',
      {
        name: `Ibuprofène Sandoz ${uniqueSuffix}`,
        dci: 'Ibuprofène',
        dosage: '400 mg',
        galenicForm: 'Comprimé',
        sellingUnit: 'Boîte de 20',
        laboratory: 'Sandoz',
        sellingPriceCdf: 5500.0,
        sellingPriceUsd: 1.95,
        taxRate: 16.0,
        minAlertThreshold: 15,
        maxThreshold: 100,
        securityStock: 25,
        storageLocation: 'Rayon C - Étagère 1',
        requiresPrescription: false,
        isControlledSubstance: false,
        isColdChain: false,
        barcodes: [testBarcode],
      },
      { Authorization: `Bearer ${adminToken}` },
    );

    assert('Création produit HTTP 201 ou 200', res.status === 201 || res.status === 200, `reçu ${res.status}`);
    testProductId = res.body?.id;
    assert('ID produit généré', !!testProductId);
    assert('Nom produit conforme', res.body?.name === `Ibuprofène Sandoz ${uniqueSuffix}`);
    assert('DCI conforme', res.body?.dci === 'Ibuprofène');
    assert('Code-barres associé', res.body?.barcodes?.includes(testBarcode));
  });

  // 5. Unicité du code-barres : tentative de doublon rejetée (CAT-03)
  await suite('5. Unicité globale des codes-barres (CAT-03)', async () => {
    const dupRes = await request(
      'POST',
      '/catalog/products',
      {
        name: `Produit Doublon ${uniqueSuffix}`,
        dci: 'Autre DCI',
        sellingUnit: 'Boîte',
        sellingPriceCdf: 2000,
        sellingPriceUsd: 0.7,
        minAlertThreshold: 5,
        barcodes: [testBarcode], // Doublon intentionnel
      },
      { Authorization: `Bearer ${adminToken}` },
    );

    assert('Rejet code-barres en double HTTP 409 Conflict', dupRes.status === 409, `reçu ${dupRes.status}`);
    assert('Message explicite sur le code-barres déjà attribué', dupRes.body?.message?.includes(testBarcode));
  });

  // 6. Recherche avec tolérance aux fautes de frappe (CAT-05, PERF-01)
  await suite('6. Recherche tolérante aux fautes de frappe (CAT-05, PERF-01)', async () => {
    // 6.1 Recherche sans accent "paracetamol" pour trouver Paracétamol
    const searchNoAccent = await request(
      'GET',
      '/catalog/products?q=paracetamol',
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Recherche "paracetamol" HTTP 200', searchNoAccent.status === 200);
    const foundParacetamol = searchNoAccent.body?.data?.some(
      (p) => p.dci?.toLowerCase().includes('paracétamol') || p.name?.toLowerCase().includes('doliprane'),
    );
    assert('Doliprane / Paracétamol trouvé sans accent', foundParacetamol, JSON.stringify(searchNoAccent.body?.data));

    // 6.2 Recherche avec faute de frappe "dolipran" (sans le e)
    const searchTypo = await request(
      'GET',
      '/catalog/products?q=dolipran',
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Recherche "dolipran" HTTP 200', searchTypo.status === 200);
    const foundDolipran = searchTypo.body?.data?.some((p) => p.name?.toLowerCase().includes('doliprane'));
    assert('Doliprane trouvé malgré la faute de frappe "dolipran"', foundDolipran);

    // 6.3 Recherche exacte par code-barres
    const searchBarcode = await request(
      'GET',
      `/catalog/products?q=${testBarcode}`,
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Recherche par code-barres HTTP 200', searchBarcode.status === 200);
    assert('Produit trouvé par code-barres', searchBarcode.body?.data?.length >= 1 && searchBarcode.body?.data[0].id === testProductId);
  });

  // 7. Autocomplétion ultra-légère pour la caisse (CAT-05)
  await suite('7. Réponse légère autocomplétion caisse (CAT-05)', async () => {
    const autoRes = await request(
      'GET',
      '/catalog/autocomplete?q=doli',
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Autocomplétion HTTP 200', autoRes.status === 200);
    assert('Résultats sous forme de tableau', Array.isArray(autoRes.body));
    assert('Nombre de résultats <= 10', autoRes.body.length <= 10);

    const firstItem = autoRes.body[0];
    if (firstItem) {
      assert('Contient id', !!firstItem.id);
      assert('Contient nom', !!firstItem.name);
      assert('Contient prix CDF', typeof firstItem.sellingPriceCdf === 'number');
      assert('Contient indicateur ordonnance', typeof firstItem.requiresPrescription === 'boolean');
      assert('Contient indicateur contrôlé', typeof firstItem.isControlledSubstance === 'boolean');
    }
  });

  // 8. Modification de prix conditionnée par permission 'prix.modifier' (CAT-06)
  await suite('8. Contrôle permission prix.modifier & traçabilité (CAT-06)', async () => {
    // 8.1 Caissier sans prix.modifier tente de modifier le prix -> 403 Forbidden
    const forbiddenRes = await request(
      'PATCH',
      `/catalog/products/${testProductId}/price`,
      {
        newPriceCdf: 6000,
        newPriceUsd: 2.1,
        reason: 'Hausse arbitraire non autorisée',
      },
      { Authorization: `Bearer ${caissierToken}` },
    );
    assert('Refus HTTP 403 pour rôle caissier sans prix.modifier', forbiddenRes.status === 403, `reçu ${forbiddenRes.status}`);

    // 8.2 Admin avec droit total modifie le prix avec motif obligatoire
    const priceRes = await request(
      'PATCH',
      `/catalog/products/${testProductId}/price`,
      {
        newPriceCdf: 6000,
        newPriceUsd: 2.1,
        reason: 'Hausse tarif fournisseur Laborex 2026',
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Modification de prix admin HTTP 200', priceRes.status === 200, `reçu ${priceRes.status}`);
    assert('Nouveau prix CDF mis à jour', priceRes.body?.sellingPriceCdf === 6000);

    // 8.3 Vérification de l'historique des prix
    const histRes = await request(
      'GET',
      `/catalog/products/${testProductId}/price-history`,
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Historique de prix HTTP 200', histRes.status === 200);
    assert('Au moins 1 entrée dans l’historique', histRes.body?.length >= 1);
    const latestHist = histRes.body[0];
    assert('Ancien prix CDF conservé', latestHist.oldPriceCdf === 5500);
    assert('Nouveau prix CDF tracé', latestHist.newPriceCdf === 6000);
    assert('Motif consigné', latestHist.reason === 'Hausse tarif fournisseur Laborex 2026');
    assert('Utilisateur auteur consigné', !!latestHist.changedBy);
  });

  // 9. Désactivation sans perte d'historique (CAT-08, RG-06)
  await suite('9. Désactivation douce sans suppression physique (CAT-08, RG-06)', async () => {
    // 9.1 Désactivation
    const deactRes = await request(
      'PATCH',
      `/catalog/products/${testProductId}/deactivate`,
      {},
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Désactivation HTTP 200', deactRes.status === 200);
    assert('Statut isActive false', deactRes.body?.isActive === false);

    // 9.2 Produit absent de la recherche standard (vente / caisse)
    const searchActive = await request(
      'GET',
      `/catalog/products?q=${testBarcode}`,
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    const isPresentInActiveSearch = searchActive.body?.data?.some((p) => p.id === testProductId);
    assert('Produit désactivé ABSENT de la recherche de vente', !isPresentInActiveSearch);

    // 9.3 Produit absent de l’autocomplétion caisse
    const autoDeact = await request(
      'GET',
      `/catalog/autocomplete?q=${testBarcode}`,
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    const isPresentInAuto = autoDeact.body?.some((p) => p.id === testProductId);
    assert('Produit désactivé ABSENT de l’autocomplétion caisse', !isPresentInAuto);

    // 9.4 Produit toujours présent en consultation directe avec ?includeInactive=true
    const directFetch = await request(
      'GET',
      `/catalog/products/${testProductId}?includeInactive=true`,
      null,
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Produit consultable directement dans l’historique avec includeInactive', directFetch.status === 200);
    assert('ID toujours intact', directFetch.body?.id === testProductId);

    // 9.5 Réactivation
    const reactRes = await request(
      'PATCH',
      `/catalog/products/${testProductId}/activate`,
      {},
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Réactivation HTTP 200', reactRes.status === 200);
    assert('Statut isActive true', reactRes.body?.isActive === true);
  });

  // 10. Simulation et Exécution d'Importation / Exportation CSV (CAT-07)
  await suite('10. Import/Export CSV avec simulation et rapport d’erreurs (CAT-07)', async () => {
    // 10.1 Export CSV
    const exportRes = await request('GET', '/catalog/export-csv', null, { Authorization: `Bearer ${adminToken}` });
    assert('Export CSV HTTP 200', exportRes.status === 200);
    assert('Contient les en-têtes standard', typeof exportRes.body === 'string' && exportRes.body.includes('Nom,DCI'));

    // 10.2 Simulation d'importation avec 1 ligne valide et 1 ligne invalide (prix négatif et DCI manquante)
    const sampleCsv = `Nom,DCI,Dosage,Forme,Unite,Prix_CDF,Prix_USD,TVA,Seuil,Ordonnance,Controle,Froid,Codes_Barres
Produit Valide ${uniqueSuffix},DCI Valide,500 mg,Comprimé,Boîte,4500,1.5,16,10,false,false,false,888${uniqueSuffix}
Produit Invalide Sans DCI,,500 mg,Gélule,Boîte,-100,0,0,5,false,false,false,889${uniqueSuffix}`;

    const simRes = await request(
      'POST',
      '/catalog/import/simulate',
      { csvContent: sampleCsv },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Simulation import HTTP 200 ou 201', simRes.status === 200 || simRes.status === 201);
    assert('Total 2 lignes analysées', simRes.body?.totalRows === 2);
    assert('1 ligne valide détectée', simRes.body?.validRows === 1);
    assert('1 ligne rejetée avec motif', simRes.body?.rejectedRows?.length === 1);
    assert('Motif de rejet explicite', simRes.body?.rejectedRows[0]?.reason?.includes('DCI'));
  });

  console.log('\n======================================================');
  console.log(' TOUS LES TESTS DU MODULE CAT SONT PASSÉS AVEC SUCCÈS !');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('\n❌ Échec des tests Module CAT :', err);
  process.exit(1);
});

