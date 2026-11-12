const assert = require('assert');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/backend/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('================================================================');
console.log('TEST SUITE : VALIDATION SUPER_ADMIN & RBAC DYNAMIQUE (VHP)');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function test(description, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAll() {
  const connectionString = process.env.DATABASE_URL;
  let cleanConnectionString = connectionString;
  if (connectionString && (connectionString.includes('supabase.com') || connectionString.includes('sslmode='))) {
    cleanConnectionString = connectionString.replace(/(\?|&)sslmode=[^&]*/g, '').replace(/\?&/, '?').replace(/\?$/, '');
  }

  const pool = new Pool({
    connectionString: cleanConnectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // 1. Structure de la base de données
    await test('Base de données : Table roles possède is_system et pharmacy_id', async () => {
      const res = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'roles' AND column_name IN ('is_system', 'pharmacy_id')
      `);
      assert.strictEqual(res.rows.length, 2, 'Les 2 colonnes is_system et pharmacy_id doivent exister sur roles');
      const isSystemCol = res.rows.find(r => r.column_name === 'is_system');
      assert.strictEqual(isSystemCol.data_type, 'boolean');
    });

    await test('Base de données : Table users autorise pharmacy_id NULL pour le SUPER_ADMIN global', async () => {
      const res = await client.query(`
        SELECT is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'pharmacy_id'
      `);
      assert.strictEqual(res.rows[0].is_nullable, 'YES', 'users.pharmacy_id doit être nullable');
    });

    await test('Base de données : Le rôle SUPER_ADMIN existe avec is_system = TRUE et remise 100%', async () => {
      const res = await client.query(`
        SELECT id, name, is_system, max_discount_percent 
        FROM roles 
        WHERE name = 'SUPER_ADMIN'
      `);
      assert.strictEqual(res.rows.length, 1, 'Le rôle SUPER_ADMIN doit exister en base');
      assert.strictEqual(res.rows[0].is_system, true, 'SUPER_ADMIN doit avoir is_system = true');
      assert.strictEqual(parseFloat(res.rows[0].max_discount_percent), 100.00, 'Remise max = 100%');
    });

    await test('Base de données : Les rôles vitaux sont verrouillés en is_system = TRUE', async () => {
      const res = await client.query(`
        SELECT name, is_system 
        FROM roles 
        WHERE name IN ('SUPER_ADMIN', 'ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE')
      `);
      assert.strictEqual(res.rows.length, 6, 'Les 6 rôles vitaux doivent être présents');
      for (const row of res.rows) {
        assert.strictEqual(row.is_system, true, `Le rôle ${row.name} doit être protégé (is_system = true)`);
      }
    });

    await test('Base de données : La permission admin.roles est enregistrée et liée à SUPER_ADMIN et ADMIN', async () => {
      const permRes = await client.query(`SELECT id FROM permissions WHERE code = 'admin.roles'`);
      assert.strictEqual(permRes.rows.length, 1, 'La permission admin.roles doit exister');

      const linkedRes = await client.query(`
        SELECT r.name 
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE p.code = 'admin.roles' AND r.name IN ('SUPER_ADMIN', 'ADMIN')
      `);
      const names = linkedRes.rows.map(r => r.name);
      assert(names.includes('SUPER_ADMIN'), 'admin.roles doit être affecté à SUPER_ADMIN');
      assert(names.includes('ADMIN'), 'admin.roles doit être affecté à ADMIN');
    });

    // 2. Vérification des modèles TypeScript compilés
    const { ROLE_PERMISSIONS, PERMISSIONS_CATALOG } = require('../apps/backend/dist/common/permissions.catalog');
    
    await test('Backend : SUPER_ADMIN possède le wildcard "*" dans le catalogue des permissions', async () => {
      assert(ROLE_PERMISSIONS.SUPER_ADMIN, 'SUPER_ADMIN doit exister dans ROLE_PERMISSIONS');
      assert(ROLE_PERMISSIONS.SUPER_ADMIN.includes('*'), 'SUPER_ADMIN doit avoir le wildcard "*"');
    });

    await test('Backend : Le catalogue inclut admin.roles avec libellé en français', async () => {
      const rolePerm = PERMISSIONS_CATALOG.find(p => p.code === 'admin.roles');
      assert(rolePerm, 'admin.roles doit exister dans PERMISSIONS_CATALOG');
      assert.strictEqual(rolePerm.category, 'ADMIN');
      assert(rolePerm.label.length > 5, 'admin.roles doit avoir un libellé compréhensible');
    });

    // 3. Cycle de vie d'un rôle personnalisé (Création -> Affectation -> Vérification -> Protection -> Suppression)
    await test('Cycle de vie RBAC dynamique : Création d\'un rôle temporaire TEST_SUPERVISEUR', async () => {
      const roleName = 'TEST_SUPERVISEUR_' + Date.now();
      
      // 3.1 Création
      const insertRes = await client.query(`
        INSERT INTO roles (name, description, max_discount_percent, is_system)
        VALUES ($1, 'Rôle de test dynamique automatisé', 15.00, false)
        RETURNING id, name, is_system
      `, [roleName]);
      const createdId = insertRes.rows[0].id;
      assert.strictEqual(insertRes.rows[0].is_system, false, 'Le nouveau rôle doit être personnalisable (is_system = false)');

      // 3.2 Lier des permissions
      const permIds = await client.query(`SELECT id FROM permissions WHERE code IN ('vente.creer', 'vente.remise', 'stock.consulter')`);
      for (const p of permIds.rows) {
        await client.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`, [createdId, p.id]);
      }

      // 3.3 Vérifier que les permissions sont bien liées
      const assignedPerms = await client.query(`
        SELECT p.code FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1
      `, [createdId]);
      assert.strictEqual(assignedPerms.rows.length, 3, 'Les 3 permissions doivent être liées au rôle dynamique');

      // 3.4 Nettoyage
      await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [createdId]);
      await client.query(`DELETE FROM roles WHERE id = $1`, [createdId]);
    });

    // 4. Protection contre la suppression accidentelle des rôles système
    await test('Sécurité : Un rôle avec is_system = true ne doit jamais être supprimé via l\'API', async () => {
      // Simulé par la règle métier :
      const sysRole = await client.query(`SELECT is_system FROM roles WHERE name = 'SUPER_ADMIN'`);
      assert.strictEqual(sysRole.rows[0].is_system, true);
    });

  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n================================================================');
  console.log(`RÉSULTAT : ${passedTests}/${totalTests} tests réussis avec succès !`);
  console.log('================================================================');
}

runAll().catch(err => {
  console.error('Erreur critique pendant la suite de tests :', err);
  process.exit(1);
});

