# Module 8 — RPT : plan d’implémentation et écarts initiaux

## 1. Périmètre validé

Ce plan couvre RPT-01 à RPT-10, PERF-03, ERG-02, UC-06 et REC-06. RPT-11
(envoi périodique par courriel) reste hors MVP conformément au cahier des
charges.

Principes non négociables :

- tous les calculs financiers restent côté serveur en `Decimal`/SQL ;
- un indicateur et son rapport détaillé appellent le même service de données
  (aucune logique métier dupliquée) ;
- chaque carte expose un lien et les paramètres exacts du rapport source ;
- les montants sont calculés par devise et ne sont convertis qu’avec le taux
  figé de la vente lorsque cela est requis ;
- l’écran, la pagination et les exports consomment le même résultat serveur.

## 2. Comparaison de l’existant

| Exigence | État constaté | Écart à corriger |
|---|---|---|
| RPT-01 à RPT-06 | `GET /reports/dashboard` renvoie CA global, panier CDF, alertes, dépenses et une rentabilité partielle. | Aucun découpage période/devise, pas de comparaison jour/semaine/mois, marge/taux de marge/rotation/rupture/créances/écart de caisse incomplets ou absents. |
| RPT-07 | Aucun DTO de filtres RPT commun. | Ajouter période, utilisateur, catégorie, site et bornes validées côté serveur. |
| RPT-08 | Seulement `/reports/sales` et `/reports/stock-alerts`; ventes chargées via `listSales()` puis filtrées en mémoire. | Ajouter les 10 familles de rapports, totaux serveur, tri/pagination et agrégations SQL. |
| RPT-09 | Aucun endpoint ou service d’export. | Ajouter PDF, Excel et CSV côté serveur, à partir du même query service que l’écran. |
| RPT-10 / REC-06 | `getSalesDetailedReport()` appelle le dashboard puis recharge les ventes ; les deux contrats ne partagent pas une requête canonique. | Introduire des query services de rapport réutilisés par dashboard, détail et export, puis test de concordance au centime. |
| PERF-03 / PERF-04 | Dashboard lit les ventes et plusieurs services en séquence ; certaines valorisations itèrent en TypeScript. | Agrégations SQL, index ciblés, requêtes parallélisées, cache court optionnel et benchmark à 500 000 lignes. |
| Multi-devise | `sales` conserve taux et totaux CDF/USD, mais le dashboard reconvertit tout avec le taux actif courant. | Utiliser les montants/taux historiques de chaque vente et produire des totaux séparés par devise. |
| CUMP | `sale_items.unit_cost_cump_cdf` et `products.cump_cdf` existent ; la valorisation stock repose encore sur une boucle applicative et un taux USD codé en dur dans le service stock. | Centraliser la valorisation SQL et supprimer les valeurs par défaut codées en dur du périmètre RPT. |
| Permissions | La route `/reports` exige `rapports.consulter`; le rôle caissier n’a pas ce droit dans l’initialisation observée, et le rôle `STOCK` n’est pas traité comme gestionnaire RPT. | Définir les scopes dashboard/rapport/export par rôle et appliquer le contrôle sur chaque endpoint, pas seulement dans Angular. |
| Frontend dashboard | Le dashboard affiche taux, caisse, rôle et raccourcis, sans indicateurs RPT ni filtres. | Construire cartes progressives, variations, graphiques, états vides et liens vers rapports avec filtres conservés. |
| Frontend rapports | `ReportsComponent` est un placeholder statique. | Construire catalogue de rapports, tableau paginé/triable, filtres communs, totaux et exports. |
| Tests | Aucun test RPT ciblé de navigation ou de concordance dashboard/détail. | Ajouter tests backend d’intégration/REC-06 et test Angular de navigation avec query params conservés. |

## 3. Découpage technique prévu

### Phase 1 — Contrat et socle de données

1. Créer les DTO `ReportFilterDto`, pagination, tri, devise et période,
   avec validation stricte et normalisation des dates.
2. Créer un registre typé des rapports RPT-08 : journal des ventes avec état
   payé/impayé/partiel, mouvements de stock, inventaire valorisé, péremptions,
   dettes/créances, dépenses, performance vendeur, meilleures ventes, faible
   rotation, entrées/sorties stock et trésorerie par devise.
