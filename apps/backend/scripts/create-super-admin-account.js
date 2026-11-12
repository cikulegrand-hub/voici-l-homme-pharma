const path = require('path');
const BACKEND_ROOT = path.join(__dirname, '..');

const dotenv = require('dotenv');
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });
dotenv.config({ path: path.join(BACKEND_ROOT, '..', '..', '.env') });
dotenv.config();

const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

async function main() {
  console.log('[Script] Connexion à la base de données PostgreSQL...');
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && (connectionString.includes('supabase.com') || connectionString.includes('sslmode='))) {
    connectionString = connectionString.replace(/(\?|&)sslmode=[^&]*/g, '').replace(/\?&/, '?').replace(/\?$/, '');
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  await prisma.$connect();

  try {
    // 1. Récupérer ou créer la pharmacie principale
    let pharmacy = await prisma.pharmacies.findFirst();
    if (!pharmacy) {
      console.log('[Script] Création de l\'officine principale par défaut...');
      pharmacy = await prisma.pharmacies.create({
        data: {
          code: 'OFF-KIN-001',
          name: "Voici l'Homme Pharma (Siège)",
          address: "Av. de l'Église, Q. Résidentiel, Commune de Limete",
          city: 'Kinshasa',
          country: 'RDC',
          phone: '+243 81 234 56 78',
          default_currency: 'CDF',
        },
      });
    }

    // 2. Récupérer ou créer le rôle SUPER_ADMIN
    let superAdminRole = await prisma.roles.findFirst({ where: { name: 'SUPER_ADMIN' } });
    if (!superAdminRole) {
      console.log('[Script] Création du rôle SUPER_ADMIN...');
      superAdminRole = await prisma.roles.create({
        data: {
          name: 'SUPER_ADMIN',
          description: 'Super-Administrateur système / Propriétaire de la plateforme (accès racine absolu)',
          max_discount_percent: 100.0,
          is_system: true,
        },
      });
    }

    // 3. Identifiants et mot de passe respectant la politique de sécurité
    const username = 'superadmin';
    const passwordPlain = 'SuperAdmin2026@VoiciLHomme!';
    const pinPlain = '8888';
    const fullName = 'Super-Administrateur Plateforme';
    const email = 'superadmin@voicilhomme.cd';

    console.log('[Script] Hachage sécurisé avec Argon2id...');
    const passwordHash = await argon2.hash(passwordPlain, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const pinHash = await argon2.hash(pinPlain, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    // 4. Upsert du compte utilisateur superadmin
    const existing = await prisma.users.findUnique({
      where: { username },
    });

    if (existing) {
      console.log(`[Script] Réinitialisation et mise à jour du compte « ${username} »...`);
      await prisma.users.update({
        where: { id: existing.id },
        data: {
          pharmacy_id: pharmacy.id,
          role_id: superAdminRole.id,
          full_name: fullName,
          email,
          password_hash: passwordHash,
          pin_code_hash: pinHash,
          failed_login_attempts: 0,
          locked_until: null,
          is_active: true,
        },
      });
    } else {
      console.log(`[Script] Création du compte « ${username} »...`);
      await prisma.users.create({
        data: {
          pharmacy_id: pharmacy.id,
          role_id: superAdminRole.id,
          username,
          full_name: fullName,
          email,
          password_hash: passwordHash,
          pin_code_hash: pinHash,
          failed_login_attempts: 0,
          is_active: true,
        },
      });
    }

    console.log('\n======================================================');
    console.log(' COMPTE SUPER-ADMINISTRATEUR CRÉÉ AVEC SUCCÈS');
    console.log('======================================================');
    console.log(` Identifiant : ${username}`);
    console.log(` Mot de passe: ${passwordPlain}`);
    console.log(` Code PIN    : ${pinPlain}`);
    console.log(` Rôle        : ${superAdminRole.name}`);
    console.log(` Officine    : ${pharmacy.name}`);
    console.log('======================================================\n');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[Script] Erreur fatale :', err.message);
  process.exit(1);
});

