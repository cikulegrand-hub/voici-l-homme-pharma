const readline = require('readline');
const path = require('path');

const ROOT = 'E:\\voici l\'homme pharma';
const BACKEND_ROOT = path.join(ROOT, 'apps', 'backend');

const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

const argon2 = require(path.join(ROOT, 'node_modules', 'argon2'));
const { PrismaClient } = require(path.join(ROOT, 'node_modules', '@prisma', 'client'));
const { PrismaPg } = require(path.join(ROOT, 'node_modules', '@prisma', 'adapter-pg'));
const { Pool } = require(path.join(ROOT, 'node_modules', 'pg'));

function askQuestion(query, hidden = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      // Masquer la saisie du mot de passe
      process.stdout.write(query);
      let input = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const onData = (char) => {
        const c = char.toString('utf8');
        if (c === '\n' || c === '\r' || c === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          // Ctrl+C
          process.exit(1);
        } else if (c === '\u0008' || c === '\x7f') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += c;
          process.stdout.write('*');
        }
      };

      process.stdin.on('data', onData);
    } else {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

function validatePasswordPolicy(password) {
  if (!password || password.length < 8) {
    return 'Le mot de passe doit comporter au moins 8 caractères.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Le mot de passe doit comporter au moins une lettre majuscule.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Le mot de passe doit comporter au moins une lettre minuscule.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Le mot de passe doit comporter au moins un chiffre.';
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Le mot de passe doit comporter au moins un caractère spécial (!@#$%^&*...).';
  }
  return null;
}

async function main() {
  console.log('================================================================');
  console.log('  CRÉATION INITIALE DU COMPTE ADMINISTRATEUR (VHP-CDC-001)');
  console.log('  Sécurité renforcée : Hachage Argon2id, saisie sécurisée');
  console.log('================================================================\n');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  await prisma.$connect();

  try {
    // 1. Récupérer la pharmacie
    let pharmacy = await prisma.pharmacies.findFirst();
    if (!pharmacy) {
      console.log('[INFO] Création automatique de l\'officine de base...');
      pharmacy = await prisma.pharmacies.create({
        data: {
          code: 'OFF-KIN-001',
          name: 'Voici l\'Homme Pharma',
          address: 'Av. de l\'Église, Q. Résidentiel, Commune de Limete',
          city: 'Kinshasa',
          country: 'RDC',
          phone: '+243 81 234 56 78',
          default_currency: 'CDF',
        },
      });
    }

    // 2. Récupérer le rôle ADMIN
    let adminRole = await prisma.roles.findFirst({ where: { name: 'ADMIN' } });
    if (!adminRole) {
      console.log('[INFO] Création du rôle ADMIN...');
      adminRole = await prisma.roles.create({
        data: {
          name: 'ADMIN',
          description: 'Propriétaire / Administrateur système (accès total)',
          max_discount_percent: 100.0,
        },
      });
    }

    // 3. Questions interactives
    const usernameInput = await askQuestion('Nom d\'utilisateur [admin] : ');
    const username = (usernameInput || 'admin').toLowerCase();

    const fullNameInput = await askQuestion('Nom complet [Administrateur Principal] : ');
    const fullName = fullNameInput || 'Administrateur Principal';

    const emailInput = await askQuestion('Adresse email [admin@voicilhomme.cd] : ');
    const email = emailInput || 'admin@voicilhomme.cd';

    // 4. Mot de passe sécurisé
    let password = '';
    while (true) {
      password = await askQuestion('Mot de passe administrateur : ', true);
      const policyError = validatePasswordPolicy(password);
      if (policyError) {
        console.log(`[ERREUR] ${policyError}`);
        continue;
      }

      const confirmPassword = await askQuestion('Confirmez le mot de passe : ', true);
      if (password !== confirmPassword) {
        console.log('[ERREUR] Les mots de passe ne correspondent pas. Réessayez.\n');
        continue;
      }
      break;
    }

    // 5. Code PIN superviseur (pour validation des remises et avoirs)
    let pinCode = '';
    while (true) {
      pinCode = await askQuestion('Code PIN superviseur (4 chiffres) [9999] : ', true);
      if (!pinCode) pinCode = '9999';

      if (!/^\d{4}$/.test(pinCode)) {
        console.log('[ERREUR] Le code PIN doit être composé exactement de 4 chiffres.');
        continue;
      }
      break;
    }

    // 6. Hachage Argon2id
    console.log('\n[INFO] Hachage cryptographique Argon2id du mot de passe...');
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });

    const pinHash = await argon2.hash(pinCode, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    // Nettoyer les variables sensibles de la mémoire
    password = '';
    pinCode = '';

    // 7. Enregistrement en base de données
    const existingUser = await prisma.users.findUnique({
      where: { username },
    });

    if (existingUser) {
      console.log(`[INFO] Mise à jour du compte existant « ${username} »...`);
      await prisma.users.update({
        where: { id: existingUser.id },
        data: {
          pharmacy_id: pharmacy.id,
          role_id: adminRole.id,
          full_name: fullName,
          email,
          password_hash: passwordHash,
          pin_code_hash: pinHash,
          failed_login_attempts: 0,
          locked_until: null,
          is_active: true,
        },
      });
      console.log(`\n[SUCCÈS] Le compte administrateur « ${username} » a été mis à jour avec succès en Argon2id !`);
    } else {
      console.log(`[INFO] Création du nouvel administrateur « ${username} »...`);
      await prisma.users.create({
        data: {
          pharmacy_id: pharmacy.id,
          role_id: adminRole.id,
          username,
          full_name: fullName,
          email,
          password_hash: passwordHash,
          pin_code_hash: pinHash,
          failed_login_attempts: 0,
          is_active: true,
        },
      });
      console.log(`\n[SUCCÈS] Le compte administrateur « ${username} » a été créé avec succès en Argon2id !`);
    }

    console.log(`Pharmacie rattachée : ${pharmacy.name} (${pharmacy.code})`);
    console.log(`Rôle attribué       : ${adminRole.name}`);
    console.log('Sécurité            : Argon2id (mot de passe et PIN)');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n[FATAL] Erreur lors de la création de l\'administrateur :', err.message);
  process.exit(1);
});

