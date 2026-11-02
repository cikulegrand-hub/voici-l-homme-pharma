/**
 * VHP-CDC-001 – Helpers partagés pour les tests E2E
 * Toutes les requêtes HTTP sont faites via http.request natif Node.js
 */
'use strict';

const http = require('http');

const E2E_PORT = process.env.E2E_PORT || process.env.PORT || '3000';
const BASE_URL = `http://localhost:${E2E_PORT}/api/v1`;

let _passCount = 0;
let _failCount = 0;
let _results = [];
let _authToken = null;

/**
 * Effectue une requête HTTP et retourne { status, body }
 */
function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
        headers: {
        'Content-Type': 'application/json',
          ...(!_authToken && !headers.Authorization
            ? {}
            : { Authorization: headers.Authorization || `Bearer ${_authToken}` }),
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        if (path === '/auth/login' || path === '/auth/refresh') {
          _authToken = parsed?.token || parsed?.accessToken || _authToken;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.setTimeout(30000, () => {
      req.destroy(new Error('Request timeout after 30s'));
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Assertion simple
 */
function assert(label, condition, detail = '') {
  if (condition) {
    _passCount++;
    _results.push({ ok: true, label });
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${label}\n`);
  } else {
    _failCount++;
    _results.push({ ok: false, label, detail });
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${label}${detail ? ' — ' + detail : ''}\n`);
  }
}

/**
 * Lance une suite de tests
 */
async function suite(name, fn) {
  process.stdout.write(`\n\x1b[1m[${name}]\x1b[0m\n`);
  try {
    await fn();
  } catch (err) {
    _failCount++;
    _results.push({ ok: false, label: name, detail: err.message });
    process.stdout.write(`  \x1b[31m✗\x1b[0m CRASH: ${err.message}\n`);
  }
}

/**
 * Attend N ms (pause entre tests sensibles aux délais)
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Rapport final
 */
function printSummary() {
  const total = _passCount + _failCount;
  process.stdout.write(
    `\n${'═'.repeat(60)}\n` +
    `RÉSULTAT : \x1b[32m${_passCount} passés\x1b[0m / \x1b[31m${_failCount} échoués\x1b[0m (${total} total)\n`,
  );
  if (_failCount > 0) {
    process.stdout.write('\nÉchecs :\n');
    _results.filter((r) => !r.ok).forEach((r) => {
      process.stdout.write(`  ✗ ${r.label}${r.detail ? ' — ' + r.detail : ''}\n`);
    });
  }
  process.stdout.write('═'.repeat(60) + '\n');
  return _failCount;
}

module.exports = { request, assert, suite, sleep, printSummary };

