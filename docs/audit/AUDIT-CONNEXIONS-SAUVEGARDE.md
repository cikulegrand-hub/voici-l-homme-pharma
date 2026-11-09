# Audit de conformité — Historique des connexions et sauvegarde/restauration

Référence : VHP-CDC-001, cahier des charges lu dans `docs/CAHIER_DES_CHARGES.md` (section AUT, SEC, AUD, PAR, DON, DISP, REC). Date de l’audit : 4 novembre 2026. Audit statique et essais non destructifs uniquement.

## 1. Résumé (10 lignes)

Verdict global : **non conforme pour une mise en production pharmaceutique** ; l’authentification possède des contrôles partiels, mais l’historique n’est pas une preuve durable complète et la restauration n’existe pas.
Pourcentage strict : **0 % (0 exigence conforme / 18 exigences évaluées)** ; chaque exigence doit avoir base, service, API, permission serveur, écran et test.
Le build backend (`npm.cmd run build --workspace=@vhp/backend`) et frontend (`npm.cmd run build --workspace=@vhp/frontend`) réussissent ; le lint frontend réussit.
`prisma migrate status` indique **9 migrations non appliquées**, dont le durcissement d’audit ; l’état réel de la base ne peut donc pas être déclaré conforme.
Risque bloquant 1 : aucune route ni service de restauration, aucune confirmation, mode maintenance ou test d’intégrité.
Risque bloquant 2 : la sauvegarde crée un JSON en mémoire puis ne persiste que des métadonnées dans `settings`; aucune copie hors base, aucun chiffrement ou stockage vérifiable.
Risque majeur 3 : l’historique de connexion de secours est un tableau mémoire et perd les événements au redémarrage ; l’agent utilisateur n’est pas transmis à `audit_logs`.
Risque majeur 4 : refresh tokens et jetons d’accès sont des chaînes prévisibles sans signature/expiration persistée ni révocation démontrée.
Risque majeur 5 : aucune planification quotidienne, alerte d’échec, conservation, procédure trimestrielle, RPO 24 h ou RTO 4 h n’est démontrée.

## 2. Cadrage et cartographie

| Exigence | Priorité CDC | Interprétation vérifiée |
|---|---:|---|
| AUT-07 | M/MVP | Historique date, utilisateur, appareil, résultat. |
| AUT-02 | M/MVP | Mot de passe ≥10 caractères, verrouillage après 5 échecs. |
| AUT-03 | M/MVP | Jeton court, renouvellement, déconnexion après inactivité. |
| SEC-02 | M/MVP | RBAC côté serveur sur chaque requête. |
| SEC-03 | M/MVP | Limitation active sur la connexion. |
| AUD-01..05 | M/MVP/S | Journal sensible complet, champs avant/après, immuabilité, recherche, export. |
| PAR-08 | S/MVP | Sauvegarde/restauration administrables et historique. |
| DON-01 | — | Sauvegarde quotidienne chiffrée, restauration trimestriellement testée. |
| DISP-02 | — | RPO maximal 24 h. |
| REC-08 | — | Restauration dans le RTO. |
| SEC-01 | — | Aucun secret dans code/config versionnée. |
| SEC-04 | — | Chiffrement au repos des données de santé. |
| Habilitations | — | Admin paramètre; pharmacien/comptable lecture audit. |

Structure observée : `apps/backend` NestJS/Prisma, `apps/frontend` Angular 18, `apps/backend/prisma` et migrations, `database/migrations` SQL historique, `apps/backend/test` E2E, `packages/shared`. Aucun Dockerfile, compose, workflow CI, script `pg_dump` ou script de restauration trouvé par recherche (`rg -n -i "pg_dump|supabase|backup|restore|cron|schedule"`). `ScheduleModule` est importé dans [app.module.ts](../../apps/backend/src/app.module.ts:3), mais aucune tâche de sauvegarde n’a été trouvée.

## 3. Matrice de conformité

