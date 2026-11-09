# Audit approfondi — Module « Journal d’Audit & Sécurité »

Date de l’audit : 2026-11-07  
Périmètre : frontend Angular, backend NestJS, API REST, Prisma/PostgreSQL, intégration avec les modules métier et tests disponibles.

## 1. Résumé exécutif

Le module existe réellement et couvre une partie importante du besoin fonctionnel : consultation protégée, filtrage de base, pagination backend, export CSV, journalisation transverse et protection SQL contre UPDATE/DELETE. Les builds frontend et backend passent.

Il ne doit toutefois pas encore être considéré comme un journal d’audit réglementaire complet. Les principales faiblesses sont :

- la perte silencieuse d’un événement lorsque l’écriture en base échoue, remplacée par un faux succès en mémoire ;
- des appels de journalisation souvent non attendus (`await` absent), donc non fiables lors d’un arrêt ou d’une transaction échouée ;
- une interface qui n’expose qu’une fraction des filtres et des informations disponibles dans l’API ;
- un contrat de réponse incohérent entre tableau legacy et objet paginé ;
- un export limité à 1 000 lignes, non streamé, avec risque d’injection de formules CSV ;
- l’exposition possible d’un hash de PIN dans `newValues` lors de la modification d’un utilisateur ;
- l’absence de preuve automatisée couvrant l’ensemble des actions sensibles et la qualité UX du module.

Conclusion : bon socle MVP et protections structurelles intéressantes, mais durcissement nécessaire avant de qualifier le module d’inaltérable, exhaustif et exploitable pour un contrôle d’audit.

## 2. État de validation observé

| Contrôle | Résultat | Evidence / limite |
|---|---|---|
| TypeScript frontend | Réussi | `npm.cmd run lint --workspace=@vhp/frontend` |
| Build backend NestJS | Réussi | `npm.cmd run build --workspace=@vhp/backend` |
| Build Angular | Réussi | `npm.cmd run build --workspace=@vhp/frontend` |
| Tests unitaires dédiés au composant Audit | Non identifiés | Aucun `audit.component.spec.ts` visible dans le module |
| Tests E2E audit | Présents | [08_audit_and_notifications.e2e.js](../../apps/backend/test/e2e/08_audit_and_notifications.e2e.js), [07_reports_audit_settings.e2e.js](../../apps/backend/test/e2e/07_reports_audit_settings.e2e.js) |
| Exécution E2E durant cet audit | Non réalisée | Elle requiert une base PostgreSQL et un serveur configurés ; aucune conclusion de fonctionnement runtime n’est tirée de l’absence d’exécution |
| Dépendances de travail | Préexistantes | Le dépôt était déjà fortement modifié ; aucun changement métier existant n’a été écrasé |

## 3. Conformité au cahier des charges

Les exigences sont définies dans [CAHIER_DES_CHARGES.md](../CAHIER_DES_CHARGES.md), section AUD.

| Exigence | État | Analyse |
|---|---|---|
| AUD-01 — journaliser les actions sensibles | Partiel | Les appels couvrent authentification, ventes, stock, caisse, catalogue, clients/ordonnances, fournisseurs et paramètres. L’exhaustivité n’est pas démontrée par une matrice d’événements ni par un test de couverture. |
| AUD-02 — utilisateur, date, action, objet, avant/après | Partiel | Le modèle possède ces champs principaux. `user_agent` existe en base mais n’est pas alimenté par `AuditService`; certaines actions ne renseignent pas les valeurs avant/après. |
| AUD-03 — non modifiable/non supprimable | Bon côté base/API | Trigger PostgreSQL et absence de routes POST/PATCH/DELETE dédiées. La robustesse dépend de l’application de toutes les migrations et des privilèges réels du compte DB. |
| AUD-04 — recherche par date, utilisateur, action | Partiel | Backend disponible ; frontend ne propose actuellement que `action` et `entityName`, sans date ni utilisateur. |
| AUD-05 — export pour inspection | Partiel | CSV fonctionnel par conception, mais pas Excel malgré la documentation, limité à 1 000 lignes et sans mécanisme de gros volume. |

## 4. Architecture et flux

### 4.1 Frontend