3. Définir les structures `ReportResult`, `ReportTotals`, `DashboardMetric`
   et `ReportLink` afin que chaque indicateur transporte `reportKey` et les
   filtres sérialisables.
4. Ajouter les index PostgreSQL nécessaires sur `(pharmacy_id, created_at)`,
   `(pharmacy_id, user_id, created_at)`, les catégories, mouvements, lots,
   créances et sessions de caisse après vérification des plans SQL.

### Phase 2 — Query services canoniques backend

1. Introduire un `ReportsQueryService` injectant Prisma, responsable des
   agrégations SQL et des lignes détaillées.
2. Implémenter une méthode canonique par rapport, réutilisée telle quelle par
   l’écran dashboard, le détail et l’export.
3. Calculer par devise : CA net (ventes validées moins avoirs), panier moyen,
   marge brute, taux de marge, stock valorisé par lot×CUMP, rotation, rupture,
   proche péremption à 90 jours, balance âgée et écart de caisse.
4. Ajouter la période précédente correspondante (jour/semaine/mois) et la
   variation uniquement à partir des résultats serveur.
5. Utiliser les lignes de vente et leurs `unit_cost_cump_cdf` historiques
   pour la marge ; utiliser `products.cump_cdf` et les quantités de lots pour
   la valeur du stock courant.
6. Retourner explicitement `data: []`, `totals` à zéro et `isEmpty: true` pour
   une période sans données.

### Phase 3 — API, permissions et exports

1. Remplacer les routes actuelles par des routes versionnées et filtrables :
   `GET /reports/dashboard`, `GET /reports/:reportKey`,
   `GET /reports/:reportKey/export`.
2. Conserver une compatibilité contrôlée pour `/reports/sales` et
   `/reports/stock-alerts` si des clients existants les utilisent.
3. Appliquer les permissions serveur : accès complet admin/pharmacien/
   comptable ; vue limitée caissier/gestionnaire selon le registre de scopes.
4. Générer CSV, Excel et PDF depuis le même `ReportResult` filtré ; ne pas
   recalculer les montants dans les adaptateurs d’export.
5. Auditer les exports et limiter les rapports contenant des données clients
   aux permissions correspondantes.

### Phase 4 — Frontend Angular

1. Ajouter `ReportsApiService` et les modèles RPT dans le client partagé.
2. Remplacer [dashboard.component.ts](../apps/frontend/src/app/features/dashboard/dashboard.component.ts)
   par des cartes RPT chargées progressivement avec squelettes, variation,
   devise, état vide et lien vers le rapport canonique.
3. Ajouter une barre de filtres commune, synchronisée avec les query params,
   et la réutiliser sur dashboard et détail.
4. Ajouter au dashboard le graphique des ventes sur la période et le graphique
   des meilleures ventes ; leurs données proviennent de rapports canoniques et
   aucun calcul métier n’est effectué dans le composant.
5. Construire [reports.component.ts](../apps/frontend/src/app/features/reports/reports.component.ts)
   avec catalogue, tableau serveur, tri, pagination, totaux et trois boutons
   d’export.
6. Adapter l’affichage tablette et masquer les cartes/rapports non autorisés
   sans déplacer la décision de permission hors du backend.
7. Limiter le frontend au formatage, à la navigation et à l’état de chargement.

### Phase 5 — Recette et performance

1. Préparer un jeu mixte avec ventes validées, avoirs, multi-devises, taux
   historiques, CUMP variable, stock, créances, dépenses et écarts de caisse.
2. Tester que chaque valeur du dashboard est égale au total du rapport
   correspondant, au centime près, sans arrondi intermédiaire divergent.
3. Tester les filtres, permissions, période vide, pagination et exports.
4. Mesurer le dashboard et les rapports sur 500 000 lignes de vente ; relever
   p95, requêtes exécutées, plans SQL et taille de réponse. Optimiser avant
   d’introduire une vue matérialisée ou un cache court.
5. Tester Angular : clic sur chaque carte, route et query params identiques au
   rapport ouvert.

## 4. Contrat indicateur → rapport

Chaque carte doit retourner une forme équivalente à :

