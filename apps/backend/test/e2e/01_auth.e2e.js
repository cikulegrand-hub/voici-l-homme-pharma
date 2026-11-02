/**
 * VHP-CDC-001 – Tests E2E : Santé & Authentification
 */
'use strict';

const { request, assert, suite } = require('./helpers');

module.exports = async function runAuthTests(ctx) {
  // ── HEALTH ──────────────────────────────────────────────
  await suite('GET /health', async () => {
    const r = await request('GET', '/health');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('status UP', r.body?.status === 'UP', JSON.stringify(r.body));
    assert(
      'database connected',
      r.body?.database === 'connected' || r.body?.database?.status === 'UP',
      JSON.stringify(r.body),
    );
  });

  // ── AUTH – LOGIN VALIDE ─────────────────────────────────
  await suite('POST /auth/login (succès)', async () => {
    const r = await request('POST', '/auth/login', {
      username: 'admin',
      password: process.env.E2E_ADMIN_PASSWORD || 'Admin2026@VoiciLHomme!',
    });
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const token = r.body?.token || r.body?.accessToken;
    assert('token JWT présent', typeof token === 'string', JSON.stringify(r.body));
    assert('refreshToken présent', typeof r.body?.refreshToken === 'string', JSON.stringify(r.body));
    assert('role présent', typeof r.body?.user?.role === 'string', JSON.stringify(r.body));
    if (token) ctx.token = token;
    if (r.body?.refreshToken) ctx.refreshToken = r.body.refreshToken;
    if (r.body?.user?.id) ctx.adminId = r.body.user.id;
  });

  // ── AUTH – LOGIN INVALIDE ───────────────────────────────
  await suite('POST /auth/login (mauvais mot de passe)', async () => {
    const r = await request('POST', '/auth/login', {
      username: 'admin',
      password: 'MotDePasseErrone2026!',
    });
    assert('status 400 ou 401', r.status === 400 || r.status === 401, `reçu ${r.status}`);
  });

  // ── AUTH – LOGIN UTILISATEUR INEXISTANT ─────────────────
  await suite('POST /auth/login (utilisateur inexistant)', async () => {
    const r = await request('POST', '/auth/login', {
      username: 'nobody_xyz_99',
      password: 'InexistantPass2026!',
    });
    assert('status 400 ou 401', r.status === 400 || r.status === 401, `reçu ${r.status}`);
  });

  // ── AUTH – REFRESH TOKEN ────────────────────────────────
  await suite('POST /auth/refresh', async () => {
    if (!ctx.refreshToken) {
      assert('skip (pas de refresh token)', false, 'login préalable requis');
      return;
    }
    const r = await request('POST', '/auth/refresh', { refreshToken: ctx.refreshToken });
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    const token = r.body?.token || r.body?.accessToken;
    assert('nouveau token présent', typeof token === 'string', JSON.stringify(r.body));
  });

  // ── AUTH – HISTORIQUE CONNEXIONS ───────────────────────
  await suite('GET /auth/login-history', async () => {
    const r = await request('GET', '/auth/login-history');
    assert('status 200', r.status === 200, `reçu ${r.status}`);
    assert('tableau retourné', Array.isArray(r.body), JSON.stringify(r.body));
    if (Array.isArray(r.body) && r.body.length > 0) {
      const entry = r.body[0];
      assert('champ username présent', typeof entry.username === 'string', JSON.stringify(entry));
      assert('champ success booléen', typeof entry.success === 'boolean', JSON.stringify(entry));
    }
  });

  // ── AUTH – VERIFY PIN ──────────────────────────────────
  await suite('POST /auth/verify-pin (PIN invalide)', async () => {
    const r = await request('POST', '/auth/verify-pin', {
      pinCode: '0000',
      action: 'ANNULATION_VENTE',
    });
    assert(
      'réponse cohérente (200, 400 ou 401)',
      r.status === 200 || r.status === 400 || r.status === 401,
      `reçu ${r.status}`,
    );
    if (r.body?.valid !== undefined) {
      assert('valid false', r.body.valid === false, JSON.stringify(r.body));
    }
  });

  // ── AUTH – CRÉER UN UTILISATEUR TEST ──────────────────
  await suite('POST /auth/users (créer caissier test)', async () => {
    const unique = Date.now().toString().slice(-6);
    const r = await request('POST', '/auth/users', {
      username: `caissier_e2e_${unique}`,
      password: 'TestPassword2026!',
      fullName: `Caissier E2E ${unique}`,
      role: 'CAISSIER',
    });
    assert(
      'status 201 ou 200',
      r.status === 201 || r.status === 200,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
    if (r.body?.username) ctx.testUsername = r.body.username;
  });

  // ── AUTH – DÉSACTIVER L'UTILISATEUR TEST ─────────────
  await suite('PATCH /auth/users/:username/deactivate', async () => {
    if (!ctx.testUsername) {
      assert('skip (utilisateur test non créé)', false, '');
      return;
    }
    const r = await request('PATCH', `/auth/users/${ctx.testUsername}/deactivate`, {});
    assert(
      'status 200 ou 204',
      r.status === 200 || r.status === 204,
      `reçu ${r.status} – ${JSON.stringify(r.body)}`,
    );
  });
};