| Exigence | Statut | Preuve | Commentaire |
|---|---|---|---|
| AUT-07 | PARTIEL | [schema.prisma](../../apps/backend/prisma/schema.prisma:11), [auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:858), [auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:902) | Champs SQL présents, mais les événements sont aussi en mémoire; `user_agent` n’est jamais écrit par `AuditService`; seulement 100 lignes, pas de filtre/pagination sur l’API login-history; aucun test dédié trouvé. |
| AUT-02 | PARTIEL | [auth.dto.ts](../../apps/backend/src/modules/auth/dto/auth.dto.ts:15), [auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:288) | Validation ≥10 et verrou 15 min après 5 échecs. Le message varie entre identifiant inconnu, compte désactivé et mauvais mot de passe; pas de test de compteur concurrent. |
| AUT-03 | PARTIEL | [jwt-auth.guard.ts](../../apps/backend/src/modules/auth/guards/jwt-auth.guard.ts:11), [auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:398), [inactivity.service.ts](../../apps/frontend/src/app/core/auth/inactivity.service.ts:33) | Expiration locale 15 min et watcher frontend 15 min. Refresh prévisible, pas de validation d’expiration/révocation du refresh token, et la déconnexion d’inactivité n’est pas journalisée comme telle. |
| SEC-02 | PARTIEL | [roles.guard.ts](../../apps/backend/src/modules/auth/guards/roles.guard.ts:22), [audit.controller.ts](../../apps/backend/src/modules/audit/audit.controller.ts:11) | Guards explicites sur plusieurs contrôleurs, mais aucune preuve automatisée que chaque route est protégée; plusieurs GET settings sont publics ([settings.controller.ts](../../apps/backend/src/modules/settings/settings.controller.ts:31)). |
| SEC-03 | PARTIEL | [auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:181) | Limitation IP en mémoire, 30/min, effectivement appelée par `login` ([auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:214)); non distribuée entre instances, sans test trouvé. |
| AUD-01 | PARTIEL | [audit.service.ts](../../apps/backend/src/modules/audit/audit.service.ts:11), [auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:350) | Connexions et certaines actions sont journalisées, mais le fallback mémoire masque une erreur d’écriture et les chemins exacts (inactivité, refresh refusé) ne sont pas tous journalisés. |
| AUD-02 | PARTIEL | [schema.prisma](../../apps/backend/prisma/schema.prisma:14), [audit.service.ts](../../apps/backend/src/modules/audit/audit.service.ts:28) | Utilisateur/date/action/objet/avant/après existent. `user_agent` reste absent des écritures et les valeurs peuvent contenir des données sensibles non filtrées. |
| AUD-03 | PARTIEL | [migration.sql](../../apps/backend/prisma/migrations/20261102200000_notifications_and_audit_hardening/migration.sql:38), [audit.controller.ts](../../apps/backend/src/modules/audit/audit.controller.ts:17) | Trigger et REVOKE sont prévus, aucune route UPDATE/DELETE. Mais la migration est non appliquée selon `prisma migrate status`; preuve de protection réelle de la base absente. |
| AUD-04 | PARTIEL | [audit.service.ts](../../apps/backend/src/modules/audit/audit.service.ts:74), [audit.controller.ts](../../apps/backend/src/modules/audit/audit.controller.ts:17) | Filtres date/utilisateur/action, pagination et tri descendant côté service. Écran audit ne propose que action/entité ([audit.component.ts](../../apps/frontend/src/app/features/audit/audit.component.ts:23)); aucun test d’accès non autorisé exécuté. |
| AUD-05 | PARTIEL | [audit.service.ts](../../apps/backend/src/modules/audit/audit.service.ts:147), [audit.component.ts](../../apps/frontend/src/app/features/audit/audit.component.ts:64) | Export CSV présent; pas de preuve de couverture complète, limites à 1000 et pas de test d’export. |
| PAR-08 | ABSENT | [settings.service.ts](../../apps/backend/src/modules/settings/settings.service.ts:528), [settings.controller.ts](../../apps/backend/src/modules/settings/settings.controller.ts:148) | Déclenchement et historique existent, mais aucune restauration et le “fichier” n’est jamais écrit. |
| DON-01 | ABSENT | Recherche `rg` : aucun `pg_dump`, cron, stockage objet, chiffrement ou procédure trimestrielle | Non vérifiable côté Supabase hébergeur depuis le dépôt; à confirmer dans le tableau de bord Supabase et la politique de rétention. |
| DISP-02 | NON VÉRIFIÉ | Aucun planification/monitoring trouvé | RPO 24 h non démontrable; aucune métrique ou alerte. |
| REC-08 | ABSENT | Aucun endpoint `restore` trouvé; [settings.controller.ts](../../apps/backend/src/modules/settings/settings.controller.ts:148) s’arrête à GET/POST backups | Aucun flux de restauration, intégrité post-restore ou mesure RTO. |
| SEC-01 | ABSENT | [.env.example](../../apps/backend/.env.example:20) | Secrets JWT par défaut en clair dans le fichier d’exemple versionné; `.env` est ignoré mais sa valeur réelle n’a pas été lue. |
| SEC-04 | NON VÉRIFIÉ | [prescription-storage.service.ts](../../apps/backend/src/modules/customers/prescription-storage.service.ts:1) (service de stockage; configuration hors dépôt) | Le dépôt ne prouve pas le chiffrement au repos Supabase des images de santé; vérifier bucket privé, clés et paramètres Supabase. |
| Habilitations | PARTIEL | [audit.controller.ts](../../apps/backend/src/modules/audit/audit.controller.ts:11), [settings.controller.ts](../../apps/backend/src/modules/settings/settings.controller.ts:150) | Audit serveur ADMIN/PHARMACIEN/COMPTABLE. Les sauvegardes utilisent `parametres.modifier`, mais aucune preuve que cette permission exclut toujours pharmacien; l’écran est lié à cette permission ([app.routes.ts](../../apps/frontend/src/app/app.routes.ts:170)). |

