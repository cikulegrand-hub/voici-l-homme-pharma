const assert = require('assert');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/backend/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('================================================================');
console.log('TEST SUITE : PROPAGATION TEMPS RÉEL DES PERMISSIONS (VHP-RBAC)');
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
    // 1. Vérifier que la table role_permissions contient bien des associations
    await test('Source de vérité DB : La table role_permissions contient les permissions actives des rôles', async () => {
      const res = await client.query(`
        SELECT r.name as role_name, count(rp.permission_id) as perm_count
        FROM roles r
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        GROUP BY r.name
      `);
      assert(res.rows.length > 0, 'Les rôles doivent être présents en base');
    });

    // 2. Créer un rôle temporaire de test
    const testRoleName = `TEST_PROPAGATION_${Date.now()}`;
    let testRoleId;
    await test('Création dynamique d\'un rôle de test pour vérifier la propagation', async () => {
      const res = await client.query(
        `INSERT INTO roles (name, description, is_system, max_discount_percent) VALUES ($1, $2, $3, $4) RETURNING id`,
        [testRoleName, 'Rôle de test propagation', false, 15]
      );
      testRoleId = res.rows[0].id;
      assert(testRoleId, 'ID du rôle généré');
    });

    // 3. Associer 2 permissions à ce rôle
    const permsRes = await client.query(`SELECT id, code FROM permissions WHERE code IN ('pos.access', 'vente.creer') LIMIT 2`);
    assert(permsRes.rows.length === 2, 'Les permissions de test doivent exister');
    const [p1, p2] = permsRes.rows;

    await test('Attribution initiale de 2 permissions en base de données', async () => {
      await client.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2), ($1, $3)`, [testRoleId, p1.id, p2.id]);
      const check = await client.query(`SELECT permission_id FROM role_permissions WHERE role_id = $1`, [testRoleId]);
      assert.strictEqual(check.rows.length, 2, '2 permissions doivent être attribuées');
    });

    // 4. Simuler le calcul des droits effectifs (logique pure DB)
    function simulateEffectivePermissions(rolePermissions, overrides = [], roleName = '') {
      if (roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') {
        return ['*'];
      }
      const baseCodes = new Set(rolePermissions);
      const effective = new Set(baseCodes);
      for (const ov of overrides) {
        if (!ov.code) continue;
        if (ov.granted === false) effective.delete(ov.code);
        else if (ov.granted === true) effective.add(ov.code);
      }
      return Array.from(effective);
    }

    await test('Calcul DB-Only : Droits initiaux calculés fidèlement depuis la base', async () => {
      const perms = simulateEffectivePermissions([p1.code, p2.code], [], testRoleName);
      assert.strictEqual(perms.length, 2);
      assert(perms.includes(p1.code));
      assert(perms.includes(p2.code));
    });

    // 5. Simuler le Super Admin qui décoche une case (suppression de p2)
    await test('Super Admin décoche une permission : Suppression en base de données', async () => {
      await client.query(`DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`, [testRoleId, p2.id]);
      const remaining = await client.query(
        `SELECT p.code FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = $1`,
        [testRoleId]
      );
      const codes = remaining.rows.map(r => r.code);
      assert.strictEqual(codes.length, 1);
      assert.strictEqual(codes[0], p1.code);

      // Calcul des droits après décochage
      const permsAfter = simulateEffectivePermissions(codes, [], testRoleName);
      assert(!permsAfter.includes(p2.code), 'La permission décochée doit impérativement être absente des droits effectifs !');
      assert.strictEqual(permsAfter.length, 1);
    });

    // 6. Nettoyage du rôle temporaire
    await test('Nettoyage du rôle temporaire de test', async () => {
      await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [testRoleId]);
      await client.query(`DELETE FROM roles WHERE id = $1`, [testRoleId]);
    });

    console.log(`\n================================================================`);
    console.log(`RÉSULTAT : ${passedTests}/${totalTests} tests réussis avec succès !`);
    console.log(`================================================================`);
  } finally {
    client.release();
    await pool.end();
  }
}

runAll().catch(err => {
  console.error('Erreur critique pendant les tests :', err);
  process.exit(1);
});
