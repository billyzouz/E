import { requireEnv } from "@/lib/env";
import { ebayFetch } from "./client";
import { marketplace } from "./config";

export interface ListingDraft {
  sku: string;
  title: string; // 80 caractères max chez eBay
  descriptionHtml: string;
  imageUrls: string[]; // 24 max
  aspects: Record<string, string[]>; // ex { Marque: ["Sans marque"], Couleur: ["Noir"] }
  categoryId: string;
  quantity: number;
  price: number;
}

/** Crée ou remplace l'article d'inventaire (le "produit" côté eBay). */
export function upsertInventoryItem(token: string, d: ListingDraft) {
  return ebayFetch<void>(token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(d.sku)}`, {
    method: "PUT",
    body: JSON.stringify({
      availability: { shipToLocationAvailability: { quantity: d.quantity } },
      condition: "NEW",
      product: {
        title: d.title.slice(0, 80),
        description: d.descriptionHtml,
        aspects: d.aspects,
        imageUrls: d.imageUrls.slice(0, 24),
      },
    }),
  });
}

/** Crée l'offre (prix, catégorie, politiques) liée au SKU. Renvoie l'offerId. */
export async function createOffer(token: string, d: ListingDraft): Promise<string> {
  const m = marketplace();
  const res = await ebayFetch<{ offerId: string }>(token, "/sell/inventory/v1/offer", {
    method: "POST",
    body: JSON.stringify({
      sku: d.sku,
      marketplaceId: m.id,
      format: "FIXED_PRICE",
      availableQuantity: d.quantity,
      categoryId: d.categoryId,
      listingDescription: d.descriptionHtml,
      merchantLocationKey: requireEnv("EBAY_MERCHANT_LOCATION_KEY"),
      listingPolicies: {
        fulfillmentPolicyId: requireEnv("EBAY_FULFILLMENT_POLICY_ID"),
        paymentPolicyId: requireEnv("EBAY_PAYMENT_POLICY_ID"),
        returnPolicyId: requireEnv("EBAY_RETURN_POLICY_ID"),
      },
      pricingSummary: { price: { value: d.price.toFixed(2), currency: m.currency } },
    }),
  });
  return res.offerId;
}

/** Met l'annonce en ligne. Renvoie le listingId (l'ID visible sur eBay). */
export async function publishOffer(token: string, offerId: string): Promise<string> {
  const res = await ebayFetch<{ listingId: string }>(token, `/sell/inventory/v1/offer/${offerId}/publish`, {
    method: "POST",
  });
  return res.listingId;
}

/** Chaîne complète : article → offre → publication. */
export async function publishListing(token: string, d: ListingDraft) {
  await upsertInventoryItem(token, d);
  const offerId = await createOffer(token, d);
  const listingId = await publishOffer(token, offerId);
  return { offerId, listingId };
}

export interface PriceQuantityUpdate {
  sku: string;
  offerId: string;
  quantity: number;
  price?: number;
}

/** Met à jour stock et prix de plusieurs annonces (25 max par appel). */
export async function bulkUpdatePriceQuantity(token: string, updates: PriceQuantityUpdate[]) {
  const m = marketplace();
  for (let i = 0; i < updates.length; i += 25) {
    const chunk = updates.slice(i, i + 25);
    await ebayFetch(token, "/sell/inventory/v1/bulk_update_price_quantity", {
      method: "POST",
      body: JSON.stringify({
        requests: chunk.map((u) => ({
          sku: u.sku,
          shipToLocationAvailability: { quantity: u.quantity },
          offers: [
            {
              offerId: u.offerId,
              availableQuantity: u.quantity,
              ...(u.price !== undefined ? { price: { value: u.price.toFixed(2), currency: m.currency } } : {}),
            },
          ],
        })),
      }),
    });
  }
}
