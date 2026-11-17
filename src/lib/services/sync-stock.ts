import { db } from "@/lib/db";
import { getProduct, getVariantStock } from "@/lib/cj/client";
import { usdToEur } from "@/lib/cj/currency";
import { bulkUpdatePriceQuantity, type PriceQuantityUpdate } from "@/lib/ebay/inventory";
import { getUserAccessToken } from "@/lib/ebay/token-store";
import { computeSellPrice, rulesFromEnv } from "@/lib/pricing";
import { listedQuantity } from "./publish-product";

/**
 * Relit stock et prix chez CJ pour chaque annonce en ligne,
 * puis pousse les changements sur eBay. Rupture fournisseur => quantité 0.
 */
export async function syncStock() {
  const { data: products, error } = await db().from("products").select("*").eq("status", "listed");
  if (error) throw error;

  const rules = rulesFromEnv();
  const productCache = new Map<string, Awaited<ReturnType<typeof getProduct>>>();
  const updates: PriceQuantityUpdate[] = [];
  const report = { checked: 0, changed: 0, errors: [] as string[] };

  for (const p of products ?? []) {
    report.checked++;
    try {
      const stock = await getVariantStock(p.cj_vid);
      if (!productCache.has(p.cj_pid)) productCache.set(p.cj_pid, await getProduct(p.cj_pid));
      const variant = productCache.get(p.cj_pid)!.variants.find((v) => v.vid === p.cj_vid);
      const quantity = variant ? listedQuantity(stock) : 0; // variante supprimée chez CJ => on coupe
      const cost = variant ? usdToEur(variant.variantSellPrice) : Number(p.cost_eur);
      const price = computeSellPrice(cost, Number(p.shipping_eur), rules).price;

      if (quantity !== listedQuantity(p.stock) || price !== Number(p.price_eur)) {
        updates.push({ sku: p.sku, offerId: p.ebay_offer_id, quantity, price });
        report.changed++;
      }
      await db()
        .from("products")
        .update({ stock: variant ? stock : 0, cost_eur: cost, price_eur: price, last_synced_at: new Date().toISOString() })
        .eq("id", p.id);
    } catch (e) {
      report.errors.push(`${p.sku}: ${String(e)}`);
    }
  }

  if (updates.length) await bulkUpdatePriceQuantity(await getUserAccessToken(), updates);
  return report;
}
