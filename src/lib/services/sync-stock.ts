import { db } from "@/lib/db";
import { getProduct, variantStock } from "@/lib/cj/client";
import { usdToEur } from "@/lib/cj/currency";
import { useDbTokenCache } from "@/lib/cj/token-cache";
import { bulkUpdatePriceQuantity, type PriceQuantityUpdate } from "@/lib/ebay/inventory";
import { getUserAccessToken } from "@/lib/ebay/token-store";
import { computeSellPrice, rulesFromEnv } from "@/lib/pricing";
import { listedQuantity } from "./publish-product";

/**
 * Relit stock et prix chez CJ pour chaque annonce en ligne (1 appel CJ par produit,
 * toutes variantes comprises), puis pousse les changements sur eBay.
 * Rupture fournisseur ou variante supprimée => quantité 0.
 */
export async function syncStock() {
  useDbTokenCache();
  const { data: products, error } = await db().from("products").select("*").eq("status", "listed");
  if (error) throw error;

  const rules = rulesFromEnv();
  const productCache = new Map<string, Awaited<ReturnType<typeof getProduct>>>();
  const updates: PriceQuantityUpdate[] = [];
  const report = { checked: 0, changed: 0, errors: [] as string[] };

  for (const p of products ?? []) {
    report.checked++;
    try {
      if (!productCache.has(p.cj_pid)) productCache.set(p.cj_pid, await getProduct(p.cj_pid));
      const variant = productCache.get(p.cj_pid)!.variants.find((v) => v.vid === p.cj_vid);
      const stock = variant ? variantStock(variant, p.ship_from) : 0;
      const quantity = listedQuantity(stock);
      const cost = variant ? usdToEur(variant.variantSellPrice) : Number(p.cost_eur);
      const price = computeSellPrice(cost, Number(p.shipping_eur), rules).price;

      if (quantity !== listedQuantity(p.stock) || price !== Number(p.price_eur)) {
        updates.push({ sku: p.sku, offerId: p.ebay_offer_id, quantity, price });
        report.changed++;
      }
      await db()
        .from("products")
        .update({ stock, cost_eur: cost, price_eur: price, last_synced_at: new Date().toISOString() })
        .eq("id", p.id);
    } catch (e) {
      report.errors.push(`${p.sku}: ${String(e)}`);
    }
  }

  if (updates.length) await bulkUpdatePriceQuantity(await getUserAccessToken(), updates);
  return report;
}