Le point d’entrée est [audit.component.ts](../../apps/frontend/src/app/features/audit/audit.component.ts). Il est chargé en lazy route depuis [app.routes.ts](../../apps/frontend/src/app/app.routes.ts) et protégé par la permission `audit.consulter`.

Le composant délègue les appels à [audit-api.service.ts](../../apps/frontend/src/app/core/api/services/audit-api.service.ts), qui utilise le client HTTP partagé. L’affichage repose sur [data-table.component.ts](../../apps/frontend/src/app/shared/components/data-table/data-table.component.ts), avec tri et pagination locale.

Flux actuel :

1. ouverture de `/audit` ;
2. contrôle frontend de `audit.consulter` ;
3. appel `GET /audit/logs?page=1&limit=100` ;
4. insertion des données dans la table générique ;
5. export via `GET /audit/export`.

Le frontend ne transmet pas les changements de page au backend : la pagination affichée est donc locale sur le premier lot de 100 entrées. Pour un historique volumineux, les pages au-delà de la première ne sont jamais chargées.

### 4.2 Backend et API

Le contrôleur est [audit.controller.ts](../../apps/backend/src/modules/audit/audit.controller.ts) et le service est [audit.service.ts](../../apps/backend/src/modules/audit/audit.service.ts). Les routes exposées sont :

- `GET /api/v1/audit/logs` ;
- `GET /api/v1/audit/export`.

Les routes sont protégées par `JwtAuthGuard` et `RolesGuard`, avec autorisation de classe pour `ADMIN`, `PHARMACIEN` et `COMPTABLE`. Le périmètre pharmacie vient de `req.user.pharmacyId`, ce qui est une bonne protection applicative contre la lecture inter-pharmacies.

Le client partagé et OpenAPI déclarent bien les filtres `action`, `userId`, `entityName`, `from`, `to`, `page`, `limit`, mais le composant UI n’en utilise qu’une partie.

### 4.3 Base de données

Le modèle Prisma `audit_logs` est défini dans [schema.prisma](../../apps/backend/prisma/schema.prisma). Il contient : identifiant UUID, pharmacie, utilisateur, action, entité, identifiant d’entité, valeurs avant/après en JSONB, IP, user-agent et horodatage.

Les index existants sur `(pharmacy_id, created_at DESC)` et `(entity_name, entity_id)` sont adaptés à la consultation chronologique et à la recherche par objet. Les migrations d’intégrité installent un trigger empêchant UPDATE/DELETE et révoquent ces droits pour `PUBLIC`.

Point à contrôler en exploitation : le schéma Prisma marque la relation utilisateur en `ON DELETE RESTRICT`, alors que la migration initiale utilisait `SET NULL`. Les migrations finales doivent être appliquées dans le bon ordre et vérifiées sur la base réellement utilisée.

## 5. Ce qui fonctionne bien

### UI/UX

- Le module est accessible depuis la navigation principale et protégé par permission.
- Le tableau est responsive horizontalement et possède un état vide réutilisable.
- Le tri et la pagination locale sont fournis par le composant table partagé.
- Le téléchargement CSV est directement accessible depuis la page.
- Le libellé métier et la séparation “journal d’audit / sécurité” sont compréhensibles.

### Backend/API

- La séparation contrôleur/service/module est claire et conforme au style NestJS du projet.
- La lecture est filtrée par `pharmacyId` issu de l’utilisateur authentifié, sans accepter un `pharmacyId` venant du client.
- La pagination backend borne la taille de page à 200.
- Les filtres d’action sont insensibles à la casse.
- Les événements d’ordonnance, notamment la consultation et la génération de lien signé, sont journalisés dans le module clients.
- Les tests E2E vérifient l’absence de routes de modification, la lecture, le filtrage, l’export et un cas RBAC caissier.

### Base et sécurité

- L’immutabilité est défendue au niveau PostgreSQL, pas uniquement dans l’interface.
- Les contraintes de clé étrangère et l’index par pharmacie/chronologie supportent la traçabilité et la conservation des références utilisateur.
- Le modèle permet de conserver le contexte avant/après en JSONB, ce qui est utile pour les changements métier variés.

## 6. Dysfonctionnements, lacunes et risques

### Criticité élevée

#### 6.1 Fausse réussite lorsque la journalisation échoue

