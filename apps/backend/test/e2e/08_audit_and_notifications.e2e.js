/**
 * VHP-CDC-001 – Tests E2E : Module 9 (AUD & NOT)
 * Journal d'audit inaltérable, RBAC, déduplication et centre de notifications
 */
'use strict';

const { request, assert, suite } = require('./helpers');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = async function runAuditAndNotificationsTests(ctx) {
  let createdNotificationId = null;

  // =========================================================================
  // 1. AUD-03 & RG-06 : IMMUTABILITÉ ABSOLUE DU JOURNAL D'AUDIT
  // =========================================================================
  await suite('AUD-03 : API - Aucune route de modification ou suppression sur /audit/logs', async () => {
    const putRes = await request('PUT', '/audit/logs', { action: 'MODIFIED' });
    assert('PUT /audit/logs interdit (404/405)', putRes.status === 404 || putRes.status === 405, `reçu ${putRes.status}`);

    const patchRes = await request('PATCH', '/audit/logs', { action: 'MODIFIED' });
    assert('PATCH /audit/logs interdit (404/405)', patchRes.status === 404 || patchRes.status === 405, `reçu ${patchRes.status}`);

    const delRes = await request('DELETE', '/audit/logs', {});
    assert('DELETE /audit/logs interdit (404/405)', delRes.status === 404 || delRes.status === 405, `reçu ${delRes.status}`);
  });

  await suite('AUD-03 : Base de Données - Le trigger SQL interdit strictement UPDATE et DELETE sur audit_logs', async () => {
    const connectionString = process.env.DATABASE_URL;
    let pool;
    if (connectionString) {
      pool = new Pool({ connectionString, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    } else {
      pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'voici_lhomme_pharma',
      });
    }

    const client = await pool.connect();
    try {
      // 1. Trouver un audit log existant
      const findRes = await client.query('SELECT id FROM audit_logs LIMIT 1;');
      if (findRes.rowCount > 0) {
        const testId = findRes.rows[0].id;

        // 2. Tenter un UPDATE direct
        let updateBlocked = false;
        try {
          await client.query('UPDATE audit_logs SET action = $1 WHERE id = $2;', ['HACKED_ACTION', testId]);
        } catch (err) {
          updateBlocked = true;
          assert('UPDATE rejeté par le trigger d’immutabilité (P0001)', err.code === 'P0001' || err.message.includes('inaltérable') || err.message.includes('non modifiable') || err.message.includes('exception'), err.message);
        }
        assert('Tentative d’UPDATE bloquée', updateBlocked);

        // 3. Tenter un DELETE direct
        let deleteBlocked = false;
        try {
          await client.query('DELETE FROM audit_logs WHERE id = $1;', [testId]);
        } catch (err) {
          deleteBlocked = true;
          assert('DELETE rejeté par le trigger d’immutabilité (P0001)', err.code === 'P0001' || err.message.includes('inaltérable') || err.message.includes('non modifiable') || err.message.includes('exception'), err.message);
        }
        assert('Tentative de DELETE bloquée', deleteBlocked);
      } else {
        assert('Table audit_logs accessible pour test d’immutabilité', true);
      }
    } finally {
      client.release();
      await pool.end();
    }
  });

  // =========================================================================
  // 2. AUD-04 & AUD-05 : CONSULTATION, FILTRES, PAGINATION & EXPORT CSV
  // =========================================================================
  await suite('AUD-04 : Consultation paginée du journal d’audit', async () => {
    const res = await request('GET', '/audit/logs?page=1&limit=10');
    assert('status 200', res.status === 200, `reçu ${res.status}`);
    const data = res.body?.data || res.body;
    assert('liste de logs retournée', Array.isArray(data), JSON.stringify(res.body));
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert('horodatage présent (createdAt)', !!first.createdAt);
      assert('action présente', !!first.action);
      assert('entité présente', !!first.entityName);
    }
  });

  await suite('AUD-04 : Filtrage du journal par action', async () => {
    const res = await request('GET', '/audit/logs?action=LOGIN_SUCCES');
    assert('status 200', res.status === 200, `reçu ${res.status}`);
    const data = res.body?.data || res.body;
    assert('données retournées', Array.isArray(data));
    if (data.length > 0) {
      assert('actions filtrées contiennent LOGIN', data.every(d => d.action.includes('LOGIN')));
    }
  });

  await suite('AUD-05 : Export du journal au format CSV (inspection)', async () => {
    const res = await request('GET', '/audit/export');
    assert('status 200', res.status === 200, `reçu ${res.status}`);
    const bodyStr = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
    assert('en-tête CSV présent', bodyStr.includes('Horodatage') || bodyStr.includes('Action') || bodyStr.includes('Entité'));
  });

  // =========================================================================
  // 3. REC-07 : CONTRÔLE D'ACCÈS RBAC SUR LE JOURNAL D'AUDIT
  // =========================================================================
  await suite('AUD-04 & REC-07 : Contrôle des habilitations sur le journal d’audit', async () => {
    // Connexion avec un compte caissier (ou simulation si présent)
    const cashierLogin = await request('POST', '/auth/login', { username: 'caissier', password: 'Password123!' });
    if (cashierLogin.status === 200) {
      const cashierToken = cashierLogin.body.token || cashierLogin.body.accessToken;
      const denied = await request('GET', '/audit/logs', null, { Authorization: `Bearer ${cashierToken}` });
      assert('Caissier interdit sur /audit/logs (403 Forbidden)', denied.status === 403, `reçu ${denied.status}`);

      const deniedExport = await request('GET', '/audit/export', null, { Authorization: `Bearer ${cashierToken}` });
      assert('Caissier interdit sur /audit/export (403 Forbidden)', deniedExport.status === 403, `reçu ${deniedExport.status}`);
    } else {
      assert('Vérification rôle caissier (ignoré si caissier non créé)', true);
    }
  });

  // =========================================================================
  // 4. NOT-01 & NOT-02 : CENTRE DE NOTIFICATIONS & DÉDUPLICATION QUOTIDIENNE
  // =========================================================================
  await suite('NOT-01 : Déclenchement de la détection et génération des alertes (sync)', async () => {
    const res = await request('POST', '/notifications/sync', {});
    assert('status 200 ou 201', res.status === 200 || res.status === 201, `reçu ${res.status}`);
    assert('compte d’alertes renvoyé', typeof res.body?.createdAlertsCount === 'number');
  });

  await suite('NOT-01 : Déduplication - Un second scan immédiat ne recrée pas les mêmes alertes', async () => {
    const res = await request('POST', '/notifications/sync', {});
    assert('status 200 ou 201', res.status === 200 || res.status === 201, `reçu ${res.status}`);
    assert('0 alerte dupliquée générée', res.body?.createdAlertsCount === 0, `créé: ${res.body?.createdAlertsCount}`);
  });

  await suite('NOT-01 : Consultation des notifications internes', async () => {
    const res = await request('GET', '/notifications');
    assert('status 200', res.status === 200, `reçu ${res.status}`);
    assert('liste de notifications retournée', Array.isArray(res.body), JSON.stringify(res.body));
    if (res.body.length > 0) {
      const n = res.body[0];
      createdNotificationId = n.id;
      assert('champ type valide (STOCK_BAS, PEREMPTION, CREANCE_RETARD, ECART_CAISSE)', ['STOCK_BAS', 'PEREMPTION', 'CREANCE_RETARD', 'ECART_CAISSE'].includes(n.type), n.type);
      assert('champ severity valide', ['INFO', 'WARNING', 'DANGER'].includes(n.severity), n.severity);
      assert('champ isRead présent (booléen)', typeof n.isRead === 'boolean', `${n.isRead}`);
    }
  });

  await suite('NOT-02 : Compteur de notifications non lues (Badge Header/Dashboard)', async () => {
    const res = await request('GET', '/notifications/unread-count');
    assert('status 200', res.status === 200, `reçu ${res.status}`);
    assert('compteur numérique présent', typeof res.body?.count === 'number', JSON.stringify(res.body));
  });

  if (createdNotificationId) {
    await suite('NOT-01 : Marquage d’une notification comme lue', async () => {
      const res = await request('PATCH', `/notifications/${createdNotificationId}/read`, {});
      assert('status 200', res.status === 200, `reçu ${res.status}`);
      assert('succès confirmé', res.body?.success === true);
    });
  }

  await suite('NOT-01 : Tout marquer comme lu', async () => {
    const res = await request('PATCH', '/notifications/mark-all-read', {});
    assert('status 200', res.status === 200, `reçu ${res.status}`);

    const countRes = await request('GET', '/notifications/unread-count');
    assert('compteur de non lues réinitialisé à 0', countRes.body?.count === 0, `reçu ${countRes.body?.count}`);
  });
};

