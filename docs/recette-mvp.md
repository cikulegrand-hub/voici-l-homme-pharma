# Procès-verbal de recette MVP — Module 9 (NOT & AUD)

## État de validation

La compilation backend et frontend est réussie. Les tests E2E doivent être exécutés sur une base PostgreSQL de test isolée (`npm.cmd run test:e2e --workspace=@vhp/backend`) avant signature de recette.

| Exigence | Preuve | Statut |
|---|---|---|
| AUD-01..05 | Contrôleur/service Audit, migration d'immutabilité, test E2E 08 | À exécuter sur base de test |
| NOT-01..02 | Tables, API, polling frontend, test E2E 08 | À exécuter sur base de test |
| REC-01..07 | Suites E2E ventes, stock, auth, audit | À exécuter sur base de test |
| REC-08 | Procédure de restauration et mesure RTO | À fournir par l'exploitation |
| REC-09 | Ce document | En préparation |
| UC-01..06 | Suites E2E par module | À exécuter sur base de test |
| PERF-01..03 | Tests ciblés et benchmark volumétrique | Non mesuré dans cet environnement |
| SEC-01..03 | Argon2id, limitation login, en-têtes HTTP | À auditer avec `npm audit` et test HTTP |

## Critères de signature

La recette ne peut être déclarée réussie que si toutes les lignes ci-dessus sont marquées « Réussi », avec les sorties de tests et les mesures attachées. Les tests qui écrivent des ventes, stocks ou utilisateurs ne doivent pas être exécutés sur la base de production.