Dans [audit.service.ts](../../apps/backend/src/modules/audit/audit.service.ts), `logAction` intercepte toute erreur d’écriture et retourne une entrée synthétique `aud-${Date.now()}` en mémoire. Cette entrée n’existe pas dans PostgreSQL et disparaît avec le processus.

Conséquence : le code métier peut croire que l’action est auditée alors qu’elle ne l’est pas. C’est incompatible avec l’affirmation “journal inaltérable et exhaustif”.

Recommandation : journaliser l’échec dans un mécanisme durable séparé, exposer un statut explicite, et définir par action si l’échec d’audit doit bloquer l’opération. Pour les ventes, changements de droits, ajustements de stock, annulations et accès aux ordonnances, le choix recommandé est une transaction ou une stratégie outbox durable, jamais un fallback mémoire silencieux.

#### 6.2 Journalisation non atomique et appels non attendus

De nombreux appelants utilisent `this.auditService.logAction(...)` sans `await`. Une requête peut donc répondre ou échouer avant la fin de l’écriture. Une transaction métier peut également être annulée alors que l’audit, lancé en dehors de cette transaction, reste présent.

Recommandation : introduire une API transactionnelle explicite (`auditInTransaction`) ou une outbox, définir la relation entre succès métier et succès audit, et rendre les appels critiques attendus. Ajouter un identifiant de corrélation et un identifiant de requête.

#### 6.3 Secret sensible écrit dans les valeurs d’audit

Dans [auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts), `updateUser` construit `updateData` avec `pin_code_hash` lorsque le PIN est changé, puis transmet `updateData` dans `newValues`. Un hash de PIN ne doit pas être copié dans un journal largement consultable ou exportable.

Recommandation immédiate : appliquer une fonction centrale de masquage avant toute écriture (`password`, `password_hash`, `pin`, `pin_code_hash`, tokens, secrets, clés). Pour les changements de PIN/mot de passe, conserver seulement `changed: true`, l’acteur, la cible et l’heure.

#### 6.4 Contrat de réponse incohérent

Le contrôleur renvoie un objet paginé lorsque `page` ou `limit` sont présents, mais un tableau auquel sont ajoutées des propriétés (`total`, `page`, etc.) lorsqu’ils sont absents. Cette compatibilité legacy complique les clients et le typage OpenAPI.

Recommandation : choisir une enveloppe unique `{ data, total, page, limit, totalPages }`, versionner si nécessaire, puis aligner les tests, OpenAPI et le frontend sur ce contrat.

### Criticité moyenne

#### 6.5 Frontend incomplet par rapport à l’API

La page propose seulement les champs `Action` et `Entité`. Manquent :

- filtre de date `from/to` ;
- sélection/recherche d’utilisateur ;
- pagination serveur avec total ;
- affichage ou panneau de détail de `entityId`, `oldValues`, `newValues` ;
- états loading, erreur, retry et export en cours ;
- confirmation ou notification de téléchargement réussi/échoué.

Le tableau affiche l’IP, mais pas l’objet exact ni les changements avant/après, ce qui limite fortement sa valeur pour une inspection.

#### 6.6 Export non adapté à l’audit de gros volume

`exportLogsToCsv` appelle une recherche plafonnée à 1 000 entrées. Il n’y a ni streaming, ni indication à l’utilisateur que le résultat est tronqué, ni export asynchrone pour une période longue. La documentation parle de CSV/Excel alors que l’implémentation produit uniquement du CSV.

Recommandation : exporter selon les filtres avec un job/streaming, retourner le nombre exporté et le nombre total, imposer une période maximale ou demander confirmation pour les volumes importants, et documenter précisément le format.

#### 6.7 Risque d’injection de formule CSV

Les champs sont échappés pour les guillemets, mais pas neutralisés lorsqu’ils commencent par `=`, `+`, `-` ou `@`. Un nom d’action, d’entité ou une valeur JSON contrôlée peut devenir une formule à l’ouverture dans Excel/LibreOffice.

Recommandation : préfixer les cellules potentiellement dangereuses par une apostrophe ou appliquer une politique d’export sûre, et tester les champs `action`, `entityName`, `entityId`, utilisateur et valeurs JSON.

#### 6.8 Validation des filtres trop permissive

Un `userId` mal formé est ignoré au lieu de produire une erreur de validation ; des dates invalides sont également ignorées. L’utilisateur peut donc croire qu’une recherche est appliquée alors que la requête retourne un périmètre plus large.

