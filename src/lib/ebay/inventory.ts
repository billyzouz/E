import type { Market } from "@/lib/markets";
import { ebayFetch } from "./client";

/**
 * Inventory API eBay : une annonce à variantes =
 * 1 article d'inventaire par variante (SKU) + 1 groupe + 1 offre par SKU, puis publication du groupe.
 */

export interface VariantDraft {
  sku: string;
  aspects: Record<string, string[]>; // inclut les options de la variante, ex { Color: ["Black"] }
  imageUrls: string[];
  quantity: number;
  price: number;
  offerId?: string | null;
}

export interface GroupDraft {
  groupKey: string;
  title: string; // 80 caractères max
  descriptionHtml: string;
  imageUrls: string[];
  aspects: Record<string, string[]>; // communs à toutes les variantes
  variesBy: { name: string; values: string[] }[]; // vide si une seule variante
  categoryId: string;
  merchantLocationKey: string;
  policies: { fulfillmentPolicyId: string; paymentPolicyId: string; returnPolicyId: string };
  variants: VariantDraft[];
}

const opts = (m: Market) => ({ marketplaceId: m.id, contentLanguage: m.language });

export function upsertInventoryItem(token: string, m: Market, g: GroupDraft, v: VariantDraft) {
  return ebayFetch<void>(token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(v.sku)}`, {
    ...opts(m),
    method: "PUT",
    body: JSON.stringify({
      availability: { shipToLocationAvailability: { quantity: v.quantity } },
      condition: "NEW",
      product: {
        title: g.title.slice(0, 80),
        description: g.descriptionHtml,
        aspects: { ...g.aspects, ...v.aspects },
        imageUrls: v.imageUrls.slice(0, 24),
      },
    }),
  });
}

export function upsertGroup(token: string, m: Market, g: GroupDraft) {
  return ebayFetch<void>(token, `/sell/inventory/v1/inventory_item_group/${encodeURIComponent(g.groupKey)}`, {
    ...opts(m),
    method: "PUT",
    body: JSON.stringify({
      inventoryItemGroupKey: g.groupKey,
      title: g.title.slice(0, 80),
      description: g.descriptionHtml,
      imageUrls: g.imageUrls.slice(0, 12),
      aspects: g.aspects,
      variantSKUs: g.variants.map((v) => v.sku),
      variesBy: {
        aspectsImageVariesBy: g.variesBy.length ? [g.variesBy[0].name] : [],
        specifications: g.variesBy,
      },
    }),
  });
}

function offerBody(m: Market, g: GroupDraft, v: VariantDraft) {
  return {
    sku: v.sku,
    marketplaceId: m.id,
    format: "FIXED_PRICE",
    availableQuantity: v.quantity,
    categoryId: g.categoryId,
    listingDescription: g.descriptionHtml,
    merchantLocationKey: g.merchantLocationKey,
    listingPolicies: g.policies,
    pricingSummary: { price: { value: v.price.toFixed(2), currency: m.currency } },
  };
}

/** Crée l'offre, ou la met à jour si elle existe déjà. Renvoie l'offerId. */
export async function upsertOffer(token: string, m: Market, g: GroupDraft, v: VariantDraft): Promise<string> {
  if (v.offerId) {
    await ebayFetch(token, `/sell/inventory/v1/offer/${v.offerId}`, {
      ...opts(m),
      method: "PUT",
      body: JSON.stringify(offerBody(m, g, v)),
    });
    return v.offerId;
  }
  const res = await ebayFetch<{ offerId: string }>(token, "/sell/inventory/v1/offer", {
    ...opts(m),
    method: "POST",
    body: JSON.stringify(offerBody(m, g, v)),
  });
  return res.offerId;
}

/** Publie l'annonce (à variantes ou non). Renvoie le listingId eBay et les offerId par SKU. */
export async function publishGroup(token: string, m: Market, g: GroupDraft) {
  for (const v of g.variants) await upsertInventoryItem(token, m, g, v);

  const offerIds: Record<string, string> = {};
  for (const v of g.variants) offerIds[v.sku] = await upsertOffer(token, m, g, v);

  if (g.variants.length === 1) {
    const only = g.variants[0];
    const res = await ebayFetch<{ listingId: string }>(token, `/sell/inventory/v1/offer/${offerIds[only.sku]}/publish`, {
      ...opts(m),
      method: "POST",
    });
    return { listingId: res.listingId, offerIds };
  }

  await upsertGroup(token, m, g);
  const res = await ebayFetch<{ listingId: string }>(token, "/sell/inventory/v1/offer/publish_by_inventory_item_group", {
    ...opts(m),
    method: "POST",
    body: JSON.stringify({ inventoryItemGroupKey: g.groupKey, marketplaceId: m.id }),
  });
  return { listingId: res.listingId, offerIds };
}

export interface PriceQuantityUpdate {
  sku: string;
  offerId: string;
  quantity: number;
  price?: number;
  currency?: string;
}

/** Met à jour stock et prix de plusieurs offres (25 max par appel). */
export async function bulkUpdatePriceQuantity(token: string, updates: PriceQuantityUpdate[]) {
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
              ...(u.price !== undefined && u.currency
                ? { price: { value: u.price.toFixed(2), currency: u.currency } }
                : {}),
            },
          ],
        })),
      }),
    });
  }
}