## 4. Inventaire des endpoints audités

Préfixe global : `/api/v1` ([main.ts](../../apps/backend/src/main.ts:24)).

| Route | Méthode | Rôle/permission requis | Contrôle réellement observé | Protégé serveur |
|---|---|---|---|---|
| `/auth/login` | POST | Public | `AuthService.checkRateLimit`, validation DTO, verrouillage | Non (normal pour login) |
| `/auth/refresh` | POST | Public | Aucun guard; format prévisible, utilisateur actif seulement | Non |
| `/auth/logout` | POST | JWT | `JwtAuthGuard`; pas de `RolesGuard` | Oui, authentification |
| `/auth/login-history` | GET | `admin.audit` | JWT + RolesGuard + permission | Oui |
| `/audit/logs` | GET | ADMIN/PHARMACIEN/COMPTABLE | JWT + RolesGuard + rôle de classe | Oui |
| `/audit/export` | GET | ADMIN/PHARMACIEN/COMPTABLE | Même guards de classe | Oui |
| `/settings/backups` | POST | `parametres.modifier` | JWT + RolesGuard + permission | Oui |
| `/settings/backups` | GET | `parametres.modifier` | JWT + RolesGuard + permission | Oui |
| `/settings/*` GET | GET | Aucune dans le code | Méthodes publiques ([settings.controller.ts](../../apps/backend/src/modules/settings/settings.controller.ts:31)) | Non |
| `/settings/restore` | — | Admin attendu CDC | Route absente | Non applicable |

## 5. Inventaire technique et traçage bout en bout

### A. Historique des connexions

- Base : `audit_logs` contient `user_id`, action, valeurs JSON, IP, user-agent, timestamp ([schema.prisma](../../apps/backend/prisma/schema.prisma:11)); `users` contient compteurs de verrouillage ([schema.prisma](../../apps/backend/prisma/schema.prisma:547)). Il n’existe pas de table dédiée `login_history`.
- Service : `login` journalise succès/échecs/verrouillage ([auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:233)); `recordLoginAttempt` stocke l’agent et le motif uniquement dans `loginHistory` ([auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:902)).
- API : `/auth/login-history` renvoie la base si elle contient des lignes, sinon le tableau mémoire ([auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:858)). Pas de pagination/filtres serveur.
- Permission : `admin.audit` est contrôlée côté serveur ([auth.controller.ts](../../apps/backend/src/modules/auth/auth.controller.ts:166)); l’écran Angular est également guardé ([app.routes.ts](../../apps/frontend/src/app/app.routes.ts:206)).
- Écran : filtres utilisateur/résultat, appareil, motif et état vide/erreur ([login-history.component.ts](../../apps/frontend/src/app/features/auth/login-history.component.ts:44)); pas d’export et pas de filtre date.
- Test : les suites E2E contiennent des scénarios de login ([01_auth.e2e.js](../../apps/backend/test/e2e/01_auth.e2e.js:22)), mais `npm.cmd run test:jest` a renvoyé **No tests found** et aucun test ciblé n’a été exécuté dans cet audit.

### B. Sauvegarde/restauration

