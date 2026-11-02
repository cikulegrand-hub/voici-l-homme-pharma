# Module 7 — FIN : plan d’écarts et réalisation

## État constaté

| Exigence | Existant | Écart à couvrir |
| --- | --- | --- |
| FIN-01 / RG-12 | `cash_sessions` porte les fonds CDF/USD et une contrainte unique partielle empêche deux sessions ouvertes. | Les contrôleurs emploient des identifiants fictifs, l’API cliente vise une route différente, et l’indicateur d’en-tête est statique. |
| FIN-02 / UC-04 | Le service calcule déjà les montants attendus et exige un motif d’écart. | La clôture doit être propriétaire de la session, exposer le récapitulatif réellement calculé et signaler l’écart. |
| FIN-03 | Une dépense et une catégorie existent en base. | La dépense n’était pas rattachée à la session ni déduite de son attendu; ni catégories listées, ni filtre. L’annulation contre-passée et le stockage privé demandent une évolution de schéma/stockage dédiée. |
| FIN-05 | Les règlements de vente sont persistés avec mode et devise. | Aucun agrégat FIN consommable n’était exposé. |
| FIN-06 | Fonction pure sur une liste vide. | Il faut calculer les créances depuis les ventes et paiements réellement stockés, y compris les seuils 30/31 et 60/61. |
| FIN-07/08 / RG-15 | Les lignes de vente conservent `unit_cost_cump_cdf`, donc le coût historique est disponible. | Le calcul de marge et du résultat était alimenté par des paramètres arbitraires et non réutilisé par RPT. |
| Frontend | Écran caisse vide, service API incomplet. | Formulaires ouverture/clôture, dépenses, tableaux financiers, indication de session, et blocage POS. |

## Plan d’exécution

1. Sécuriser les routes FIN avec l’utilisateur authentifié et rendre les opérations de session propriétaires de leur caissier.
2. Centraliser dans `CashService` les calculs de caisse, encaissements, créances âgées, marge et résultat; `ReportsService` les réemploie.
3. Rattacher les dépenses à la session ouverte et les déduire des montants attendus; exposer catégories et filtres.
4. Mettre l’API Angular en cohérence puis construire le poste de caisse : ouverture, clôture contrôlée, dépenses et lectures financières.
5. Ajouter les tests métier ciblant les écarts, la double ouverture, la justification, les devises, le CUMP historisé et les frontières d’âge; lancer les vérifications TypeScript.

## Limite explicitement isolée

La pièce jointe en stockage privé et l’annulation contre-passée exigent un fournisseur de stockage authentifié et des colonnes de contrepassation qui ne figurent pas dans le schéma actuel. Cette itération n’expose qu’une référence de pièce jointe déjà supportée par le modèle et ne supprime aucune dépense.
