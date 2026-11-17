# E – Dropshipping eBay × CJ Dropshipping, 8 pays

Outil perso pour vendre sur eBay des produits CJ Dropshipping, **via les API officielles uniquement** :
pas d'extension navigateur, pas de robot qui clique, pas d'« anti-ban ».

## Ce que ça fait

| Étape | Comment |
|---|---|
| Trouver | Recherche dans le catalogue CJ, niches de départ par région, note sur 100 (popularité, stock, prix, stock vérifié). Import d'un clic ou des N meilleurs en arrière-plan |
| Importer | Pour chacun des 8 pays (US, UK, DE, FR, IT, ES, AU, CA), teste les entrepôts CJ qui ont du stock et garde **le plus rapide** (puis le moins cher). Pays écarté si rien n'arrive en `MAX_DELIVERY_DAYS` |
| Prix | Coût + port convertis dans la devise du pays (taux BCE + marge de sécurité), `(coût + port + frais fixe) / (1 − frais eBay − marge)`, arrondi en ,99, bénéfice minimum garanti |
| Rédiger | DeepSeek V4.1 Flash via OpenRouter écrit titre, description et caractéristiques dans la langue du pays, avec les noms de caractéristiques eBay locaux |
| Publier | Une annonce à variantes par produit et par pays (Inventory API). Catégorie trouvée automatiquement, politiques vendeur retrouvées automatiquement, lieu d'expédition = vrai entrepôt CJ |
| Stock / prix | Relit CJ et met à jour chaque pays ; rupture dans l'entrepôt = quantité 0 |
| Commandes | Commande eBay payée → commande CJ (depuis l'entrepôt du pays) → suivi renvoyé à eBay |

## Structure des données

- `products` : une ligne par variante CJ (coût USD, stock par pays d'entrepôt)
- `market_listings` : une annonce par produit et par pays (entrepôt, délai, texte IA, catégorie, statut)
- `market_offers` : une offre par variante et par pays (SKU `<sku CJ>-<pays>`, prix en devise locale)

## Règles eBay (à lire)

- Dropshipping autorisé **seulement depuis un fournisseur/grossiste** (CJ), jamais depuis Amazon & co.
- Le lieu d'expédition affiché doit être le vrai : l'appli crée un lieu eBay par entrepôt CJ.
- Délais : règle tes politiques de livraison de chaque pays sur les vrais délais CJ.
- Nouveau compte vendeur = limites de mise en vente : publier peu, les meilleurs produits d'abord.
- Quantité affichée plafonnée à 5 (`MAX_LISTED_QUANTITY`) pour ne jamais survendre.

## Mise en route

1. `npm install`, copier `.env.example` en `.env.local` et remplir.
2. Supabase : exécuter les fichiers de `supabase/migrations/` dans l'ordre.
3. `npm run dev` puis http://localhost:3000 (identifiant libre, mot de passe = `ADMIN_PASSWORD`).

### eBay
- developer.ebay.com : keyset → `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` ; RuName avec *Auth accepted URL* = `APP_URL/api/ebay/callback`.
- Seller Hub de **chaque pays** : une politique de livraison, de paiement et de retours (nom contenant « auto » de préférence).
- Production : notification *Marketplace Account Deletion* → `APP_URL/api/ebay/account-deletion` + `EBAY_DELETION_VERIFICATION_TOKEN`.

### CJ
- Clé API dans *Mon compte → API*. Limite : 1 appel/s, gérée par l'appli (token gardé en base).
- `CJ_AUTO_PAY=true` pour payer les commandes avec le solde CJ.

### IA (OpenRouter)
- Clé sur openrouter.ai → Keys → `AI_API_KEY`. Modèle : `AI_MODEL` (défaut `deepseek/deepseek-v4.1-flash`).

## Planification
Le plan gratuit de Vercel limite les tâches planifiées à une par jour. Un planificateur externe (Supabase `pg_cron`)
doit appeler avec `Authorization: Bearer <CRON_SECRET>` :
- `GET /api/cron/sync-orders` toutes les 15 min
- `GET /api/cron/sync-stock` toutes les 6 h

## Reste à faire
- Pilote automatique (import → IA → publication en continu, dans la limite du compte) + planificateur.
- Valider chaque niche avec les données eBay du pays (API Browse : prix pratiqués, nombre de concurrents).
- Vérifier la signature des notifications de suppression eBay avant la production.

## Commandes

```bash
npm run dev        # serveur local
npm test           # tests
npm run typecheck  # vérification TypeScript
npm run build      # build de prod
```