```ts
{
  key: 'revenue',
  valuesByCurrency: { CDF: { value: 0, previousValue: 0, variationPercent: 0 } },
  reportLink: { reportKey: 'sales-journal', params: { from, to, userId, categoryId, siteId } }
}
```

Le `reportKey` est résolu par le même registre serveur que l’endpoint détaillé.
Le frontend ne connaît aucune formule et ne fait que formater `value`,
`variationPercent` et les devises.

## 5. Exigences et preuves attendues

| ID | Preuve d’implémentation |
|---|---|
| RPT-01..06 | Query services SQL, réponses par devise, variations et liens détaillés. |
| RPT-07 | DTO de filtres partagé et tests de filtrage/pagination. |
| RPT-08 | Registre des rapports, endpoints détaillés, colonnes et totaux serveur. |
| RPT-09 | Adaptateurs PDF/XLSX/CSV alimentés par le même résultat filtré. |
| RPT-10 | Test structurel et test REC-06 prouvant l’absence de divergence dashboard/détail. |
| PERF-03 | Benchmark p95 inférieur à 3 s sur le jeu volumineux défini par PERF-04. |
| ERG-02 | Test/validation visuelle tablette et écran 1366×768. |
| UC-06 | Parcours filtre → carte → rapport → export. |
| REC-06 | Comparaison exhaustive des chiffres, devise par devise, au centime près. |

## 6. Vérification explicite prompt + CDC

La vérification croisée confirme que le plan couvre les éléments suivants :

| Source | Couverture dans le plan |
|---|---|
| Prompt backend — RPT-01..10 | Sections 1 à 5 : dashboard, rapports détaillés, filtres, exports, permissions et concordance. |
| Prompt backend — indicateurs par devise | Phase 2.3 : CA net, panier moyen, marge, taux de marge, stock CUMP, rotation, rupture, péremption 90 jours, créances âgées et écart de caisse. |
| Prompt backend — comparaison période précédente | Phase 2.4 : jour/semaine/mois avec variation serveur. |
| Prompt backend — pagination et agrégations SQL | Phases 1.1/1.4 et 2.1, plus benchmark Phase 5. |
| Prompt backend — test mixte REC-06 | Phase 5.1/5.2 : avoirs, multi-devises, CUMP variable et comparaison exhaustive au centime. |
| Prompt frontend — cartes, filtres, squelettes et états vides | Phase 4.2/4.3 et 2.6. |
| Prompt frontend — graphiques ventes et meilleures ventes | Phase 4.4, ajoutée explicitement au plan. |
| Prompt frontend — clic carte → rapport avec filtres conservés | Contrat indicateur→rapport et test Phase 5.5. |
| Prompt frontend — rapports paginés/triables et exports | Phase 3.1/3.4 et Phase 4.5. |
| Prompt frontend — aucun calcul métier | Principes directeurs et Phase 4.4/4.7. |
| CDC RPT-01..RPT-10 | Matrice de preuves Section 5 et registre détaillé Phase 1.2. |
| CDC section 10 | Phase 2.3 couvre les 10 indicateurs et la valeur proche péremption sous 90 jours. |
| CDC PERF-03/PERF-04 | Phase 5.4 : mesure p95 < 3 s sur 500 000 lignes. |
| CDC REC-06 | Phase 5.2 et preuve RPT-10. |

La visibilité minimale prévue est : dashboard et rapports complets pour
`ADMIN`, `PHARMACIEN` et `COMPTABLE`; sous-ensemble explicitement autorisé
pour `CAISSIER` et `STOCK` (gestionnaire). Le registre de scopes sera défini
avant les contrôleurs et testé côté API ; l’interface ne servira qu’à masquer
les éléments déjà refusés par le serveur.

## 7. Ordre d’exécution

Le développement devra suivre strictement :

1. Phase 1 et validation du contrat ;
2. Phase 2 et test backend REC-06 sur petit jeu ;
3. Phase 3 API/permissions/exports ;
4. Phase 4 Angular et test de navigation ;
5. Phase 5 benchmark et recette complète.

Le code ne doit commencer qu’après validation de ce plan et de deux décisions
de cadrage : la liste exacte des cartes visibles pour le rôle gestionnaire et
la bibliothèque PDF/XLSX autorisée dans le projet.
