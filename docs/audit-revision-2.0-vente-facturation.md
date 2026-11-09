# Audit d’écart et Rapport de Réalisation — Révision 2.0 Vente, Facturation et Caisse

Date : 4 novembre 2026  
Références : `prompte a donner a l'agent AI pour travailler la revision 2.0.docx` et `VHP-CDC-001-Revision-2.0-Module-Vente-Facturation.docx`

---

## 1. Décisions d’arbitrage validées par l'utilisateur

1. **Ventes Hors-ligne et Devises** :
   - Espèces autorisées en **CDF et USD**.
   - Mobile Money, Carte bancaire, Virement, Crédit client et Remises non autorisées strictement **bloqués hors-ligne**.
   - Taux de change local utilisé pour affichage indicatif ; taux serveur validé et historisé lors de la synchronisation avec calcul et traçabilité d'écart.
   - Clé d'idempotence unique obligatoire, date/heure locale, utilisateur et statut `EN_ATTENTE`.

2. **Expiration des Paniers en Attente** :
   - Durée de rétention par défaut : **24 heures**.
   - Rattaché au vendeur propriétaire créateur.
   - Annulation et libération automatique à la clôture de la session de caisse du vendeur.
   - Marquage `EXPIRE` dans l'historique sans suppression physique.
   - Reprise par un autre vendeur soumise à habilitation administrateur ou pharmacien responsable.

3. **Résolution des Conflits Hors-ligne** :
   - En cas d'indisponibilité physique du stock lors de la synchronisation : marquage immédiat en statut `CONFLIT`.
   - **Aucun stock négatif**, aucune suppression automatique, aucune validation aveugle.
   - Arbitrage manuel obligatoire réservé au **Pharmacien Responsable** avec traçabilité d'audit intégrale.
   - 5 actions d'arbitrage offertes : `VALIDER_PARTIEL`, `ANNULER_VENTE`, `REMPLACER_PRODUIT`, `GENERER_AVOIR`, `MAINTENIR_EN_ATTENTE`.

---

## 2. État d’avancement des Réalisations (Étapes 1 à 5)

| Étape | Statut | Détails des implémentations |
|---|:---:|---|
| **Étape 1 — Socle & Contrats** | **RÉALISÉ** | Migration Prisma `20261103200000_v2_sales_offline_and_held_carts` ; Types `SaleStatus`, `SyncStatus`, `HeldCart`, `OfflineConflictDetails`, `ConflictResolutionAction` ; Catalogue centralisé d'erreurs guidées `POS_ERROR_MESSAGES` et raccourcis `POS_SHORTCUTS`. |
| **Étape 2 — POS & Raccourcis** | **RÉALISÉ** | Raccourcis [F1] à [F10] + [Échap] opérationnels et normalisés ; Badge réseau permanent (En ligne / Hors-ligne / Synchronisation) ; Recherche tolérante avec autocomplétion stock/prix/badges ordonnance ; Modale F7 Stock & Lots FEFO ; Modale F5 Ordonnances ; Modale F4 Création client ; Modale F3 Remises plafonnées ; Modale F10 Paniers ; Découplage SCSS complet. |
| **Étape 3 — Encaissement & Documents** | **RÉALISÉ** | Validation obligatoire des références de transaction pour Carte bancaire et Virement ; Ventilation fiscale officielle (Base taxable TVA 16%, TVA collectée, Exonéré, TTC) ; Mentions d'officine conformes RDC (RCCM, NIF, ID.NAT, Pharmacien) ; Affichage bidevise CDF/USD avec taux officiel ; Filigrane sécurisé DUPLICATA avec traçabilité audit ; Endpoints HTML prêts à l'impression thermique 80 mm et A4. |
| **Étape 4 — Retours & Avoirs** | **RÉALISÉ** | Recherche multi-critères des factures (N° facture, Nom client, Téléphone, plage de dates, statut) ; Parcours de retour en 3 étapes avec sélection des lignes partielles/totales, motif obligatoire et choix de réintégration au stock (`RETOUR_CLIENT` vs `CASSE_PERTE`) ; Contre-passation financière rigoureuse ; Workflow de demandes d'annulation transmises par les caissiers. |
| **Étape 5 — Hors-ligne & Conflits** | **RÉALISÉ** | Service client `OfflineSyncService` sur IndexedDB avec détection réseau en temps réel et auto-synchronisation ; API `POST /sales/sync` avec détection automatique des conflits de stock et journalisation des écarts de taux ; Module d'arbitrage pour le Pharmacien Responsable avec écran dédié, détails des écarts et enregistrement motivé. |

---

## 3. Santé du Projet et Intégrité du Code

- **Build monorepo** : `npm run build --workspaces` -> **Code de sortie 0 (Succès total sur les 3 workspaces)** :
  - `@vhp/backend` (NestJS) : compilation TypeScript réussie sans erreur.
  - `@vhp/frontend` (Angular 18) : bundles client générés avec succès.
  - `@vhp/shared` : contrats partagés compilés.
- **Préservation de l'existant** : Toutes les règles de gestion antérieures (FEFO strict, plafonds de remise par rôle, clôture de session de caisse, RLS, audit trail) sont intégralement préservées et consolidées.