- Mécanisme : collecte partielle de sept ensembles de tables puis `JSON.stringify` ([settings.service.ts](../../apps/backend/src/modules/settings/settings.service.ts:534)); ce n’est ni `pg_dump` ni une copie complète du schéma.
- Stockage : seul `backup_history` est écrit dans la table `settings` ([settings.service.ts](../../apps/backend/src/modules/settings/settings.service.ts:592); le payload n’est pas écrit dans un fichier/bucket).
- Manuel/historique : POST/GET protégés et écran Angular présents ([settings.controller.ts](../../apps/backend/src/modules/settings/settings.controller.ts:150), [backups.component.ts](../../apps/frontend/src/app/features/settings/backups.component.ts:42)). L’historique est aussi chargé en mémoire au démarrage ([settings.service.ts](../../apps/backend/src/modules/settings/settings.service.ts:83)).
- Planification : `ScheduleModule` est importé, mais aucune méthode `@Cron`/workflow de sauvegarde trouvé. Échec, alerte, checksum, durée et rétention ne sont pas implémentés dans le dépôt.
- Restauration : aucun endpoint, service ou écran de restauration; la mention `restore` dans l’écran est seulement une icône ([backups.component.ts](../../apps/frontend/src/app/features/settings/backups.component.ts:89)).
- Fichiers de santé : aucune sauvegarde du bucket privé d’ordonnances n’est incluse dans `backupPayload` ([settings.service.ts](../../apps/backend/src/modules/settings/settings.service.ts:551)).

## 6. Écarts et risques

### BLOQUANT

1. **Restauration absente.** Preuve : aucun endpoint/service `restore`, contrôleur limité à POST/GET backup ([settings.controller.ts](../../apps/backend/src/modules/settings/settings.controller.ts:148)). Risque : impossibilité de reprendre après corruption/ransomware; correction : concevoir restore versionné, confirmation forte, sauvegarde préalable, maintenance, validation et audit; effort 24–40 h.
2. **Sauvegarde non durable et non hors base.** Preuve : payload sérialisé puis seul l’historique est persisté ([settings.service.ts](../../apps/backend/src/modules/settings/settings.service.ts:569)). Risque : perte simultanée de données et “backup”; correction : `pg_dump` compatible, bucket privé chiffré hors base, checksum, rétention 3-2-1; effort 24–40 h.
3. **RPO/RTO non démontrables.** Preuve : aucune tâche quotidienne, alerte ou test trimestriel trouvé. Risque : dépassement de 24 h/4 h sans détection; correction : ordonnanceur externe, monitoring et exercices chronométrés; effort 16–24 h.

### MAJEUR

1. **Historique non fiable après redémarrage.** Preuve : fallback `loginHistory` mémoire ([auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:44)); user-agent non écrit par `AuditService` ([audit.service.ts](../../apps/backend/src/modules/audit/audit.service.ts:12)). Risque : enquête de sécurité incomplète; effort 12–20 h.
2. **Migrations de durcissement non appliquées.** Preuve : sortie `prisma migrate status` : 9 migrations en attente, dont `20261102200000_notifications_and_audit_hardening`. Risque : schéma réel sans trigger/colonnes attendus; effort 4–8 h (après validation environnement).
3. **Refresh token falsifiable/prévisible.** Preuve : parsing de `jwt_refresh_<userId>_<timestamp>` sans vérification d’expiration ou stockage ([auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:398)). Risque : prolongation de session par construction de token; effort 12–20 h.
4. **Fuite d’information lors du login.** Preuve : messages distincts pour identifiant inconnu, compte désactivé et mauvais mot de passe ([auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:233)). Risque : énumération des comptes; effort 2–4 h.

### MINEUR

1. **Écran audit incomplet.** Preuve : filtres action/entité uniquement ([audit.component.ts](../../apps/frontend/src/app/features/audit/audit.component.ts:23)). Risque : recherche opérationnelle lente; effort 4–8 h.
2. **Historique backup incomplet.** Preuve : `BackupDto` ne contient pas checksum, durée, emplacement ni taille persistée du fichier ([settings.service.ts](../../apps/backend/src/modules/settings/settings.service.ts:573)). Risque : impossibilité de vérifier une copie; effort 4–8 h.

## 7. Sécurité

- Contournement potentiel : les GET génériques de settings sont sans guards ([settings.controller.ts](../../apps/backend/src/modules/settings/settings.controller.ts:31)); l’API d’écriture audit n’existe pas, mais l’application ne garantit pas à elle seule les privilèges DB tant que la migration n’est pas appliquée.
- Fuite d’information : messages de login différenciés ([auth.service.ts](../../apps/backend/src/modules/auth/auth.service.ts:245)); `.env.example` contient des secrets JWT par défaut ([.env.example](../../apps/backend/.env.example:20)).
- Journaux modifiables : trigger/REVOKE prévus ([migration.sql](../../apps/backend/prisma/migrations/20261102200000_notifications_and_audit_hardening/migration.sql:40)), mais statut réel non vérifié car migration en attente.
- Données sensibles : le fallback d’audit retourne les valeurs sans blocage ([audit.service.ts](../../apps/backend/src/modules/audit/audit.service.ts:56)); aucune preuve de chiffrement applicatif ou stockage au repos des ordonnances.
- Aucun mot de passe/jeton n’est explicitement écrit par `recordLoginAttempt`, mais les objets `newValues` sont génériques : une règle de filtrage centralisée et un test anti-secret manquent.

