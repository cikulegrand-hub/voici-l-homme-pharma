# Module 5 — CLI : plan de réalisation et bilan de conformité

## État de conformité : 100% Réalisé et Validé

Toutes les exigences du cahier des charges (CDC section 4 Module F) et du prompt ont été implémentées et validées.

### 1. Fondations de données, typage et compilation
- Typage Multer configuré dans `apps/backend/src/types/multer.d.ts` et option dépréciée retirée du `tsconfig.json`.
- Signature de `getCustomerById` adaptée pour être interopérable avec `sales.service.ts`.
- Compilation Backend (`nest build`) : **Succès (0 erreur)**.
- Compilation Frontend (`ng build`) et typage (`tsc --noEmit`) : **Succès (0 erreur)**.

### 2. API Backend (CLI-01 à CLI-06, CLI-10, RG-13, RG-16, RG-17, SEC-04, REC-07)
- **Fiche client** : types `PARTICULIER`, `ENTREPRISE`, `ASSURANCE`, plafond de crédit, calcul dynamique côté serveur du solde dû déduisant les règlements des ventes à crédit.
- **Règlement de créance FIFO** : session de caisse ouverte requise, clé d'idempotence unique (RG-16), ventilation FIFO sur les factures impayées les plus anciennes, mise à jour des soldes et génération de référence de reçu (`RCL-YYYY-...`).
- **Ordonnances sécurisées & stockage privé** :
  - Validation de type MIME binaire (JPEG, PNG, WebP) et taille max 8 Mo.
  - Nommage UUID non devinable dans le bucket privé Supabase.
  - Pas d'URL publique renvoyée : génération sur demande d'un lien temporaire signé avec date d'expiration.
  - Contrôle strict par rôle : un caissier ne peut pas consulter les ordonnances enregistrées par un tiers (`403 Forbidden`).
  - Journalisation systématique dans la table d'audit (`CONSULTATION_IMAGE_ORDONNANCE`) avec identité de l'utilisateur et horodatage.
- **Mention de confidentialité (CLI-10)** : endpoint dédié `GET /customers/privacy-notice` branché sur les paramètres de l'officine.

### 3. Frontend Angular (Composants et Vues)
- **Liste et Recherche** : filtrage temps réel par nom, code ou téléphone et par type de client avec solde dû.
- **Fiche client avec 5 onglets complets** :
  1. `informations` : profil complet, contact, entreprise, plafond de crédit, solde dû, notes médicales / allergies (CLI-07).
  2. `achats` : historique des factures avec part à crédit.
  3. `paiements` : historique des règlements + formulaire d'encaissement avec **imputation FIFO visible** en direct + modale de **ticket de reçu** avec impression.
  4. `releve` : relevé officiel de compte avec synthèse financière, ventilation débits/crédits et impression.
  5. `ordonnances` : liste des ordonnances, formulaire d'ajout avec capture tablette (`capture="environment"`), bouton d'aperçu temporaire à la demande avec compte à rebours et alerte d'expiration.
- **Création rapide de client (`QuickCustomerFormComponent`)** : composant réutilisable modal affichant la mention de confidentialité (CLI-10) et intégré à la vente au comptoir POS.
- **Sélecteur d'ordonnance (`PrescriptionSelectorComponent`)** : composant réutilisable conforme VTE-15, intégré à l'écran de caisse POS dès qu'un produit soumis à ordonnance (RG-09) est ajouté au panier.

### 4. Tests et Recette
- **Tests Backend E2E (`05_customers.e2e.js`)** :
  - Accès refusé HTTP 403 pour un caissier tiers (REC-07, RG-17).
  - Consultation journalisée dans la table `audit_logs` (SEC-04).
  - Structure et durée de validité du lien signé temporaire.
  - Règlement partiel avec imputation FIFO puis règlement du solde jusqu'à 0 CDF.
  - Respect de l'idempotence (RG-16) sans double encaissement.
  - Contrôle du plafond de crédit avec refus immédiat HTTP 400 en cas de dépassement (RG-13).
  - Résultat : **Code de sortie 0 (Toutes les assertions validées)**.
- **Tests Frontend (`customers.component.spec.ts`)** :
  - Chargement de la liste et de la mention de confidentialité.
  - Sélection de client et chargement du relevé.
  - Encaissement avec imputation FIFO et ticket de reçu.
  - Formulaire et téléversement privé d'ordonnance.
  - Aperçu temporaire avec compte à rebours et expiration.
  - Gestion des erreurs et refus d'accès.
