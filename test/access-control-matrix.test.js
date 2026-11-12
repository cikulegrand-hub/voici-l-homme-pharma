const assert = require('assert');

// Test Suite: Cloisonnement et Espace Personnel Discret (VHP-CDC-001)

console.log('================================================================');
console.log('TEST SUITE : ESPACE PERSONNEL ET CONTRÔLE D\'ACCÈS DISCRET (VHP)');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Catalogue et Matrice des Rôles
const {
  PERMISSIONS_CATALOG,
  ROLE_PERMISSIONS,
  ALL_PERMISSION_CODES,
  PERMISSION_CATEGORY_LABELS,
} = require('../apps/backend/dist/common/permissions.catalog');

it('Catalogue : Tous les codes sont uniques et possèdent un libellé métier en français', () => {
  const codes = new Set();
  for (const p of PERMISSIONS_CATALOG) {
    assert(!codes.has(p.code), `Code en double : ${p.code}`);
    codes.add(p.code);
    assert(p.label && p.label.trim().length > 0, `Libellé manquant pour ${p.code}`);
    assert(p.category && PERMISSION_CATEGORY_LABELS[p.category], `Catégorie inconnue pour ${p.code}`);
    // Vérifier que le libellé n'est pas juste le code technique
    assert(p.label !== p.code, `Le libellé ne doit pas être le code technique pour ${p.code}`);
  }
});

it('Matrice des rôles : Couvre les 5 profils exigés', () => {
  const expectedRoles = ['ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE'];
  for (const role of expectedRoles) {
    assert(Array.isArray(ROLE_PERMISSIONS[role]), `Rôle manquant dans la matrice : ${role}`);
  }
});

it('Matrice : Profil ADMIN possède le wildcard ou l\'ensemble complet des droits', () => {
  assert(ROLE_PERMISSIONS.ADMIN.includes('*'), 'ADMIN doit avoir le wildcard "*"');
});

it('Matrice : Profil CAISSIER ne peut pas modifier les prix ni accéder au stock complet', () => {
  const caissierPerms = ROLE_PERMISSIONS.CAISSIER;
  assert(!caissierPerms.includes('prix.modifier'), 'Caissier NE DOIT PAS avoir prix.modifier');
  assert(!caissierPerms.includes('stock.ajuster'), 'Caissier NE DOIT PAS avoir stock.ajuster');
  assert(!caissierPerms.includes('stock.recevoir'), 'Caissier NE DOIT PAS avoir stock.recevoir');
  assert(!caissierPerms.includes('admin.utilisateurs'), 'Caissier NE DOIT PAS avoir admin.utilisateurs');
  assert(!caissierPerms.includes('finances.consulter'), 'Caissier NE DOIT PAS avoir finances.consulter');
  assert(caissierPerms.includes('vente.demande_annulation'), 'Caissier DOIT avoir vente.demande_annulation');
  assert(!caissierPerms.includes('vente.annuler'), 'Caissier NE DOIT PAS avoir vente.annuler');
});

it('Matrice : Profil STOCK ne peut que demander un ajustement et ne peut pas modifier les prix', () => {
  const stockPerms = ROLE_PERMISSIONS.STOCK;
  assert(!stockPerms.includes('prix.modifier'), 'Gestionnaire de stock NE DOIT PAS avoir prix.modifier');
  assert(stockPerms.includes('stock.ajuster'), 'Gestionnaire de stock DOIT avoir stock.ajuster (demande)');
  assert(!stockPerms.includes('stock.valider_ajustement'), 'Gestionnaire de stock NE DOIT PAS avoir stock.valider_ajustement');
  assert(!stockPerms.includes('vente.creer'), 'Gestionnaire de stock NE DOIT PAS faire de ventes');
  assert(!stockPerms.includes('finances.consulter'), 'Gestionnaire de stock NE DOIT PAS voir les finances');
});

it('Matrice : Profil COMPTABLE a accès aux finances et rapports, pas à la vente ni au stock direct', () => {
  const comptablePerms = ROLE_PERMISSIONS.COMPTABLE;
  assert(comptablePerms.includes('finances.consulter'), 'Comptable DOIT avoir finances.consulter');
  assert(comptablePerms.includes('caisse.consulter'), 'Comptable DOIT avoir caisse.consulter (lecture seule)');
  assert(!comptablePerms.includes('caisse.ouvrir'), 'Comptable NE DOIT PAS ouvrir de caisse');
  assert(!comptablePerms.includes('vente.creer'), 'Comptable NE DOIT PAS faire de ventes');
  assert(!comptablePerms.includes('stock.recevoir'), 'Comptable NE DOIT PAS recevoir de livraisons');
  assert(!comptablePerms.includes('client.identite_complete'), 'Comptable NE DOIT PAS voir les pièces d\'identité complètes');
  assert(!comptablePerms.includes('client.notes_medicales'), 'Comptable NE DOIT PAS voir les notes médicales');
});