## 8. Tests et commandes exécutés

| Commande | Résultat exact |
|---|---|
| `npx.cmd prisma migrate status --schema prisma/schema.prisma` | Échec de conformité : 17 migrations trouvées, 9 non appliquées (liste dans la sortie Prisma). Aucune migration lancée. |
| `npm.cmd run build --workspace=@vhp/backend` | **Code 0**, compilation NestJS réussie. |
| `npm.cmd run build --workspace=@vhp/frontend` | **Code 0**, bundle Angular généré. Node v25.6.1 a émis un avertissement de version impaire non-LTS. |
| `npm.cmd run lint` (frontend) | **Code 0**, `tsc --noEmit`. |
| `npm.cmd run test:jest` (backend) | **Code 0**, `No tests found, exiting with code 0`. |
| Recherche E2E | Des scénarios auth/audit existent dans `apps/backend/test/e2e`, mais non exécutés ici pour ne pas provoquer d’écritures sur la base configurée. |

Tests manquants proposés : login-history persistant après redémarrage; motifs des cinq échecs et verrouillage; identifiant inconnu vs mot de passe; refresh expiré/révoqué; test serveur d’un caissier sur audit; trigger UPDATE/DELETE; sauvegarde vérifiant fichier/chiffrement/checksum; restauration sur base éphémère avec migration actuelle; exercice RPO/RTO chronométré; copie du bucket d’ordonnances.

## 9. Comparaison aux bonnes pratiques

- **OWASP ASVS authentification** : utiliser des JWT signés ou sessions opaques avec expiration, rotation et révocation du refresh; réponse d’échec uniforme; rate limiting distribué; journalisation sans secret; tests d’autorisation négatifs. Le code actuel satisfait seulement partiellement longueur/verrouillage/rate limit.
- **Règle 3-2-1** : au moins trois copies, deux supports distincts, une hors site; chiffrement, clé séparée, rétention et restauration vérifiée. Le dépôt ne montre actuellement aucune copie de payload.
- **Tests de restauration réguliers** : procédure écrite, environnement isolé, checksum, validation de schéma/données et mesure RTO; exercice au moins trimestriel requis par le CDC, absent du dépôt.

## 10. Plan de correction ordonné

1. Bloquer la mise en production; inventorier les migrations et valider la cible Supabase sans les appliquer automatiquement depuis cet audit.
2. Implémenter un vrai backup complet (base + objets privés), stockage hors base chiffré, checksum, rétention et alertes.
3. Implémenter la restauration sécurisée et testée sur environnement éphémère, puis documenter l’exercice trimestriel et mesurer RPO/RTO.
4. Rendre l’audit persistant et complet (user-agent, UTC, motifs, logout/inactivité/refresh refusé), supprimer le fallback silencieux ou l’alerter fortement, appliquer trigger/REVOKE réellement.
5. Remplacer le mécanisme de refresh prévisible par des tokens signés/rotatifs et révocables; uniformiser les erreurs de login.
6. Vérifier toutes les routes avec un test de matrice RBAC serveur; protéger les GET settings si leur contenu n’est pas public.
7. Compléter les écrans/filtres/export et ajouter les tests automatisés des six maillons.

## 11. Questions ouvertes au propriétaire

1. Les 9 migrations en attente sont-elles volontairement absentes de la base Supabase ciblée, ou l’environnement de connexion est-il incorrect ?
2. Où Supabase conserve-t-il les sauvegardes gérées, quelle rétention, quel chiffrement et quelle preuve de restauration trimestrielle sont contractuellement disponibles ?
3. Quel bucket contient les images d’ordonnances, et sa réplication/sauvegarde hors site est-elle activée ?
4. Le rôle pharmacien doit-il pouvoir déclencher une sauvegarde, ou strictement l’administrateur comme le précise la matrice ?
5. Quel est le délai d’inactivité paramétrable de référence et doit-il être appliqué côté serveur, pas seulement dans Angular ?
6. Existe-t-il un environnement de restauration isolé où mesurer officiellement RPO 24 h et RTO 4 h ?