Recommandation : DTO dédié avec `IsUUID`, validation ISO-8601, borne `from <= to`, maximum de période et message d’erreur explicite.

#### 6.9 Autorisation backend trop coarse-grained

Le frontend utilise `audit.consulter`, tandis que le backend autorise la classe par rôle. Une modification des permissions en base peut donc ne pas être reflétée par l’API : un rôle autorisé par la classe peut lire l’audit même si sa permission fine est retirée.

Recommandation : utiliser `@RequirePermission('audit.consulter')` côté backend comme source d’autorité, et réserver les rôles à des règles complémentaires si nécessaire. Ajouter des tests par permission, pas seulement par rôle.

#### 6.10 Contexte incomplet et absence de métadonnées de requête

`login` reçoit `userAgent`, mais le flux de création du log ne le transmet pas au service et le champ `user_agent` reste donc inexploité. Il manque aussi un request/correlation ID, l’origine de la requête et éventuellement le résultat (`SUCCESS`, `FAILURE`, `DENIED`) comme champs normalisés.

Recommandation : enrichir le contrat d’audit avec `requestId`, `userAgent`, résultat, cause contrôlée et version de schéma.

### Criticité UX et qualité

#### 6.11 Encodage des textes dégradé

Plusieurs textes visibles du composant apparaissent sous forme `SÃ©curitÃ©`, `EntitÃ©`, etc. Cela dégrade directement la confiance dans un écran de contrôle et doit être corrigé en normalisant l’encodage UTF-8 du fichier et de la chaîne de build.

#### 6.12 Erreurs réseau masquées

Le `subscribe` du composant ne gère que le succès. Une panne API se traduit vraisemblablement par une table vide et le message “Aucun événement”, ce qui est trompeur.

Recommandation : distinguer explicitement `loading`, `error`, `empty` et `ready`, avec bouton “Réessayer” et message de permission/connexion adapté.

#### 6.13 Accessibilité et ergonomie insuffisantes

Les champs sont des `<input>` sans label associé, les boutons ne signalent pas l’état de chargement, les filtres ne sont pas regroupés dans une structure de formulaire accessible, et l’export ne donne pas de retour visuel. La consultation de détails n’est pas possible au clavier puisqu’aucune ligne n’est interactive.

## 7. Couverture des événements sensibles

La présence d’appels `logAction` a été trouvée dans `auth`, `cash`, `catalog`, `customers`, `sales`, `settings`, `stock` et `suppliers`. C’est un bon niveau de diffusion architecturale.

Cependant, la présence d’un appel n’est pas une preuve de couverture :

- aucun catalogue central des événements attendus n’a été trouvé ;
- aucune vérification automatique ne compare les routes/actions sensibles aux actions journalisées ;
- les chemins d’erreur et les refus d’autorisation ne sont pas systématiquement auditables ;
- les appels asynchrones non attendus rendent la couverture théorique différente de la couverture durable ;
- le contexte IP n’est pas propagé aux appels métier génériques, notamment pour les accès aux ordonnances.

À instituer : un registre d’événements versionné, par exemple `AUTH.LOGIN_FAILED`, `SALE.CREATED`, `SALE.CANCELLED`, `STOCK.ADJUSTED`, `PRICE.CHANGED`, `PRESCRIPTION.VIEWED`, `PERMISSION.CHANGED`, avec acteur, cible, résultat, contexte, sensibilité et politique d’échec.

## 8. Recommandations priorisées

### P0 — avant qualification production

1. Supprimer le fallback mémoire silencieux et définir une garantie durable d’écriture.
2. Masquer centralement les hashes de PIN, mots de passe, tokens et secrets avant persistance/export.
3. Corriger le contrat de réponse pour ne garder qu’un format paginé stable.
4. Protéger l’export contre l’injection CSV et signaler toute troncature.
5. Vérifier sur une base réelle que les triggers, contraintes et privilèges des migrations finales sont actifs.

### P1 — prochain incrément fonctionnel

