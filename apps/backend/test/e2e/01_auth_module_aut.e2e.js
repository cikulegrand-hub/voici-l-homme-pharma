/**
 * VHP-CDC-001 – Tests d'intégration Module AUT (AUT-01 à AUT-08, REC-07, SEC-03)
 * Vérifie :
 * 1. Verrouillage temporaire après 5 échecs consécutifs (AUT-02)
 * 2. Rejet des jetons d'accès courts expirés > 15 min (AUT-03)
 * 3. Matrice d'habilitations et refus d'accès par permission pour chaque rôle (REC-07)
 * 4. Désactivation d'un utilisateur actif et blocage immédiat (AUT-04)
 * 5. Réautorisation rapide par code PIN superviseur avec token 5 min (AUT-08)
 * 6. Endpoint GET /api/v1/auth/me avec permissions complètes (AUT-05)
 */
'use strict';

const { request, assert, suite } = require('./helpers');

async function run() {
  console.log('\n======================================================');
  console.log(' TESTS MODULE AUT : AUTHENTIFICATION & HABILITATIONS ');
  console.log('======================================================\n');

  // 1. Connexion admin initiale
  let adminToken = '';
  await suite('1. Connexion administrateur racine (AUT-01)', async () => {
    const r = await request('POST', '/auth/login', {
      username: 'admin',
      password: 'Admin2026@VoiciLHomme!',
    });
    assert('Connexion admin HTTP 200', r.status === 200, `reçu ${r.status}`);
    assert('Token présent', !!r.body?.token);
    assert('Rôle ADMIN', r.body?.user?.role === 'ADMIN');
    assert('Permission wildcard présente', r.body?.user?.permissions?.includes('*'));
    adminToken = r.body?.token;
  });

  // 2. GET /auth/me
  await suite('2. Endpoint GET /api/v1/auth/me (AUT-03, AUT-05)', async () => {
    const r = await request('GET', '/auth/me', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Status 200', r.status === 200, `reçu ${r.status}`);
    assert('Profil retourné', r.body?.user?.username === 'admin');
    assert('Taux actif retourné', !!r.body?.activeRate);
  });

  // 3. Jeton expiré (AUT-03)
  await suite('3. Rejet d’un jeton expiré > 15 min (AUT-03)', async () => {
    // Simuler un token généré il y a 20 minutes (20 * 60 * 1000 ms)
    const expiredTimestamp = Date.now() - 20 * 60 * 1000;
    const expiredToken = `jwt_access_admin_${expiredTimestamp}`;
    const r = await request('GET', '/auth/me', null, {
      Authorization: `Bearer ${expiredToken}`,
    });
    assert('Accès refusé HTTP 401 pour jeton expiré', r.status === 401, `reçu ${r.status}`);
    assert('Message d’expiration clair', r.body?.message?.includes('expiré') || r.body?.message?.includes('Jeton'), JSON.stringify(r.body));
  });

  // 4. Création d'utilisateurs pour chaque rôle et test de matrice (AUT-04, AUT-05, REC-07)
  const unique = Date.now().toString().slice(-5);
  const testUsers = {
    caissier: {
      username: `caissier_${unique}`,
      password: 'PassWord2026@Caisse!',
      fullName: 'Test Caissier',
      role: 'CAISSIER',
      token: '',
    },
    stock: {
      username: `stock_${unique}`,
      password: 'PassWord2026@Stock!',
      fullName: 'Test Stock',
      role: 'STOCK',
      token: '',
    },
    pharmacien: {
      username: `pharma_${unique}`,
      password: 'PassWord2026@Pharma!',
      fullName: 'Test Pharmacien',
      role: 'PHARMACIEN',
      pinCode: '1234',
      token: '',
    },
  };

  await suite('4. Création des utilisateurs avec rôles prédéfinis (AUT-04, AUT-05)', async () => {
    for (const [key, u] of Object.entries(testUsers)) {
      const res = await request(
        'POST',
        '/auth/users',
        {
          username: u.username,
          password: u.password,
          fullName: u.fullName,
          role: u.role,
          pinCode: u.pinCode,
        },
        { Authorization: `Bearer ${adminToken}` },
      );
      assert(`Création ${u.role} HTTP 201`, res.status === 201, `reçu ${res.status}: ${JSON.stringify(res.body)}`);

      // Connexion pour récupérer leur token
      const loginRes = await request('POST', '/auth/login', {
        username: u.username,
        password: u.password,
      });
      assert(`Login ${u.role} HTTP 200`, loginRes.status === 200, `reçu ${loginRes.status}`);
      u.token = loginRes.body?.token;
    }
  });

  // 5. Test matrice d'habilitations et refus d'accès (REC-07)
  await suite('5. Contrôle d’accès par permission pour chaque rôle (REC-07)', async () => {
    // A) Le caissier ne doit PAS pouvoir accéder à la gestion des utilisateurs (admin.utilisateurs)
    const rCaisse = await request('GET', '/auth/users', null, {
      Authorization: `Bearer ${testUsers.caissier.token}`,
    });
    assert('Caissier refusé sur /auth/users (HTTP 403)', rCaisse.status === 403, `reçu ${rCaisse.status}`);

    // B) Le gestionnaire de stock ne doit PAS pouvoir accéder à la gestion des utilisateurs (admin.utilisateurs)
    const rStock = await request('GET', '/auth/users', null, {
      Authorization: `Bearer ${testUsers.stock.token}`,
    });
    assert('Gestionnaire stock refusé sur /auth/users (HTTP 403)', rStock.status === 403, `reçu ${rStock.status}`);

    // C) Le pharmacien ne doit PAS pouvoir accéder à la gestion des utilisateurs
    const rPharma = await request('GET', '/auth/users', null, {
      Authorization: `Bearer ${testUsers.pharmacien.token}`,
    });
    assert('Pharmacien refusé sur /auth/users (HTTP 403)', rPharma.status === 403, `reçu ${rPharma.status}`);

    // D) L'administrateur DOIT pouvoir accéder à la gestion des utilisateurs
    const rAdmin = await request('GET', '/auth/users', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert('Admin autorisé sur /auth/users (HTTP 200)', rAdmin.status === 200, `reçu ${rAdmin.status}`);
    assert('Liste des utilisateurs reçue', Array.isArray(rAdmin.body));
  });

  // 6. Verrouillage après 5 échecs consécutifs (AUT-02)
  await suite('6. Verrouillage du compte après 5 tentatives infructueuses (AUT-02)', async () => {
    const targetUser = testUsers.caissier.username;
    let lastStatus = 0;
    let lastBody = null;

    // Effectuer 5 tentatives erronées
    for (let i = 1; i <= 5; i++) {
      const res = await request('POST', '/auth/login', {
        username: targetUser,
        password: 'MauvaisMotDePasseFaux123!',
      });
      lastStatus = res.status;
      lastBody = res.body;
    }

    assert('5ème échec renvoie HTTP 401', lastStatus === 401, `reçu ${lastStatus}`);
    assert(
      'Message de verrouillage 15 minutes explicite (AUT-02)',
      lastBody?.message?.includes('verrouillé') || lastBody?.message?.includes('15 minutes'),
      JSON.stringify(lastBody),
    );

    // Une 6ème tentative même avec le BON mot de passe doit être REJETÉE car le compte est verrouillé
    const blockedRes = await request('POST', '/auth/login', {
      username: targetUser,
      password: testUsers.caissier.password,
    });
    assert('Connexion avec bon mot de passe refusée tant que verrouillé (HTTP 401)', blockedRes.status === 401);
    assert('Message indique le compte verrouillé', blockedRes.body?.message?.includes('verrouillé'));
  });

  // 7. Désactivation d'un utilisateur actif (AUT-04)
  await suite('7. Désactivation d’un utilisateur actif (AUT-04)', async () => {
    const deactTarget = testUsers.stock.username;
    const deactRes = await request(
      'PATCH',
      `/auth/users/${deactTarget}/deactivate`,
      {},
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Désactivation HTTP 200', deactRes.status === 200, `reçu ${deactRes.status}`);

    // Tentative de connexion de l'utilisateur désactivé
    const loginDeact = await request('POST', '/auth/login', {
      username: deactTarget,
      password: testUsers.stock.password,
    });
    assert('Connexion utilisateur désactivé rejetée HTTP 401', loginDeact.status === 401);
    assert('Message indique compte désactivé', loginDeact.body?.message?.includes('désactivé'));
  });

  // 8. Vérification PIN superviseur avec autorisation courte durée 5 min (AUT-08)
  await suite('8. Vérification PIN superviseur & autorisation 5 min (AUT-08)', async () => {
    const pinRes = await request(
      'POST',
      '/auth/verify-pin',
      {
        pinCode: '9999', // PIN admin ou 1234 pharma
        action: 'ANNULATION_VENTE_FAC_001',
      },
      { Authorization: `Bearer ${adminToken}` },
    );
    assert('Vérification PIN HTTP 200', pinRes.status === 200, `reçu ${pinRes.status}`);
    assert('Autorisation valide', pinRes.body?.valid === true);
    assert('Token d’autorisation éphémère retourné', !!pinRes.body?.authorizationToken);
    assert('Date d’expiration de l’autorisation présente', !!pinRes.body?.expiresAt);
  });

  console.log('\n======================================================');
  console.log(' RÉSULTAT DES TESTS MODULE AUT : SUCCÈS TOTAL');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('[Erreur Test]', err);
  process.exit(1);
});
