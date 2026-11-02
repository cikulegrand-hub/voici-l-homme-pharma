# Module 6 — VTE : plan de réalisation et écarts initiaux

## Écarts constatés avant implémentation

| Exigence | État initial | Correction prévue |
|---|---|---|
| Session de caisse obligatoire | Une session était créée automatiquement. | Refuser la vente sans session ouverte de l'utilisateur. |
| Calcul serveur | Le DTO accepte le prix et le frontend calcule total, USD et rendu. | Prix, taxes, taux, arrondi et rendu sont calculés par le serveur; le frontend consomme la prévisualisation. |
| Idempotence RG-16 | Clé dans le corps de requête. | En-tête `Idempotency-Key` obligatoire; contrainte unique déjà présente. |
| Panier en attente VTE-11 | `Map` mémoire non durable. | Table persistante et routes de reprise. |
| Paiement partiel | Refus si total reçu inférieur au total. | Solde transformé en créance client, avec client obligatoire. |
| Annulation / avoir | Annulation hors transaction et pas d'avoir partiel. | Contre-passations, retour/casse et avoir transactionnels. |
| Documents | Duplicata JSON uniquement. | Représentations facture/ticket imprimables, marquées DUPLICATA et auditées. |

## Incréments

1. **Moteur de vente** — authentification, session ouverte, prévisualisation, prix/taxes/taux côté serveur, FEFO verrouillé, séquence sans trou et audit atomiques.
2. **Paiements** — modes, références obligatoires, multi-paiement, paiement partiel et créance.
3. **Après-vente** — paniers persistants, annulation, avoir partiel, retour ou casse et contre-passation.
4. **Documents et interface** — facture/ticket, duplicata, POS sans calcul financier local, clavier/douchette et erreurs françaises.
5. **Recette** — compilation et tests ciblés des scénarios REC-01 à REC-05 et règles RG.

## Limite explicite

Les PDF binaires nécessitent une dépendance de rendu qui n'est pas présente dans le dépôt. L'incrément documents fournit un HTML imprimable, avec format ticket 80 mm et source serveur immuable, sans ajouter de moteur PDF non audité.