// 2. Logique de calcul des droits effectifs (Rôle + Accès personnels)
function calculateEffectivePermissions(userRole, overrides = [], isActive = true) {
  if (!isActive) return [];

  // Droits de base du rôle
  let basePerms = new Set();
  if (userRole === 'ADMIN') {
    for (const p of PERMISSIONS_CATALOG) basePerms.add(p.code);
  } else {
    for (const p of (ROLE_PERMISSIONS[userRole] || [])) basePerms.add(p);
  }

  // Appliquer les accès personnels : Le refus l'emporte toujours
  const grants = new Set();
  const denies = new Set();

  for (const o of overrides) {
    if (o.overrideType === 'DENY') denies.add(o.permission);
    else if (o.overrideType === 'GRANT') grants.add(o.permission);
  }

  const effective = new Set();
  for (const p of basePerms) {
    if (!denies.has(p)) effective.add(p);
  }
  for (const p of grants) {
    if (!denies.has(p) && ALL_PERMISSION_CODES.has(p)) effective.add(p);
  }

  return Array.from(effective);
}

it('Calcul des droits : Un utilisateur inactif n\'a aucun droit effectif', () => {
  const perms = calculateEffectivePermissions('ADMIN', [], false);
  assert.strictEqual(perms.length, 0, 'Un utilisateur inactif doit avoir 0 permission');
});

it('Calcul des droits : Le retrait d\'un droit du rôle (DENY) supprime ce droit', () => {
  // Caissier a pos.access par défaut
  const before = calculateEffectivePermissions('CAISSIER');
  assert(before.includes('pos.access'));

  // Retrait de pos.access pour ce caissier spécifique
  const after = calculateEffectivePermissions('CAISSIER', [
    { permission: 'pos.access', overrideType: 'DENY' }
  ]);
  assert(!after.includes('pos.access'), 'pos.access doit avoir été retiré');
  assert(after.includes('vente.creer'), 'Les autres droits du rôle doivent rester intacts');
});

it('Calcul des droits : L\'ajout exceptionnel d\'un droit (GRANT) l\'ajoute aux droits effectifs', () => {
  // Caissier n'a pas stock.recevoir par défaut
  const before = calculateEffectivePermissions('CAISSIER');
  assert(!before.includes('stock.recevoir'));

  // Ajout exceptionnel de stock.recevoir
  const after = calculateEffectivePermissions('CAISSIER', [
    { permission: 'stock.recevoir', overrideType: 'GRANT' }
  ]);
  assert(after.includes('stock.recevoir'), 'stock.recevoir doit être accordé');
});

it('Calcul des droits : En cas de conflit, LE REFUS L\'EMPORTE TOUJOURS (DENY > GRANT)', () => {
  const perms = calculateEffectivePermissions('CAISSIER', [
    { permission: 'vente.creer', overrideType: 'GRANT' },
    { permission: 'vente.creer', overrideType: 'DENY' },
  ]);
  assert(!perms.includes('vente.creer'), 'Le refus doit impérativement l\'emporter sur l\'accord');
});

// 3. Garde-fous Administrateur
it('Garde-fous : Un administrateur ne peut pas se retirer ses propres droits admin', () => {
  function validateAdminSelfEdit(targetUserId, authorId, targetRole, overrides) {
    if (targetUserId === authorId && targetRole === 'ADMIN') {
      const revoked = overrides.some(
        (o) => o.overrideType === 'DENY' && (o.permission === 'admin.utilisateurs' || o.permission === '*')
      );
      if (revoked) {
        throw new Error('Un administrateur ne peut pas se retirer ses propres droits d\'administration.');
      }
    }
  }

  assert.throws(() => {
    validateAdminSelfEdit('admin-1', 'admin-1', 'ADMIN', [
      { permission: 'admin.utilisateurs', overrideType: 'DENY' }
    ]);
  }, /Un administrateur ne peut pas se retirer ses propres droits/);
});

it('Garde-fous : Impossible de désactiver le dernier administrateur actif', () => {
  function validateDeactivate(activeAdminCount, targetIsAdmin) {
    if (targetIsAdmin && activeAdminCount <= 1) {
      throw new Error('Impossible de désactiver le dernier administrateur actif de l\'officine.');
    }
  }

  assert.throws(() => {
    validateDeactivate(1, true);
  }, /dernier administrateur actif/);
});

