# Audit de complétude — Module 8 RPT

Références : [plan RPT](./module-8-rpt-plan.md) et [CDC](./CAHIER_DES_CHARGES.md), sections RPT-01 à RPT-10, PERF-03 et REC-06.

## Conformité fonctionnelle

| Exigence | Preuve / implémentation | Statut |
|---|---|---|
| RPT-01..06 | Dashboard serveur multi-devises : CA net, panier moyen, marge, taux de marge, rotation, stock, rupture, péremption, créances, écart de caisse | Implémenté |
| Comparaison précédente | Périodes jour/semaine/mois, période précédente et variation pour les indicateurs calculables | Implémenté |
| RPT-08 | 11 familles : ventes, mouvements, inventaire, péremptions, créances, dépenses, vendeurs, meilleures ventes, faible rotation, entrées/sorties, trésorerie | Implémenté |
| RPT-09 | Exports serveur CSV, Excel `.xlsx` et PDF, avec données filtrées du rapport | Implémenté |
| RPT-10 | Liens dashboard vers le rapport justificatif avec paramètres ; totaux calculés sur l’ensemble filtré | Implémenté |
| Filtres communs | Période, utilisateur, catégorie, site ; le site est contrôlé par rapport à la pharmacie courante | Implémenté |
| Pagination / tri | Pagination serveur et tri serveur exposés sur la page rapport | Implémenté |
| Permissions | Admin/pharmacien/comptable complets ; caissier et stock/gestionnaire limités aux cartes et rapports autorisés | Implémenté |
| REC-06 | Test de concordance au centime avec ventes, avoirs, multi-devises et CUMP variable | Test ciblé réussi |

## Frontend

- Dashboard avec cartes, variations, graphiques ventes/meilleures ventes, squelettes de chargement, filtres et liens conservant les paramètres.
- Page rapports avec les 11 rapports, filtres, tri, pagination, message vide et exports.
- Test ciblé de conservation des filtres et catalogue : 2/2 réussi.
- Aucun calcul métier ajouté au frontend ; uniquement formatage et affichage.

## Vérifications exécutées

- Build backend : réussi.
- Build frontend : réussi ; avertissements de budget préexistants sur POS/clients uniquement.
- `test:rpt` : réussi — `REC-06 PASS`.
- Tests RPT Angular ciblés : 2/2 réussis.
- Suite frontend complète : 67/67 réussis après correction des mocks Stock (`PermissionService.getAllPermissions` et `MatDialog`).

## Limites de preuve restantes

1. PERF-03 (< 3 secondes sur 500 000 ventes) nécessite une base PostgreSQL réelle, Docker n’étant pas démarré dans l’environnement actuel.
2. Le test d’intégration API réel avec authentification, permissions et données persistées n’a pas pu être exécuté sans base active.
3. La concordance REC-06 est prouvée par le test ciblé ; la recette volumétrique complète reste à exécuter avec le dataset du CDC.

Ces limites concernent la preuve d’exécution, pas l’absence de routes, services, écrans ou contrats RPT.
