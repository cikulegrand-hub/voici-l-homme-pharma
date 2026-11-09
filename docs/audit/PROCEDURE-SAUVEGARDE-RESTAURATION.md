# Procédure sûre de sauvegarde, restauration et migrations

Cette procédure est préparée pour VHP-CDC-001. Elle ne doit pas être exécutée sur la production sans validation explicite du propriétaire. Les commandes utilisent des variables d’environnement et n’acceptent aucun identifiant écrit en clair.

## 1. Sauvegarde manuelle préalable

Définir `DATABASE_URL` depuis un gestionnaire de secrets ou un fichier local non versionné. Ne jamais le placer dans un ticket, un rapport ou un log.

PowerShell :

```powershell
$env:PGSSLMODE = 'require'
$dump = Join-Path $pwd ('vhp-prod-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
pg_dump --dbname=$env:DATABASE_URL --format=custom --file=$dump --no-owner --no-acl --verbose
```

Bash :

```bash
export PGSSLMODE=require
dump="vhp-prod-$(date -u +%Y%m%d-%H%M%S).dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --file="$dump" --no-owner --no-acl --verbose
```

Ne pas utiliser `--password` dans la commande. Stocker le dump dans un répertoire chiffré, puis le chiffrer côté client avec une clé conservée séparément du dépôt.

Vérification non destructive :

```powershell
Get-Item .\vhp-prod-*.dump | Select-Object FullName,Length,LastWriteTime
pg_restore --list .\vhp-prod-AAAAmmjj-HHmmss.dump | Select-Object -First 40
```

La taille doit être non nulle et `pg_restore --list` doit lire l’en-tête et lister les objets.

Restauration d’essai locale uniquement :

```powershell
$env:PGSSLMODE = 'disable'
createdb vhp_restore_test
pg_restore --dbname=postgresql://localhost:5432/vhp_restore_test --clean --if-exists --no-owner --no-acl .\vhp-prod-AAAAmmjj-HHmmss.dump
psql --dbname=postgresql://localhost:5432/vhp_restore_test --command='SELECT current_database(), COUNT(*) FROM public.audit_logs;'
```

Ne jamais remplacer `localhost` par la cible de production.

## 2. Copie des images du bucket `prescriptions`

Le bucket doit rester privé. Utiliser une URL signée courte ou l’API Storage authentifiée, jamais une URL publique. Injecter la clé de service via le gestionnaire de secrets et ne jamais l’imprimer.

1. Créer un staging chiffré et compter seulement objets/octets dans les logs.
2. Lister les objets de `prescriptions` avec pagination.
3. Télécharger chaque objet et refuser les réponses HTTP non 2xx.
4. Produire un manifeste sans contenu médical : `path`, `size`, `sha256`, `downloadedAt`.
5. Chiffrer côté client les objets et le manifeste avant transfert S3; conserver la clé dans un coffre séparé.
6. Envoyer vers un préfixe versionné, privé et rétentif du stockage S3 externe.
7. Vérifier nombre d’objets, taille totale et checksums après transfert.

## 3. Plan des neuf migrations en attente

Ordre Prisma chronologique, à appliquer uniquement après sauvegarde vérifiée et validation de l’environnement de test :

| # | Migration | Contenu observé | Impact/risque |
|---:|---|---|---|
| 1 | `20261031190000_module5_cli_receivables` | Devise, idempotence et allocations FIFO des paiements clients. | Vérifier doublons de clés et cohérence des paiements. |
| 2 | `20261101190000_vte_returns_and_cancel_trigger` | Trigger d’immutabilité contrôlée des ventes validées. | Peut bloquer des updates historiques non conformes. |
| 3 | `20261101191000_vte_held_carts` | Nouvelle table `held_carts`, FKs et index. | Vérifier les contraintes avec les utilisateurs existants. |
| 4 | `20261101192000_vte_payment_reversals` | Nouvelle table `sale_payment_reversals`. | Vérifier FKs et cohérence des paiements. |
| 5 | `20261101210000_fin_expense_reversals` | Colonnes et FK d’extourne des dépenses. | Rechercher références invalides avant FK. |
| 6 | `20261101211000_fin_accountant_readonly` | Retrait de permissions d’écriture au comptable. | Changement d’habilitation immédiat à valider. |
| 7 | `20261101212000_fin_payment_currency_amount` | Colonne `amount_paid`. | Vérifier sa cohérence avec `amount_paid_cdf`. |
| 8 | `20261102200000_notifications_and_audit_hardening` | Notifications, trigger immuable `audit_logs`, REVOKE UPDATE/DELETE. | Risque élevé sur audit et droits DB. |
| 9 | `20261103200000_v2_sales_offline_and_held_carts` | Statuts/types et ventes hors ligne/paniers. | Risque applicatif sur ventes existantes. |

Préparation test : `prisma migrate status`, copie vérifiée, inspection des contraintes, puis `prisma migrate deploy` avec le `DIRECT_URL` de test uniquement. Après application, contrôler par requêtes d’administration en lecture seule la fonction `raise_immutable_entity_exception()`, le trigger `trg_audit_logs_immutable` et les privilèges `UPDATE`/`DELETE` de `audit_logs`. Aucun déploiement production avant accord écrit.

## 4. Contrôle de démarrage du bucket

En production, `PrescriptionStorageService` refuse le démarrage si Supabase Storage n’est pas configuré. Il effectue ensuite un `GET /storage/v1/bucket/prescriptions` sans créer ni modifier d’objet, et refuse `public: true` ou toute réponse non vérifiable. Le stockage local reste réservé aux environnements hors production.

## 5. Restauration trimestrielle et RPO/RTO

Restaurer chaque trimestre dans une base Postgres éphémère ou un projet Supabase distinct, jamais en production. Chronométrer début, disponibilité applicative et contrôles des tables critiques. Comparer l’horodatage de la dernière donnée restaurée à la panne simulée (RPO) et consigner la durée totale (RTO). Objectifs : RPO ≤ 24 h, RTO ≤ 4 h.

Le compte rendu contient : date, opérateur, identifiant de copie, taille, checksum, version PostgreSQL, migrations, heures début/fin, RPO, RTO, contrôles `audit_logs`/données de santé, anomalies et validation du propriétaire.

## 6. Comparaison simple de stockages S3 externes

| Fournisseur | Coût relatif | Région | Chiffrement / remarque |
|---|---|---|---|
| Cloudflare R2 | Faible à modéré; egress avantageux vers Cloudflare. | Localisation moins fine selon l’offre. | Compatible S3; chiffrer côté client et vérifier résidence des données. |
| Backblaze B2 | Faible. | Régions US/UE selon disponibilité. | Compatible S3; chiffrement côté client possible; confirmer la région UE. |
| Wasabi | Modéré, avec contraintes contractuelles de rétention selon offre. | Régions US/UE/APAC. | Compatible S3; vérifier région et politique de suppression. |

Dans les trois cas : chiffrement côté client avant `PutObject`, clé séparée, bucket privé, rétention/immutabilité et contrôle de résidence. Les tarifs exacts doivent être confirmés auprès du fournisseur au moment du choix.