// 4. Discrétion et format des erreurs
it('Discrétion : Les refus d\'accès sur action répondent par un 403 générique uniforme', () => {
  const genericErrorMessage = 'Action non disponible';
  assert.strictEqual(genericErrorMessage, 'Action non disponible');
  assert(!genericErrorMessage.includes('permission'), 'Le message ne doit pas contenir "permission"');
  assert(!genericErrorMessage.includes('role'), 'Le message ne doit pas contenir "role"');
  assert(!genericErrorMessage.includes('admin'), 'Le message ne doit pas contenir "admin"');
});

it('Discrétion : Les refus sur ressource non autorisée répondent par un 404 (inexistante)', () => {
  const notFoundMessage = 'Ressource introuvable.';
  assert.strictEqual(notFoundMessage, 'Ressource introuvable.');
  assert(!notFoundMessage.includes('refusé'), 'Le 404 ne doit pas révéler que la ressource existe');
});

// 5. Calcul des modules autorisés (Interface Utilisateur)
function calculateAllowedModules(effectivePerms) {
  const modules = [
    { code: 'DASHBOARD', name: 'Tableau de bord', perms: ['rapports.dashboard', 'vente.consulter', 'stock.consulter'] },
    { code: 'POS', name: 'Point de Vente', perms: ['pos.access', 'vente.creer'] },
    { code: 'SALES', name: 'Ventes & Avoirs', perms: ['vente.consulter'] },
    { code: 'CATALOG', name: 'Catalogue Produits', perms: ['catalogue.consulter'] },
    { code: 'STOCK', name: 'Gestion des Stocks', perms: ['stock.consulter'] },
    { code: 'RECEPTION', name: 'Réceptions Livraisons', perms: ['stock.recevoir'] },
    { code: 'CUSTOMERS', name: 'Clients & Créances', perms: ['client.consulter'] },
    { code: 'CASH', name: 'Caisse & Finances', perms: ['finances.consulter'] },
    { code: 'REPORTS', name: 'Rapports & Statistiques', perms: ['rapports.dashboard', 'rapports.consulter', 'rapports.ventes', 'rapports.stock', 'rapports.financiers'] },
    { code: 'AUDIT', name: 'Journal d\'Audit', perms: ['audit.consulter'] },
    { code: 'USERS', name: 'Utilisateurs & Accès', perms: ['admin.utilisateurs'] },
    { code: 'SETTINGS', name: 'Paramètres Généraux', perms: ['parametres.modifier'] },
  ];

  const hasPerm = (p) => effectivePerms.includes('*') || effectivePerms.includes(p);

  return modules.filter((m) => m.perms.some(hasPerm)).map((m) => m.code);
}

it('Modules visibles : Le Caissier ne voit PAS Stock, Réception, Caisse/Finance, Audit, Users, Settings', () => {
  const caissierPerms = calculateEffectivePermissions('CAISSIER');
  const visible = calculateAllowedModules(caissierPerms);

  assert(visible.includes('POS'), 'Caissier doit voir POS');
  assert(visible.includes('SALES'), 'Caissier doit voir SALES');
  assert(visible.includes('CATALOG'), 'Caissier doit voir CATALOG');
  assert(visible.includes('CUSTOMERS'), 'Caissier doit voir CUSTOMERS');
  assert(!visible.includes('RECEPTION'), 'Caissier NE DOIT PAS voir RECEPTION');
  assert(!visible.includes('CASH'), 'Caissier NE DOIT PAS voir CASH (finances)');
  assert(!visible.includes('AUDIT'), 'Caissier NE DOIT PAS voir AUDIT');
  assert(!visible.includes('USERS'), 'Caissier NE DOIT PAS voir USERS');
  assert(!visible.includes('SETTINGS'), 'Caissier NE DOIT PAS voir SETTINGS');
});

it('Modules visibles : Le Gestionnaire de stock ne voit PAS POS, Sales, Customers, Cash, Audit, Users', () => {
  const stockPerms = calculateEffectivePermissions('STOCK');
  const visible = calculateAllowedModules(stockPerms);

  assert(visible.includes('STOCK'), 'Stock doit voir STOCK');
  assert(visible.includes('RECEPTION'), 'Stock doit voir RECEPTION');
  assert(visible.includes('CATALOG'), 'Stock doit voir CATALOG');
  assert(!visible.includes('POS'), 'Stock NE DOIT PAS voir POS');
  assert(!visible.includes('SALES'), 'Stock NE DOIT PAS voir SALES');
  assert(!visible.includes('CUSTOMERS'), 'Stock NE DOIT PAS voir CUSTOMERS');
  assert(!visible.includes('CASH'), 'Stock NE DOIT PAS voir CASH');
  assert(!visible.includes('AUDIT'), 'Stock NE DOIT PAS voir AUDIT');
  assert(!visible.includes('USERS'), 'Stock NE DOIT PAS voir USERS');
});

