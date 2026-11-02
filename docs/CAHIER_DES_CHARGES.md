CAHIER DES CHARGES

Système de gestion d'officine – « Voici l'Homme Pharma »

Fiche du document

|  |

Référence

| VHP-CDC-001

|

Version

| 1.0 – Projet soumis à validation

|

Date

| 28 octobre 2026

|

Maître d'ouvrage

| Pharmacie Voici l'Homme Pharma, Kinshasa (RDC) – représentant : [à compléter]

|

Maître d'œuvre

| [nom de l'architecte / société – à compléter]

|

Rédacteur

| Architecte logiciel – [à compléter]

|

Diffusion

| Confidentielle : maître d'ouvrage et équipe projet

|

Ce cahier des charges suit la structure des bonnes pratiques d'ingénierie des exigences (ISO/IEC/IEEE 29148, plan IEEE 830) : chaque exigence a un identifiant unique, une priorité MoSCoW (M = Doit, S = Devrait, C = Pourrait) et une version cible (MVP ou V2). Il n'a pas de valeur contractuelle tant qu'il n'est pas signé par les deux parties (voir section 14).

Historique des versions

Version

| Date

| Auteur

| Modification

|

0.1

| Oct. 2026

| Architecte

| Première trame fonctionnelle

|

1.0

| 28 oct. 2026

| Architecte

| Version complète pour validation

|

Sommaire

Introduction · 2. Description générale · 3. Acteurs et habilitations · 4. Exigences fonctionnelles par module · 5. Règles de gestion · 6. Exigences non fonctionnelles · 7. Interfaces et exigences techniques · 8. Modèle de données de haut niveau · 9. Cas d'utilisation · 10. Indicateurs du tableau de bord · 11. Recette et critères d'acceptation · 12. Livrables, planning, formation, maintenance · 13. Gouvernance et risques · 14. Validation · Annexes

1. Introduction

1.1 Objet

Ce document définit les besoins fonctionnels, non fonctionnels et techniques d'une application web de gestion d'officine couvrant le stock (entrées et sorties), la vente et la facturation, la gestion financière et le pilotage par tableau de bord.

1.2 Contexte

La pharmacie Voici l'Homme Pharma souhaite remplacer ses registres papier par un système informatisé fiable. Un prototype d'interface existe (React, données fictives, sans persistance) ; il sert de maquette de référence mais n'est pas réutilisé comme base technique.

1.3 Objectifs

ID

| Objectif

| Indicateur de réussite

|

OBJ-1

| Tracer chaque mouvement de médicament par lot et par date de péremption

| 100 % des sorties rattachées à un lot

|

OBJ-2

| Accélérer le passage en caisse

| Vente complète en moins d'une minute

|

OBJ-3

| Éliminer ruptures et pertes par péremption

| Alertes actives, pertes mesurées mensuellement

|

OBJ-4

| Sécuriser l'argent et les opérations sensibles

| Aucune modification de facture validée ; audit complet

|

OBJ-5

| Donner une vision financière fiable au propriétaire

| Tableau de bord cohérent avec les rapports détaillés

|

1.4 Périmètre

Inclus : authentification et droits, catalogue, stock, achats et fournisseurs, ventes et facturation, clients et ordonnances, caisse et finances, tableau de bord et rapports, audit, paramétrage, import de données initiales, sauvegardes.

Exclus de la V1 : télétransmission aux assureurs, e-commerce et livraison, comptabilité générale complète, paie, intégration aux systèmes de l'autorité de régulation, application mobile native.

1.5 Glossaire

Terme

| Définition

|

DCI

| Dénomination commune internationale (molécule)

|

FEFO

| First Expired, First Out : on vend d'abord le lot qui périme en premier

|

CUMP

| Coût unitaire moyen pondéré (valorisation du stock)

|

BC

| Bon de commande fournisseur

|

POS

| Point de vente (écran de caisse)

|

RBAC

| Contrôle d'accès par rôles

|

Lot

| Quantité d'un produit partageant un numéro et une date de péremption

|

Avoir

| Document qui annule tout ou partie d'une facture validée

|

MVP

| Produit minimal viable, première version livrée

|

RPO / RTO

| Perte de données maximale tolérée / durée maximale d'interruption tolérée

|

1.6 Références

Réglementation pharmaceutique, fiscale et de protection des données de santé applicable en RDC [références exactes à fournir et confirmer par le maître d'ouvrage]. Dossier d'audit technique du prototype (octobre 2026). Document d'architecture cible Angular / NestJS / PostgreSQL.

2. Description générale

2.1 Vision

Un système unique, accessible par navigateur sur poste fixe et tablette, où chaque produit entré, vendu, perdu ou ajusté laisse une trace infalsifiable, et où le propriétaire voit en temps réel stock, ventes et trésorerie.

2.2 Contraintes

Techniques : frontend Angular, backend NestJS, base PostgreSQL hébergée sur Supabase, API REST, déploiement conteneurisé.

Environnement : connectivité et alimentation électrique possiblement instables (onduleur et procédure de secours requis).

Réglementaires : conformité locale pharmaceutique, fiscale et données de santé, à confirmer.

Calendrier : MVP rapide (voir section 12).

2.3 Hypothèses à valider

Devises gérées : CDF et USD .

Une seule officine en V1, modèle de données prêt pour plusieurs sites.

Matériel disponible : poste ou tablette, douchette code-barres, imprimante de tickets 80 mm.

Le taux de change est saisi manuellement par un utilisateur habilité.

Les données de départ (catalogue, stock) sont fournies sous forme de fichier Excel.

2.4 Dépendances

Compte Supabase, nom de domaine et certificat HTTPS, matériel de caisse, disponibilité du personnel pour ateliers et formation.

3. Acteurs et habilitations

Acteur

| Rôle dans le système

|

Administrateur / Propriétaire

| Paramétrage, utilisateurs, finances, tous rapports

|

Pharmacien responsable

| Validation des ajustements, ordonnances, retours, produits contrôlés, prix

|

Caissier / Vendeur

| Ventes, encaissements, consultation du stock

|

Gestionnaire de stock

| Réceptions, inventaires, mouvements, commandes

|

Comptable (optionnel)

| Consultation finances, dépenses, exports

|

Système (tâches planifiées)

| Alertes, sauvegardes, calculs périodiques

|

Matrice d'habilitations (O = autorisé, L = lecture seule, – = interdit)

Fonction

| Admin

| Pharmacien

| Caissier

| Stock

| Comptable

|

Utilisateurs et paramètres

| O

| –

| –

| –

| –

|

Catalogue (création/modification)

| O

| O

| L

| O

| L

|

Modifier un prix de vente

| O

| O

| –

| –

| –

|

Vendre / encaisser

| O

| O

| O

| –

| –

|

Remise au-delà du plafond

| O

| O

| –

| –

| –

|

Annuler une vente / émettre un avoir

| O

| O

| demande

| –

| –

|

Réceptionner une commande

| O

| O

| –

| O

| –

|

Ajuster le stock

| O

| valide

| –

| demande

| –

|

Inventaire

| O

| valide

| –

| O

| L

|

Ordonnances et notes médicales

| O

| O

| O (saisie)

| –

| –

|

Caisse : clôture

| O

| O

| O (sa session)

| –

| L

|

Dépenses

| O

| O

| –

| –

| O

|

Tableau de bord complet

| O

| O

| partiel

| partiel

| O

|

Journal d'audit

| O

| L

| –

| –

| L

|

4. Exigences fonctionnelles par module

Module A – Authentification, utilisateurs et habilitations (AUT)

ID

| Exigence

| Prio

| Vers.

|

AUT-01

| Connexion par identifiant et mot de passe

| M

| MVP

|

AUT-02

| Politique de mot de passe (10 caractères minimum), verrouillage temporaire après 5 échecs

| M

| MVP

|

AUT-03

| Session à jeton d'accès court avec renouvellement ; déconnexion automatique après inactivité paramétrable

| M

| MVP

|

AUT-04

| Création, modification, activation et désactivation d'utilisateurs (aucune suppression physique)

| M

| MVP

|

AUT-05

| Quatre rôles prédéfinis avec permissions fines (ex. vente.annuler, stock.ajuster, prix.modifier)

| M

| MVP

|

AUT-06

| Réinitialisation du mot de passe par un administrateur

| M

| MVP

|

AUT-07

| Historique des connexions (date, utilisateur, appareil, résultat)

| M

| MVP

|

AUT-08

| Code PIN de réautorisation pour actions sensibles (remise, annulation)

| S

| MVP

|

AUT-09

| Rôles personnalisés créés par l'administrateur

| C

| V2

|

AUT-10

| Double authentification pour administrateur et pharmacien

| C

| V2

|

Module B – Catalogue produits (CAT)

ID

| Exigence

| Prio

| Vers.

|

CAT-01

| Fiche produit : nom commercial, DCI, dosage, forme galénique, catégorie, laboratoire, unité de vente, prix de vente, taxe applicable, seuil d'alerte, emplacement

| M

| MVP

|

CAT-02

| Statut réglementaire : sur ordonnance, produit contrôlé (stupéfiant/psychotrope), chaîne du froid

| M

| MVP

|

CAT-03

| Un ou plusieurs codes-barres par produit

| M

| MVP

|

CAT-04

| Catégories et formes galéniques administrables

| M

| MVP

|

CAT-05

| Recherche instantanée par nom, DCI, code-barres, avec tolérance aux fautes de frappe

| M

| MVP

|

CAT-06

| Historique des modifications de prix (qui, quand, ancien et nouveau prix)

| M

| MVP

|

CAT-07

| Import et export Excel/CSV avec contrôle des erreurs et rapport de rejet

| M

| MVP

|

CAT-08

| Désactivation d'un produit sans perdre l'historique

| M

| MVP

|

CAT-09

| Équivalents et génériques (substitution suggérée en cas de rupture)

| S

| V2

|

CAT-10

| Photo du produit

| C

| V2

|

CAT-11

| Seuil maximum et stock de sécurité par produit

| S

| MVP

|

Module C – Gestion du stock : entrées, sorties, inventaire (STK)

ID

| Exigence

| Prio

| Vers.

|

STK-01

| Entrée en stock par réception : produit, numéro de lot, date de péremption, quantité, prix d'achat

| M

| MVP

|

STK-02

| Plusieurs lots simultanés par produit

| M

| MVP

|

STK-03

| Sortie automatique par vente selon la règle FEFO ; une vente peut puiser dans plusieurs lots

| M

| MVP

|

STK-04

| Autres sorties avec motif obligatoire : casse, perte, péremption, don, usage interne

| M

| MVP

|

STK-05

| Ajustement de stock avec motif, soumis à validation du pharmacien

| M

| MVP

|

STK-06

| Journal des mouvements non modifiable (type, lot, quantité, utilisateur, date, pièce liée)

| M

| MVP

|

STK-07

| Stock en temps réel par produit, lot et emplacement

| M

| MVP

|

STK-08

| Alertes de stock bas et de rupture, avec liste de réapprovisionnement

| M

| MVP

|

STK-09

| Alertes de péremption à 30, 60 et 90 jours (seuils paramétrables)

| M

| MVP

|

STK-10

| Blocage automatique de la vente d'un lot périmé ou mis en quarantaine

| M

| MVP

|

STK-11

| Inventaire complet ou tournant : saisie du comptage, calcul des écarts, validation, génération des ajustements

| M

| MVP

|

STK-12

| Valorisation du stock au coût moyen pondéré

| S

| MVP

|

STK-13

| Retrait de lot (rappel sanitaire) : liste des ventes concernées par lot

| S

| V2

|

STK-14

| Registre des produits contrôlés (entrées, sorties, solde)

| S

| MVP

|

STK-15

| Impression d'étiquettes code-barres

| C

| V2

|

STK-16

| Transferts entre sites

| C

| V2

|

Module D – Achats et fournisseurs (ACH)

ID

| Exigence

| Prio

| Vers.

|

ACH-01

| Fiche fournisseur : coordonnées, contact, délais, conditions de paiement

| M

| MVP

|

ACH-02

| Bon de commande avec statuts : brouillon, envoyé, partiellement reçu, reçu, annulé

| S

| MVP

|

ACH-03

| Suggestion de commande à partir des seuils et de la consommation récente

| S

| V2

|

ACH-04

| Réception totale ou partielle liée à un bon de commande, ou réception directe sans commande

| M

| MVP

|

ACH-05

| Enregistrement de la facture fournisseur et rapprochement avec la réception

| S

| V2

|

ACH-06

| Suivi des dettes fournisseurs, échéances et paiements

| S

| V2

|

ACH-07

| Retour fournisseur (produit périmé ou avarié) avec mouvement de stock associé

| S

| V2

|

ACH-08

| Historique des prix d'achat par fournisseur et par produit

| S

| V2

|

ACH-09

| Export du bon de commande en PDF

| C

| MVP

|

Module E – Ventes, facturation et caisse comptoir (VTE)

ID

| Exigence

| Prio

| Vers.

|

VTE-01

| Écran de vente rapide utilisable au clavier et à la douchette

| M

| MVP

|

VTE-02

| Ajout d'article par scan ou recherche ; quantité modifiable

| M

| MVP

|

VTE-03

| Remise par ligne ou globale, plafonnée selon le rôle

| M

| MVP

|

VTE-04

| Sélection automatique du lot FEFO ; changement manuel réservé aux profils habilités

| S

| MVP

|

VTE-05

| Calcul des taxes selon le paramétrage du produit

| M

| MVP

|

VTE-06

| Facturation en CDF ou USD avec taux de change figé sur la facture

| M

| MVP

|

VTE-07

| Paiement unique, multiple ou partiel ; calcul du rendu de monnaie

| M

| MVP

|

VTE-08

| Modes de paiement : espèces, mobile money (avec référence de transaction), carte, virement, crédit client

| M

| MVP

|

VTE-09

| Facture et ticket en PDF et impression thermique 80 mm

| M

| MVP

|

VTE-10

| Numérotation séquentielle sans trou, par officine et par année

| M

| MVP

|

VTE-11

| Mise en attente d'un panier et reprise ultérieure

| S

| MVP

|

VTE-12

| Vente à crédit dans la limite du plafond du client

| S

| MVP

|

VTE-13

| Annulation avec motif et droit spécifique ; une facture validée n'est jamais modifiée

| M

| MVP

|

VTE-14

| Retour client et émission d'un avoir, avec remise en stock conditionnelle

| S

| MVP

|

VTE-15

| Obligation d'associer une ordonnance pour les produits qui l'exigent

| M

| MVP

|

VTE-16

| Réimpression marquée « DUPLICATA »

| M

| MVP

|

VTE-17

| Devis / facture proforma

| S

| V2

|

VTE-18

| Protection contre le double envoi (clé d'idempotence)

| M

| MVP

|

VTE-19

| File d'attente locale des ventes en cas de coupure réseau brève

| S

| V2

|

VTE-20

| Alerte d'interaction ou d'allergie à partir de la fiche client

| C

| V2

|

Module F – Clients et ordonnances (CLI)

ID

| Exigence

| Prio

| Vers.

|

CLI-01

| Fiche client : identité, contact, type (particulier, entreprise, assurance)

| M

| MVP

|

CLI-02

| Historique des achats et des paiements par client

| S

| MVP

|

CLI-03

| Plafond de crédit, solde dû, relevé de compte

| S

| MVP

|

CLI-04

| Encaissement de créances (règlements ultérieurs, partiels possibles)

| S

| MVP

|

CLI-05

| Enregistrement d'ordonnance : prescripteur, établissement, date, image ou photo

| M

| MVP

|

CLI-06

| Stockage privé des images d'ordonnance ; accès par lien temporaire ; chaque consultation journalisée

| M

| MVP

|

CLI-07

| Notes médicales (allergies, intolérances) à accès restreint

| S

| V2

|

CLI-08

| Fusion de fiches en double

| C

| V2

|

CLI-09

| Rappels d'échéance par SMS ou messagerie

| C

| V2

|

CLI-10

| Mention d'information sur la confidentialité des données de santé

| M

| MVP

|

Module G – Caisse et gestion financière (FIN)

ID

| Exigence

| Prio

| Vers.

|

FIN-01

| Ouverture de session de caisse avec fonds de départ, par utilisateur et par devise

| M

| MVP

|

FIN-02

| Clôture de caisse : total attendu, total compté, écart consigné et justifié

| M

| MVP

|

FIN-03

| Enregistrement des dépenses par catégorie (loyer, salaires, électricité, transport, etc.) avec pièce jointe optionnelle

| S

| MVP

|

FIN-04

| Saisie historisée des taux de change CDF/USD par utilisateur habilité (aucune valeur par défaut supposée)

| M

| MVP

|

FIN-05

| Suivi des encaissements par mode de paiement et par devise

| M

| MVP

|

FIN-06

| Suivi des créances clients âgées (0-30, 31-60, plus de 60 jours)

| S

| MVP

|

FIN-07

| Calcul de la marge brute par produit, catégorie et période

| S

| MVP

|

FIN-08

| Résultat estimé sur période : ventes − coût d'achat des produits vendus − dépenses

| S

| MVP

|

FIN-09

| Dettes fournisseurs et échéancier de paiement

| S

| V2

|

FIN-10

| Mouvements de trésorerie (entrées/sorties de caisse hors ventes : apports, retraits, dépôts en banque)

| S

| V2

|

FIN-11

| Export comptable (journal des ventes, encaissements, dépenses)

| C

| V2

|

Module H – Tableau de bord et rapports (RPT)

ID

| Exigence

| Prio

| Vers.

|

RPT-01

| Tableau de bord : chiffre d'affaires du jour, de la semaine, du mois, avec comparaison à la période précédente

| M

| MVP

|

RPT-02

| Entrées et sorties de stock (quantités et valeurs) sur période

| M

| MVP

|

RPT-03

| Meilleures ventes et produits à faible rotation

| M

| MVP

|

RPT-04

| Valeur du stock, produits en rupture, produits proches de la péremption

| M

| MVP

|

RPT-05

| Facturation : factures payées, impayées, partielles ; créances

| M

| MVP

|

RPT-06

| Trésorerie : encaissements, dépenses, solde par devise

| S

| MVP

|

RPT-07

| Filtres par période, utilisateur, catégorie, site

| M

| MVP

|

RPT-08

| Rapports détaillés : journal des ventes, mouvements de stock, inventaire valorisé, péremptions, dettes et créances, dépenses, performance par vendeur

| M

| MVP

|

RPT-09

| Export PDF, Excel et CSV de tous les rapports

| M

| MVP

|

RPT-10

| Cohérence garantie : un chiffre du tableau de bord renvoie au rapport détaillé qui le justifie

| M

| MVP

|

RPT-11

| Envoi périodique d'un résumé par courriel au propriétaire

| C

| V2

|

Module I – Audit et traçabilité (AUD)

ID

| Exigence

| Prio

| Vers.

|

AUD-01

| Journalisation de toute action sensible : connexion, vente, annulation, remise, ajustement de stock, changement de prix, consultation d'ordonnance, changement de droits

| M

| MVP

|

AUD-02

| Chaque entrée conserve l'utilisateur, la date et l'heure, l'action, l'objet concerné, la valeur avant et après

| M

| MVP

|

AUD-03

| Journal non modifiable et non supprimable par l'application

| M

| MVP

|

AUD-04

| Consultation et recherche du journal par date, utilisateur, type d'action

| M

| MVP

|

AUD-05

| Export du journal pour inspection

| S

| MVP

|

Module J – Paramétrage et administration (PAR)

ID

| Exigence

| Prio

| Vers.

|

PAR-01

| Identité de l'officine : nom, logo, adresse, numéros d'identification, mentions légales de facture

| M

| MVP

|

PAR-02

| Devises actives, devise principale, nombre de décimales

| M

| MVP

|

PAR-03

| Taxes et leurs taux

| M

| MVP

|

PAR-04

| Seuils d'alerte de péremption, plafonds de remise par rôle, délai d'inactivité de session

| M

| MVP

|

PAR-05

| Modèles de tickets et de factures (format, pied de page)

| S

| MVP

|

PAR-06

| Gestion des modes de paiement actifs

| S

| MVP

|

PAR-07

| Import initial des données (produits, stock, fournisseurs, clients) avec simulation avant validation

| M

| MVP

|

PAR-08

| Sauvegarde et restauration pilotables par l'administrateur (déclenchement manuel, historique)

| S

| MVP

|

PAR-09

| Multi-officines : cloisonnement des données par site

| C

| V2

|

Module K – Notifications et alertes (NOT)

ID

| Exigence

| Prio

| Vers.

|

NOT-01

| Centre de notifications dans l'application (stock bas, péremption, créances en retard, écart de caisse)

| M

| MVP

|

NOT-02

| Badge de compteur visible sur le tableau de bord

| S

| MVP

|

NOT-03

| Notification par courriel aux responsables

| C

| V2

|

NOT-04

| Notification par SMS ou messagerie

| C

| V2

|

5. Règles de gestion

ID

| Règle

|

RG-01

| FEFO : une sortie de stock consomme d'abord le lot non périmé dont la date de péremption est la plus proche.

|

RG-02

| Le stock d'un lot ne peut jamais être négatif ; une vente supérieure au stock disponible est refusée (sauf autorisation explicite d'un profil habilité, tracée).

|

RG-03

| Un lot dont la date de péremption est dépassée, ou en quarantaine, n'est pas vendable.

|

RG-04

| Une facture validée est immuable. Toute correction passe par une annulation motivée ou un avoir.

|

RG-05

| La numérotation des factures est séquentielle et sans trou, par officine et par exercice.

|

RG-06

| Aucune suppression physique de données comptables, de stock ou d'audit ; on désactive ou on contre-passe.

|

RG-07

| Les calculs de montants sont faits uniquement côté serveur, en décimal, avec une règle d'arrondi unique par devise (paramétrable).

|

RG-08

| Le taux de change utilisé est celui en vigueur au moment de la vente et il est figé sur la facture.

|

RG-09

| Un produit marqué « sur ordonnance » ne peut être vendu sans ordonnance enregistrée.

|

RG-10

| Une remise supérieure au plafond du rôle exige l'autorisation d'un profil habilité.

|

RG-11

| Tout ajustement ou toute perte de stock exige un motif ; l'ajustement est validé par le pharmacien.

|

RG-12

| Une session de caisse doit être clôturée avant l'ouverture d'une nouvelle session par le même utilisateur ; l'écart est obligatoirement consigné.

|

RG-13

| Une vente à crédit est refusée au-delà du plafond du client, sauf autorisation tracée.

|

RG-14

| Valorisation du stock : coût moyen pondéré. Nouveau coût = (valeur du stock + valeur de la réception) ÷ (quantité en stock + quantité reçue).

|

RG-15

| Marge brute = prix de vente hors taxe − coût moyen pondéré au moment de la vente.

|

RG-16

| Une opération en double (même clé d'idempotence) ne produit qu'un seul enregistrement.

|

RG-17

| Les accès aux ordonnances et aux notes médicales sont limités aux rôles autorisés et journalisés.

|

6. Exigences non fonctionnelles

ID

| Catégorie

| Exigence

|

PERF-01

| Performance

| Recherche d'un produit : moins d'une seconde pour 95 % des requêtes

|

PERF-02

| Performance

| Validation d'une vente : moins de 3 secondes pour 95 % des opérations

|

PERF-03

| Performance

| Affichage du tableau de bord : moins de 3 secondes

|

PERF-04

| Capacité

| 15 utilisateurs simultanés, 50 000 références, 500 000 lignes de vente par an, sans dégradation

|

DISP-01

| Disponibilité

| 99 % par mois hors maintenance planifiée

|

DISP-02

| Reprise

| Perte de données maximale 24 h (RPO), reprise en moins de 4 h (RTO)

|

SEC-01

| Sécurité

| Mots de passe hachés (Argon2id), échanges chiffrés (TLS), aucun secret dans le code

|

SEC-02

| Sécurité

| Contrôle d'accès par rôle appliqué côté serveur sur chaque requête

|

SEC-03

| Sécurité

| Protection contre injections, XSS, CSRF ; limitation de débit sur l'authentification

|

SEC-04

| Sécurité

| Données de santé : chiffrement au repos, stockage privé des ordonnances, accès journalisé

|

SEC-05

| Sécurité

| Test d'intrusion de base et analyse des dépendances avant la mise en production

|

DON-01

| Données

| Sauvegardes quotidiennes chiffrées ; restauration testée au moins chaque trimestre

|

DON-02

| Données

| Intégrité garantie par transactions : aucune vente partielle, aucun stock incohérent

|

ERG-01

| Ergonomie

| Écran de vente entièrement utilisable au clavier ; interface en français

|

ERG-02

| Ergonomie

| Utilisable sur écran d'au moins 1366×768 et tablette de 10 pouces

|

ERG-03

| Ergonomie

| Formation d'un caissier en moins d'une demi-journée

|

COMP-01

| Compatibilité

| Navigateurs Chrome, Edge et Firefox (deux dernières versions majeures)

|

MAINT-01

| Maintenabilité

| Code modulaire, documenté, couvert par des tests automatisés (couverture élevée sur les règles de gestion critiques)

|

MAINT-02

| Maintenabilité

| Migrations de base versionnées ; déploiement automatisé et reproductible

|

OBS-01

| Supervision

| Journaux structurés, suivi des erreurs et alertes sur indisponibilité

|

LEG-01

| Conformité

| Respect de la réglementation locale pharmaceutique, fiscale et de protection des données, confirmé par le maître d'ouvrage

|

7. Interfaces et exigences techniques

7.1 Architecture et technologies

Couche

| Choix

|

Frontend

| Angular (composants standalone, signals), TypeScript strict, Angular Material, PWA

|

Backend

| NestJS (monolithe modulaire), API REST versionnée /api/v1, documentation OpenAPI

|

Base de données

| PostgreSQL sur Supabase (accès par le backend uniquement)

|

Stockage fichiers

| Supabase Storage privé, liens signés temporaires

|

Dépôt et CI/CD

| Monorepo Nx, GitHub Actions, conteneurs Docker

|

Qualité

| Jest, Supertest, Playwright, ESLint, Prettier

|

Supervision

| Sentry, journaux JSON, point de santé /health

|

Le détail se trouve dans le document « Audit et architecture cible ».

7.2 Interfaces matérielles

Douchette de codes-barres USB (saisie clavier), EAN-13 au minimum.

Imprimante thermique 80 mm pour les tickets.

Onduleur pour le poste de caisse.

7.3 Interfaces logicielles et externes

V1 : import et export Excel/CSV ; génération de PDF ; paiement mobile money enregistré manuellement (opérateur, référence).

V2 : intégration des API d'opérateurs de mobile money, envoi de SMS/courriel, assureurs et tiers payants.

8. Modèle de données de haut niveau

Domaine

| Entités principales

|

Organisation

| Officine, Utilisateur, Rôle, Permission

|

Catalogue

| Produit, Catégorie, Code-barres

|

Stock

| Lot, Mouvement de stock, Inventaire, Ligne d'inventaire

|

Achats

| Fournisseur, Bon de commande, Réception, Facture fournisseur

|

Ventes

| Vente (facture), Ligne de vente, Paiement, Avoir, Séquence de numérotation

|

Clients

| Client, Ordonnance, Fichier d'ordonnance

|

Finance

| Session de caisse, Dépense, Catégorie de dépense, Taux de change

|

Transverse

| Journal d'audit, Paramètre, Clé d'idempotence, Notification

|

Relations clés : un Produit possède plusieurs Lots ; chaque Mouvement de stock référence un Lot ; une Vente contient plusieurs Lignes (une par lot consommé) et plusieurs Paiements ; le stock d'un produit est la somme des quantités de ses lots.

9. Cas d'utilisation principaux

ID

| Cas

| Acteur

| Scénario nominal

| Alternatives / exceptions

|

UC-01

| Vendre

| Caissier

| Ouvre la caisse, scanne les articles, le système propose les lots FEFO, applique taxes et remises, le client paie, la facture est validée et imprimée, le stock est décrémenté

| Stock insuffisant : refus ; produit sur ordonnance : saisie obligatoire ; paiement partiel : solde en créance ; double clic : un seul enregistrement

|

UC-02

| Réceptionner une commande

| Gestionnaire de stock

| Sélectionne le bon de commande ou une réception directe, saisit lots, péremptions, quantités et prix, valide ; le stock et le coût moyen sont mis à jour

| Quantités partielles : commande reste ouverte ; péremption trop proche : alerte

|

UC-03

| Faire un inventaire

| Gestionnaire, pharmacien

| Lance l'inventaire, saisit les comptages, consulte les écarts, le pharmacien valide, les ajustements sont générés

| Écart important : justification obligatoire ; inventaire annulé : aucun mouvement

|

UC-04

| Clôturer la caisse

| Caissier

| Saisit le montant compté par devise, le système affiche l'écart, il le justifie et valide

| Écart non justifié : clôture refusée

|

UC-05

| Annuler une vente / avoir

| Pharmacien

| Retrouve la facture, saisit le motif, choisit lignes et quantités, émet l'avoir, remise en stock si le produit est vendable

| Caissier : demande transmise au pharmacien ; lot abîmé : sortie en casse

|

UC-06

| Piloter l'activité

| Propriétaire

| Consulte le tableau de bord, filtre la période, ouvre le rapport détaillé, exporte

| Données hors période : message explicite

|

UC-07

| Traiter une alerte de péremption

| Pharmacien

| Ouvre la liste des lots proches de la péremption, décide (promotion, retour fournisseur, sortie en perte)

| Lot retiré : mouvement motivé

|

10. Indicateurs du tableau de bord

Indicateur

| Définition

|

Chiffre d'affaires

| Somme des ventes validées moins les avoirs, par devise

|

Panier moyen

| Chiffre d'affaires ÷ nombre de ventes

|

Marge brute

| Ventes hors taxe − coût moyen pondéré des produits vendus

|

Taux de marge

| Marge brute ÷ ventes hors taxe

|

Valeur du stock

| Σ (quantité du lot × coût moyen pondéré)

|

Rotation du stock

| Coût des ventes sur période ÷ valeur moyenne du stock

|

Taux de rupture

| Produits à stock nul ÷ produits actifs

|

Valeur proche péremption

| Valeur des lots expirant sous 90 jours

|

Créances

| Soldes dus par les clients, ventilés par ancienneté

|

Écart de caisse

| Total compté − total attendu, par session

|

11. Recette et critères d'acceptation

11.1 Stratégie

Tests unitaires et d'intégration automatisés (règles de gestion, FEFO, calculs), tests de concurrence (deux ventes simultanées du dernier lot), tests de bout en bout des parcours UC-01 à UC-06, puis recette utilisateur sur site avec le personnel, sur un jeu de données réel importé.

11.2 Critères d'acceptation du MVP

ID

| Critère

|

REC-01

| Une vente complète (recherche, facture, paiement, ticket) s'effectue en moins d'une minute

|

REC-02

| Après 100 opérations de test variées, le stock affiché est exactement égal au stock théorique

|

REC-03

| Deux ventes simultanées du dernier lot ne produisent jamais un stock négatif

|

REC-04

| Aucune facture validée ne peut être modifiée ou supprimée

|

REC-05

| Un lot périmé ne peut pas être vendu

|

REC-06

| Le tableau de bord concorde avec les rapports détaillés au centime près

|

REC-07

| Un utilisateur sans droit ne peut accéder ni par l'interface ni par l'API à une fonction interdite

|

REC-08

| Une restauration de sauvegarde reconstitue les données dans le délai RTO

|

REC-09

| Toutes les exigences M du MVP sont démontrées et consignées dans un procès-verbal de recette

|

11.3 Procédure

Phase 1 : recette technique (équipe projet). Phase 2 : recette fonctionnelle (pharmacien et propriétaire). Phase 3 : vérification de service régulier pendant deux semaines d'exploitation réelle. Les anomalies sont classées bloquante, majeure ou mineure ; aucune anomalie bloquante n'est tolérée à la livraison, les majeures sont corrigées dans un délai convenu.

12. Livrables, planning, formation et maintenance

12.1 Livrables

Application déployée en production et en préproduction ; code source et dépôt documenté ; documentation technique (architecture, API OpenAPI, modèle de données, procédures de déploiement et de sauvegarde) ; manuel utilisateur par rôle ; jeux de tests et procès-verbal de recette.

12.2 Planning indicatif

Phase

| Contenu

| Durée

|

0

| Ateliers, validation du cahier des charges, maquettes, décisions ouvertes

| 1 semaine

|

1

| Socle technique, authentification, droits, catalogue

| 1,5 semaine

|

2

| Stock, lots, FEFO, réceptions, alertes, inventaire

| 2 semaines

|

3

| Ventes, facturation, paiements, clients, ordonnances

| 2 semaines

|

4

| Caisse, dépenses, tableau de bord, rapports, exports

| 1,5 semaine

|

5

| Recette, formation, déploiement, accompagnement

| 1 semaine

|

Durée totale du MVP : environ 8 à 9 semaines pour un développeur expérimenté ; à ajuster selon l'équipe et la disponibilité du client.

12.3 Formation

Sessions par rôle (caissier, gestionnaire de stock, pharmacien/propriétaire), supports écrits et vidéos courtes ; accompagnement sur site pendant les premiers jours d'exploitation.

12.4 Garantie et maintenance

Garantie de correction des anomalies : [durée à définir]. Maintenance corrective et évolutive, supervision, mises à jour de sécurité et sauvegardes : [niveau de service et conditions à définir dans le contrat].

13. Gouvernance et risques

13.1 Organisation du projet

Rôle

| Responsabilité

|

Propriétaire de la pharmacie

| Sponsor, arbitrages, validation finale

|

Pharmacien responsable

| Référent métier, validation des règles et de la recette

|

Architecte / maître d'œuvre

| Conception, pilotage technique, qualité

|

Développeurs

| Réalisation, tests

|

Personnel de l'officine

| Participation aux ateliers, recette, formation

|

Point d'avancement hebdomadaire ; tout changement de périmètre passe par une demande de changement écrite, chiffrée et validée.

13.2 Registre des risques

ID

| Risque

| Probabilité

| Impact

| Réponse

|

R1

| Données de départ de mauvaise qualité

| Élevée

| Élevé

| Import avec simulation, inventaire initial obligatoire

|

R2

| Résistance au changement du personnel

| Moyenne

| Élevé

| Implication dès les ateliers, formation, interface simple

|

R3

| Exigences réglementaires mal identifiées

| Moyenne

| Élevé

| Validation écrite par le maître d'ouvrage, avis juridique si besoin

|

R4

| Coupures de réseau ou d'électricité

| Élevée

| Moyen

| Onduleur, procédure papier, file de ventes locale

|

R5

| Dérive du périmètre

| Moyenne

| Moyen

| MoSCoW, MVP strict, gestion des changements

|

R6

| Fuite de données de santé

| Faible

| Très élevé

| Chiffrement, accès restreints, journalisation, tests de sécurité

|

R7

| Erreurs de calcul financier

| Faible

| Élevé

| Calculs serveur en décimal, tests automatisés, recette comptable

|

R8

| Indisponibilité de l'unique développeur

| Moyenne

| Élevé

| Documentation, dépôt partagé, revue de code

|

14. Validation

| Maître d'ouvrage

| Maître d'œuvre

|

Nom

|  |  |

Fonction

|  |  |

Date

|  |  |

Signature (précédée de « Lu et approuvé »)

|

|

|

Annexes

Annexe A – Décisions ouvertes à trancher avant la phase 1

Devises : CDF et USD uniquement, ou autres ?

Prix de vente : par produit ou par lot ? Politique de marge ?

Taxes applicables par catégorie de produits.

Obligations réglementaires sur les produits contrôlés (registre, conservation des ordonnances).

Tiers payants et assurances : nécessaires dès le MVP ?

Nombre de postes, de sites et d'utilisateurs ; matériel disponible.

Qualité de la connexion internet sur site.

Hébergement : plan Supabase retenu et lieu d'hébergement des données.

Propriété et licence du prototype existant.

Annexe B – Traçabilité objectifs → modules

Objectif

| Modules

|

OBJ-1 Traçabilité par lot

| STK, ACH, AUD

|

OBJ-2 Rapidité en caisse

| VTE, CAT

|

OBJ-3 Ruptures et pertes

| STK, NOT, RPT

|

OBJ-4 Sécurité des opérations

| AUT, AUD, VTE, FIN

|

OBJ-5 Vision financière

| FIN, RPT

|