const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const argon2 = require('argon2');

async function test() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.users.findUnique({
      where: { username: 'admin' },
      include: {
        roles: {
          include: {
            role_permissions: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    console.log('Query result:', user ? { username: user.username, role: user.roles.name, permissionsCount: user.roles.role_permissions.length, passwordMatches: await argon2.verify(user.password_hash, 'Admin2026@VoiciLHomme!') } : null);
  } catch (err) {
    console.error('Query error:', err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

test();