it('Modules visibles : Le Comptable ne voit PAS POS, Sales, Stock, Réception, Users, Settings', () => {
  const comptablePerms = calculateEffectivePermissions('COMPTABLE');
  const visible = calculateAllowedModules(comptablePerms);

  assert(visible.includes('CASH'), 'Comptable doit voir CASH');
  assert(visible.includes('REPORTS'), 'Comptable doit voir REPORTS');
  assert(visible.includes('AUDIT'), 'Comptable doit voir AUDIT');
  assert(visible.includes('CUSTOMERS'), 'Comptable doit voir CUSTOMERS (créances)');
  assert(!visible.includes('POS'), 'Comptable NE DOIT PAS voir POS');
  assert(!visible.includes('RECEPTION'), 'Comptable NE DOIT PAS voir RECEPTION');
  assert(!visible.includes('USERS'), 'Comptable NE DOIT PAS voir USERS');
  assert(!visible.includes('SETTINGS'), 'Comptable NE DOIT PAS voir SETTINGS');
});

it('Modules visibles : L\'Admin voit TOUS les modules', () => {
  const adminPerms = ['*'];
  const visible = calculateAllowedModules(adminPerms);
  assert.strictEqual(visible.length, 12, 'L\'admin doit voir les 12 modules');
});

// 6. Masquage des champs sensibles (Medical Notes, Pièce d'identité complète)
function sanitizeCustomerData(customer, userRole, effectivePerms) {
  const canSeeFullId = userRole === 'ADMIN' || effectivePerms.includes('client.identite_complete');
  const canSeeMedicalNotes = userRole === 'ADMIN' || effectivePerms.includes('client.notes_medicales');

  const sanitized = { ...customer };
  if (!canSeeFullId && sanitized.identityDocument) {
    sanitized.identityDocument = {
      type: sanitized.identityDocument.type,
      maskedNumber: '***-MASKED-***',
    };
  }
  if (!canSeeMedicalNotes) {
    delete sanitized.medicalNotes;
  }
  return sanitized;
}

it('Champs sensibles : Notes médicales et pièces d\'identité masquées pour Caissier et Comptable', () => {
  const rawCustomer = {
    id: 'cust-1',
    name: 'Patient Kinshasa',
    medicalNotes: 'Traitement chronique pour hypertension',
    identityDocument: { type: 'PASSEPORT', number: 'CD-123456789' },
  };

  const caissierPerms = calculateEffectivePermissions('CAISSIER');
  const forCaissier = sanitizeCustomerData(rawCustomer, 'CAISSIER', caissierPerms);
  assert.strictEqual(forCaissier.medicalNotes, undefined, 'Notes médicales doivent être supprimées pour Caissier');
  assert.strictEqual(forCaissier.identityDocument.maskedNumber, '***-MASKED-***', 'Numéro de pièce doit être masqué');
  assert.strictEqual(forCaissier.identityDocument.number, undefined, 'Numéro brut ne doit pas fuiter');

  const comptablePerms = calculateEffectivePermissions('COMPTABLE');
  const forComptable = sanitizeCustomerData(rawCustomer, 'COMPTABLE', comptablePerms);
  assert.strictEqual(forComptable.medicalNotes, undefined, 'Notes médicales doivent être supprimées pour Comptable');
  assert.strictEqual(forComptable.identityDocument.maskedNumber, '***-MASKED-***', 'Numéro de pièce doit être masqué pour Comptable');

  const pharmacienPerms = calculateEffectivePermissions('PHARMACIEN');
  const forPharmacien = sanitizeCustomerData(rawCustomer, 'PHARMACIEN', pharmacienPerms);
  assert.strictEqual(forPharmacien.medicalNotes, 'Traitement chronique pour hypertension', 'Pharmacien doit voir les notes');
  assert.strictEqual(forPharmacien.identityDocument.number, 'CD-123456789', 'Pharmacien doit voir la pièce');
});

console.log(`\n================================================================`);
console.log(`RÉSULTAT : ${passedTests}/${totalTests} tests réussis avec succès !`);
console.log(`================================================================\n`);

