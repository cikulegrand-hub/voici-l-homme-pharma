/**
 * VHP-CDC-001 – Orchestrateur E2E avec démarrage automatique du serveur NestJS
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const CURRENT_MAIN_FILE = path.join(BACKEND_DIR, 'dist', 'main.js');
const LEGACY_MAIN_FILE = path.join(BACKEND_DIR, 'dist', 'apps', 'backend', 'src', 'main.js');
const MAIN_FILE = fs.existsSync(CURRENT_MAIN_FILE) ? CURRENT_MAIN_FILE : LEGACY_MAIN_FILE;
const E2E_PORT = process.env.E2E_PORT || '3000';
const HEALTH_URL = `http://localhost:${E2E_PORT}/api/v1/health`;

console.log(`[E2E Runner] Répertoire Backend: ${BACKEND_DIR}`);
console.log(`[E2E Runner] Fichier Main: ${MAIN_FILE}`);

function pingServer(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(maxAttempts = 60, intervalMs = 1000) {
  console.log('[E2E Runner] Attente du démarrage du serveur NestJS...');
  for (let i = 1; i <= maxAttempts; i++) {
    const up = await pingServer(HEALTH_URL);
    if (up) {
      console.log(`[E2E Runner] Serveur opérationnel après ${i} tentative(s) !`);
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function main() {
  let serverProcess = null;

  try {
    // 1. Lancement du serveur NestJS en arrière-plan
    console.log('[E2E Runner] Démarrage du processus NestJS...');
    serverProcess = spawn(process.execPath, [MAIN_FILE], {
      cwd: BACKEND_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: E2E_PORT, E2E_PORT },
    });

    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.log(`[NestJS Server] ${msg}`);
    });

    serverProcess.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.error(`[NestJS Server ERR] ${msg}`);
    });

    serverProcess.on('exit', (code, sig) => {
      if (code !== 0 && code !== null) {
        console.warn(`[NestJS Server] Arrêté avec code ${code} / signal ${sig}`);
      }
    });

    // 2. Attendre que le serveur réponde
    // Le démarrage peut dépasser 35 s lorsque PostgreSQL/Prisma initialise le pool.
    const ready = await waitForServer(90, 1000);
    if (!ready) {
      console.error('[E2E Runner] ERREUR : Le serveur NestJS n\'a pas répondu dans le délai imparti.');
      process.exit(1);
    }

    // 3. Exécution des tests E2E
    console.log('\n[E2E Runner] Lancement de la suite de tests E2E...');
    const runnerPath = path.join(__dirname, process.env.E2E_SUITE || 'run_e2e_tests.js');
    
    const testCode = await new Promise((resolve) => {
      const testProcess = spawn(process.execPath, [runnerPath], {
        cwd: BACKEND_DIR,
        stdio: 'inherit',
        env: { ...process.env, E2E_PORT },
      });

      testProcess.on('exit', (code) => {
        resolve(code || 0);
      });
    });

    console.log(`\n[E2E Runner] Suite de tests terminée avec le code de sortie : ${testCode}`);
    process.exit(testCode);

  } catch (err) {
    console.error('[E2E Runner] Exception inattendue :', err);
    process.exit(1);
  } finally {
    if (serverProcess && !serverProcess.killed) {
      console.log('[E2E Runner] Arrêt du serveur NestJS...');
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
        } else {
          serverProcess.kill('SIGTERM');
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

main();