1. Refaire l’écran avec filtres date/utilisateur/action/entité et pagination serveur.
2. Ajouter un panneau de détail avant/après, identifiant d’objet, IP, résultat et contexte.
3. Ajouter états loading/error/retry/export et tests unitaires du composant.
4. Remplacer l’autorisation backend par la permission fine `audit.consulter`.
5. Ajouter DTO de filtres et validation stricte.
6. Ajouter `userAgent`, `requestId` et résultat de l’action au contrat et à la base.

### P2 — robustesse et exploitation

1. Passer à un export streamé ou asynchrone pour les historiques longs.
2. Ajouter rétention, partitionnement éventuel par date/pharmacie, supervision et alerte sur échec d’écriture.
3. Ajouter tests de non-régression sur chaque événement sensible et chaque rôle/permission.
4. Prévoir une vue d’inspection avec timezone explicite, période, fuseau de l’officine et horodatage UTC.
5. Produire un rapport d’intégrité périodique : volume attendu, trous d’horodatage, échecs d’outbox, export signé si exigence réglementaire.

## 9. Plan de test recommandé

### Tests API et sécurité

- lecture avec chacun des rôles et permissions ;
- tentative inter-pharmacie avec token d’une autre officine ;
- `page`, `limit`, dates, UUID et filtres invalides ;
- ordre stable sur deux événements de même timestamp ;
- trigger UPDATE/DELETE et privilèges d’un compte DB applicatif ;
- export vide, export > 1 000 lignes, caractères accentués, guillemets et formules CSV ;
- panne PostgreSQL pendant une action critique ;
- redémarrage après mise en file d’un audit ;
- absence de mot de passe, hash PIN ou token dans les JSON d’audit.

### Tests frontend

- affichage loading/error/empty/ready ;
- application et reset de chaque filtre ;
- changement de page déclenchant une requête serveur ;
- affichage détaillé d’un événement ;
- téléchargement avec filtres, succès et erreur ;
- navigation refusée sans `audit.consulter` ;
- clavier, lecteur d’écran, contrastes et responsive mobile.

## 10. Décision d’architecture proposée

Conserver le module comme service d’audit transversal, mais faire évoluer sa responsabilité :

```text
Action métier
   -> contexte d’audit normalisé
   -> transaction métier + outbox audit durable
   -> worker d’écriture audit_logs
   -> audit_logs immutable PostgreSQL
   -> API paginée stable
   -> UI de recherche et inspection
```

La base doit rester la dernière barrière d’immutabilité. L’application ne doit jamais présenter un événement non persistant comme enregistré. Pour les opérations critiques, la décision métier doit être explicite : “l’action est-elle refusée si l’audit ne peut pas être durablement accepté ?”.

## 11. Conclusion

Le module est fonctionnel au niveau du squelette et compilable, avec de bonnes fondations de séparation, de filtrage par pharmacie et d’immutabilité SQL. Son état actuel est adapté à une démonstration MVP et à des tests d’intégration ciblés.

Il reste insuffisant pour une garantie d’audit forte tant que la perte silencieuse, les secrets dans les snapshots, l’absence d’atomicité, l’export borné et l’écart entre UI et API ne sont pas corrigés. La priorité doit être la fiabilité et la confidentialité des preuves, puis l’amélioration de l’écran d’inspection et de l’exploitabilité des historiques.

## 12. Correctifs appliqués dans cette itération

Les corrections suivantes ont été implémentées après cet audit :

- contrat `GET /audit/logs` unifié en enveloppe paginée ;
- permission fine `audit.consulter` appliquée côté backend ;
- DTO de filtres avec validation UUID, dates, page et limite ;
- fallback mémoire supprimé : une écriture non persistée n’est plus présentée comme un audit réussi ;
- masquage récursif des mots de passe, PIN, tokens, secrets et clés dans les snapshots ;
- prise en charge du `user_agent` à la persistance et dans l’export ;
- export CSV sans plafond artificiel et neutralisation des formules CSV ;
- tri stable par date puis identifiant ;
- écran frontend enrichi avec filtres date/utilisateur, pagination serveur, détail avant/après, gestion d’erreur et retour d’export ;
- builds backend, lint frontend et build frontend vérifiés après correction.

Les points nécessitant encore une validation d’environnement restent les migrations/privilèges PostgreSQL réels et l’exécution E2E avec une base active. Les appels métier d’audit sont maintenant attendus ; une outbox transactionnelle reste recommandée pour résister à une panne de base sans coupler toutes les transactions métier.
