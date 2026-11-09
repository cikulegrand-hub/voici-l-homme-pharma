/**
 * Script d'exécution automatique des migrations PostgreSQL
 * Voici l'Homme Pharma - VHP-CDC-001
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function runMigrations() {
  console.log('----------------------------------------------------');
  console.log('  Voici l’Homme Pharma · Migration Base de Données  ');
  console.log('----------------------------------------------------');

  const connectionString = process.env.DATABASE_URL;
  const isSsl = process.env.DB_SSL === 'true';

  let pool;
  if (connectionString && connectionString !== 'postgresql://postgres:postgres@localhost:5432/voici_lhomme_pharma') {
    console.log(`[Config] Connexion via DATABASE_URL : ${connectionString.replace(/:[^:@]+@/, ':****@')}`);
    pool = new Pool({
      connectionString,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    });
  } else {
    console.log(`[Config] Connexion via paramètres individuels :`);
    console.log(`  - Hôte     : ${process.env.DB_HOST || 'localhost'}`);
    console.log(`  - Port     : ${process.env.DB_PORT || '5432'}`);
    console.log(`  - Base     : ${process.env.DB_NAME || 'voici_lhomme_pharma'}`);
    console.log(`  - Utilisateur : ${process.env.DB_USER || 'postgres'}`);
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'voici_lhomme_pharma',
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  const client = await pool.connect();
  try {
    const versionRes = await client.query('SELECT version();');
    console.log(`[PostgreSQL] Connecté avec succès : ${versionRes.rows[0].version.split(',')[0]}\n`);

    const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
    const prismaMigrationsDir = path.resolve(__dirname, '../prisma/migrations');
    const migrationFiles = [
      ['001_initial_schema.sql', path.join(migrationsDir, '001_initial_schema.sql')],
      ['002_functions_and_triggers.sql', path.join(migrationsDir, '002_functions_and_triggers.sql')],
      ['003_seed_data.sql', path.join(migrationsDir, '003_seed_data.sql')],
      ['20261029134500_migration_004', path.join(prismaMigrationsDir, '20261029134500_migration_004', 'migration.sql')],
      ['20261031140000_migration_005_stk_inventory_immutable', path.join(prismaMigrationsDir, '20261031140000_migration_005_stk_inventory_immutable', 'migration.sql')],
      ['20261031143000_migration_006_module4_stk_gap_fill', path.join(prismaMigrationsDir, '20261031143000_migration_006_module4_stk_gap_fill', 'migration.sql')],
      ['20261031150000_migration_007_lot_storage_location', path.join(prismaMigrationsDir, '20261031150000_migration_007_lot_storage_location', 'migration.sql')],
      ['20261031153000_migration_008_stock_adjustments', path.join(prismaMigrationsDir, '20261031153000_migration_008_stock_adjustments', 'migration.sql')],
      ['20261031170000_purchase_order_sequences', path.join(prismaMigrationsDir, '20261031170000_purchase_order_sequences', 'migration.sql')],
      ['20261031173000_seed_purchase_order_sequences', path.join(prismaMigrationsDir, '20261031173000_seed_purchase_order_sequences', 'migration.sql')],
      ['20261031190000_module5_cli_receivables', path.join(prismaMigrationsDir, '20261031190000_module5_cli_receivables', 'migration.sql')],
      ['20261101190000_vte_returns_and_cancel_trigger', path.join(prismaMigrationsDir, '20261101190000_vte_returns_and_cancel_trigger', 'migration.sql')],
      ['20261101191000_vte_held_carts', path.join(prismaMigrationsDir, '20261101191000_vte_held_carts', 'migration.sql')],
      ['20261101192000_vte_payment_reversals', path.join(prismaMigrationsDir, '20261101192000_vte_payment_reversals', 'migration.sql')],
      ['20261101210000_fin_expense_reversals', path.join(prismaMigrationsDir, '20261101210000_fin_expense_reversals', 'migration.sql')],
      ['20261101211000_fin_accountant_readonly', path.join(prismaMigrationsDir, '20261101211000_fin_accountant_readonly', 'migration.sql')],
      ['20261101212000_fin_payment_currency_amount', path.join(prismaMigrationsDir, '20261101212000_fin_payment_currency_amount', 'migration.sql')],
      ['20261102200000_notifications_and_audit_hardening', path.join(prismaMigrationsDir, '20261102200000_notifications_and_audit_hardening', 'migration.sql')],
      ['20261103200000_v2_sales_offline_and_held_carts', path.join(prismaMigrationsDir, '20261103200000_v2_sales_offline_and_held_carts', 'migration.sql')],
      ['20261104230000_exchange_rate_audit_reference', path.join(prismaMigrationsDir, '20261104230000_exchange_rate_audit_reference', 'migration.sql')],
      ['20261105090000_exchange_rate_trace_financial_entries', path.join(prismaMigrationsDir, '20261105090000_exchange_rate_trace_financial_entries', 'migration.sql')],
      ['20261105100000_module_f_cli_customer_profile', path.join(prismaMigrationsDir, '20261105100000_module_f_cli_customer_profile', 'migration.sql')],
      ['20261105110000_customer_profile_photo', path.join(prismaMigrationsDir, '20261105110000_customer_profile_photo', 'migration.sql')],
      ['20261106120000_cash_movements', path.join(prismaMigrationsDir, '20261106120000_cash_movements', 'migration.sql')],
      ['20261107100000_persist_sale_cancellation_requests', path.join(prismaMigrationsDir, '20261107100000_persist_sale_cancellation_requests', 'migration.sql')],
    ];

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existingSchema = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pharmacies'
      ) AS initialized
    `);
    if (existingSchema.rows[0].initialized) {
      for (const name of migrationFiles.slice(0, 3).map(([migration]) => migration)) {
        await client.query(
          'INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
          [name],
        );
      }
      console.log('[Historique] Schéma historique déjà présent : migrations 001-003 ignorées.');
    }

    // La migration corrective historique 004 a déjà été appliquée sur certaines
    // bases par l'ancien runner, sans être enregistrée dans un historique. Elle
    // contient plusieurs ALTER TABLE non idempotents : on la reconnaît par sa
    // contrainte principale et on laisse la migration 006 traiter les ajouts
    // ACH/STK manquants de façon idempotente.
    const corrective004 = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uk_customers_pharmacy_code'
      ) AS applied
    `);
    if (corrective004.rows[0].applied) {
      await client.query(
        'INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        ['20261029134500_migration_004'],
      );
    }

    // La séquence de bons de commande a également pu être créée par une version
    // antérieure du backend sans inscription dans l'historique des migrations.
    const purchaseOrderSequenceExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'purchase_order_sequences'
      ) AS applied
    `);
    if (purchaseOrderSequenceExists.rows[0].applied) {
      await client.query(
        'INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        ['20261031170000_purchase_order_sequences'],
      );
    }

    for (const [file, filePath] of migrationFiles) {
      const applied = await client.query(
        'SELECT 1 FROM public.schema_migrations WHERE filename = $1',
        [file],
      );
      if (applied.rowCount > 0) {
        console.log(`-> Migration déjà appliquée : ${file}`);
        continue;
      }
      if (!fs.existsSync(filePath)) {
        throw new Error(`Fichier de migration introuvable : ${filePath}`);
      }

      console.log(`-> Exécution de la migration : ${file} ...`);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public.schema_migrations (filename) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
      } catch (migrationError) {
        await client.query('ROLLBACK');
        throw migrationError;
      }
      console.log(`   [OK] ${file} appliquée avec succès.`);
    }

    console.log('\n[Succès] Toutes les migrations ont été appliquées avec succès.');
    console.log('Les 21 tables, fonctions séquentielles (FAC-YYYY-XXXXXX), triggers FEFO et données initiales sont en place.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n[Erreur de migration] :', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[Erreur Fatale]', err);
  process.exit(1);
});
