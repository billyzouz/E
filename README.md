# E – Dropshipping eBay × CJ Dropshipping

Outil perso pour vendre sur eBay des produits CJ Dropshipping, **via les API officielles uniquement** :
pas d'extension navigateur, pas de robot qui clique, pas d'« anti-ban ».

## Ce que ça fait

| Étape | Comment |
|---|---|
| Trouver des produits | Recherche dans le catalogue CJ (mot-clé, entrepôt, fourchette de prix), classement par note sur 100 : popularité (nb de boutiques qui le vendent), stock, prix d'achat, stock vérifié. Import d'un clic ou import automatique des N meilleurs en arrière-plan |
| Importer un produit | Lien CJ → fiche brouillon (titre, photos, 10 variantes en stock max), coût + port calculés via l'API CJ. 2 appels CJ par produit |
| Calculer le prix | `(coût + port + frais fixe eBay) / (1 − frais eBay − marge)`, arrondi en ,99, bénéfice minimum garanti (`src/lib/pricing.ts`) |
| Publier sur eBay | Inventory API : article → offre → publication |
| Synchroniser stock/prix | Toutes les 6 h (planification à brancher, voir plus bas) : relit CJ, met à jour eBay ; rupture = quantité 0 |
| Commandes | Toutes les 15 min : commande eBay payée → commande CJ ; numéro de suivi CJ → eBay |

## Règles eBay (à lire)

eBay autorise le dropshipping **seulement depuis un grossiste/fournisseur**, pas depuis un autre
détaillant (Amazon, etc.). CJ est un fournisseur de dropshipping, mais :
- tu restes responsable des délais annoncés : règle ta politique de livraison eBay sur les vrais délais CJ ;
- les colis ne doivent pas contenir de facture/prix CJ (option disponible chez CJ) ;
- la quantité affichée est plafonnée à 5 pour éviter de survendre (`MAX_LISTED_QUANTITY`).

## Mise en route

1. `npm install`
2. Copier `.env.example` en `.env.local` et remplir les valeurs.
3. Créer un projet Supabase et exécuter les fichiers de `supabase/migrations/` dans l'ordre.
4. `npm run dev` puis ouvrir http://localhost:3000 (identifiant libre, mot de passe = `ADMIN_PASSWORD`).

### Côté eBay (developer.ebay.com)
- Keyset **Sandbox** → `EBAY_CLIENT_ID` (App ID), `EBAY_CLIENT_SECRET` (Cert ID).
- User Tokens → créer un **RuName** avec comme *Auth accepted URL* : `APP_URL/api/ebay/callback` → `EBAY_RUNAME`.
- Dans ton compte vendeur : activer les *business policies* (livraison, paiement, retours) et créer
  une *inventory location* → reporter les IDs dans `.env.local`.
- Pour la Production : notification *Marketplace Account Deletion* → URL `APP_URL/api/ebay/account-deletion`
  + le token `EBAY_DELETION_VERIFICATION_TOKEN`.

### Côté CJ (cjdropshipping.com)
- Mon compte → **API** → générer la clé → `CJ_API_KEY`.
- Paiement des commandes : avec `CJ_AUTO_PAY=true`, chaque commande est payée avec ton solde CJ
  (à approvisionner). Sinon elle est créée non payée et tu la paies à la main sur CJ.
- Limite CJ : 1 appel API par seconde. L'appli espace ses appels et garde le token CJ en base.

## À vérifier au premier vrai test
- codes transporteurs eBay (`carrierCode` dans `src/lib/services/sync-orders.ts`) ;
- signature des notifications de suppression eBay (TODO dans la route) avant la production.

## Commandes

```bash
npm run dev        # serveur local
npm test           # tests
npm run typecheck  # vérification TypeScript
npm run build      # build de prod
```

## Reste à faire
- Génération IA des titres/descriptions en français (les fiches CJ sont en anglais).
- Choix de catégorie eBay dans l'interface (l'API de suggestion est prête : `src/lib/ebay/taxonomy.ts`).
- Bouton « Publier » dans le tableau de bord (la route `/api/products/publish` existe).
- Publier les variantes d'un produit en **une seule annonce à variations** (inventory item group).
  Aujourd'hui chaque variante est une ligne séparée : à ne pas publier telle quelle, eBay interdit les annonces en double.
- Brancher les données eBay dans la note des produits (prix pratiqués et nombre de concurrents via l'API Browse).

## Planification des synchros
Le plan gratuit de Vercel limite les tâches planifiées à une par jour : on ne les déclare donc pas dans Vercel.
À la place, un planificateur externe (Supabase `pg_cron` ou cron-job.org) appelle :
- `GET /api/cron/sync-orders` toutes les 15 min
- `GET /api/cron/sync-stock` toutes les 6 h

avec l'en-tête `Authorization: Bearer <CRON_SECRET>`.
