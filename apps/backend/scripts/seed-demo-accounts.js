const path = require('path');
const BACKEND_ROOT = path.join(__dirname, '..');

const dotenv = require('dotenv');
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });
dotenv.config();

const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const DEMO_ACCOUNTS = [
  {
    role: 'ADMIN',
    roleDesc: 'Administrateur / Propriétaire',
    username: 'admin',
    fullName: 'Dr. Joseph Mukendi (Admin)',
    email: 'admin@voicilhomme.cd',
    password: 'Admin2026@VoiciLHomme!',
    pin: '9999',
    maxDiscount: 100,
  },
  {
    role: 'PHARMACIEN',
    roleDesc: 'Pharmacien Responsable',
    username: 'pharmacien',
    fullName: 'Pharm. Marie Claire Kalala',
    email: 'pharmacien@voicilhomme.cd',
    password: 'Pharma2026@VoiciLHomme!',
    pin: '1234',
    maxDiscount: 20,
  },
  {
    role: 'CAISSIER',
    roleDesc: 'Caissier / Vendeur Comptoir',
    username: 'caissier',
    fullName: 'Dieudonné Mwamba (Caisse)',
    email: 'caissier@voicilhomme.cd',
    password: 'Caisse2026@VoiciLHomme!',
    pin: '2345',
    maxDiscount: 5,
  },
  {
    role: 'STOCK',
    roleDesc: 'Gestionnaire de Stock',
    username: 'stock',
    fullName: 'Alain Ilunga (Magasinier)',
    email: 'stock@voicilhomme.cd',
    password: 'Stock2026@VoiciLHomme!',
    pin: '3456',
    maxDiscount: 0,
  },
  {
    role: 'COMPTABLE',
    roleDesc: 'Comptable & Finances',
    username: 'comptable',
    fullName: 'Françoise Tshilombo (Comptabilité)',
    email: 'comptable@voicilhomme.cd',
    password: 'Compta2026@VoiciLHomme!',
    pin: '4567',
    maxDiscount: 0,
  },
];

async function main() {
  console.log('================================================================');
  console.log('INITIALISATION DES COMPTES DE DÉMONSTRATION (5 PROFILS CDC)');
  console.log('================================================================\n');

  if (!process.env.DATABASE_URL) {
    console.error('Erreur : variable DATABASE_URL absente.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log('✓ Connecté à PostgreSQL');

    let pharmacy = await prisma.pharmacies.findFirst();
    if (!pharmacy) {
      pharmacy = await prisma.pharmacies.create({
        data: {
          code: 'OFF-KIN-001',
          name: "Voici l'Homme Pharma",
          address: "Av. de l'Église, Q. Résidentiel, Commune de Limete",
          city: 'Kinshasa',
          country: 'RDC',
          phone: '+243 81 234 56 78',
          default_currency: 'CDF',
        },
      });
      console.log('✓ Pharmacie créée :', pharmacy.name);
    } else {
      console.log('✓ Pharmacie existante :', pharmacy.name);
    }

    for (const acc of DEMO_ACCOUNTS) {
      // 1. Rôle
      let roleRecord = await prisma.roles.findFirst({ where: { name: acc.role } });
      if (!roleRecord) {
        roleRecord = await prisma.roles.create({
          data: {
            name: acc.role,
            description: acc.roleDesc,
            max_discount_percent: acc.maxDiscount,
          },
        });
        console.log(`✓ Rôle créé : ${acc.role}`);
      }

      // 2. Hashage Argon2id
      const passwordHash = await argon2.hash(acc.password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const pinHash = await argon2.hash(acc.pin, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      // 3. Utilisateur
      let user = await prisma.users.findFirst({ where: { username: acc.username } });
      if (!user) {
        user = await prisma.users.create({
          data: {
            pharmacy_id: pharmacy.id,
            role_id: roleRecord.id,
            username: acc.username,
            email: acc.email,
            full_name: acc.fullName,
            password_hash: passwordHash,
            pin_code_hash: pinHash,
            is_active: true,
          },
        });
        console.log(`✓ Compte créé : ${acc.username} (${acc.role}) - Mot de passe : ${acc.password}`);
      } else {
        user = await prisma.users.update({
          where: { id: user.id },
          data: {
            role_id: roleRecord.id,
            full_name: acc.fullName,
            password_hash: passwordHash,
            pin_code_hash: pinHash,
            is_active: true,
          },
        });
        console.log(`✓ Compte mis à jour : ${acc.username} (${acc.role})`);
      }
    }

    console.log('\n================================================================');
    console.log('Tous les comptes de test sont prêts et configurés !');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Erreur lors du seeding :', err.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { DEMO_ACCOUNTS, main };

