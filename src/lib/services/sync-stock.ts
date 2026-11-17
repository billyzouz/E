import { db } from "@/lib/db";
import { getProduct, stockByCountry } from "@/lib/cj/client";
import { useDbTokenCache } from "@/lib/cj/token-cache";
import { bulkUpdatePriceQuantity, type PriceQuantityUpdate } from "@/lib/ebay/inventory";
import { getUserAccessToken } from "@/lib/ebay/token-store";
import { usdTo } from "@/lib/fx";
import { getMarket } from "@/lib/markets";
import { computeSellPrice, rulesFromEnv } from "@/lib/pricing";
import { listedQuantity } from "./import-product";

/**
 * Relit chez CJ le stock et le prix de chaque produit en vente (1 appel CJ par produit, tous pays confondus),
 * recalcule prix et quantités par pays, puis pousse les changements sur eBay.
 * Rupture dans l'entrepôt du pays ou variante supprimée => quantité 0.
 */
export async function syncStock() {
  useDbTokenCache();
  const { data: listings, error } = await db()
    .from("market_listings")
    .select("id, cj_pid, marketplace, ship_from, offers:market_offers(*, product:products(cj_vid))")
    .eq("status", "listed");
  if (error) throw error;

  const rules = rulesFromEnv();
  const updates: PriceQuantityUpdate[] = [];
  const report = { products: 0, offersChanged: 0, errors: [] as string[] };
  const byPid = new Map<string, typeof listings>();
  for (const l of listings ?? []) byPid.set(l.cj_pid, [...(byPid.get(l.cj_pid) ?? []), l]);

  for (const [pid, pidListings] of byPid) {
    report.products++;
    try {
      const cj = await getProduct(pid);
      const variants = new Map(cj.variants.map((v) => [v.vid, v]));

      for (const v of cj.variants) {
        await db()
          .from("products")
          .update({ cost_usd: v.variantSellPrice, stock_by_country: stockByCountry(v), last_synced_at: new Date().toISOString() })
          .eq("cj_vid", v.vid);
      }

      for (const l of pidListings) {
        const market = getMarket(l.marketplace);
        const marketRules = { ...rules, ebayFixedFee: market.fixedFee };
        for (const o of l.offers as { id: string; sku: string; ebay_offer_id: string | null; quantity: number; price: number; shipping_cost: number; product: { cj_vid: string } }[]) {
          const v = variants.get(o.product.cj_vid);
          const quantity = v ? listedQuantity(stockByCountry(v)[l.ship_from] ?? 0) : 0;
          const cost = v ? await usdTo(market.currency, v.variantSellPrice) : null;
          const price = cost !== null ? computeSellPrice(cost, Number(o.shipping_cost), marketRules).price : Number(o.price);

          if (quantity !== o.quantity || price !== Number(o.price)) {
            await db()
              .from("market_offers")
              .update({ quantity, price, ...(cost !== null ? { cost } : {}) })
              .eq("id", o.id);
            if (o.ebay_offer_id) {
              updates.push({ sku: o.sku, offerId: o.ebay_offer_id, quantity, price, currency: market.currency });
            }
            report.offersChanged++;
          }
        }
      }
    } catch (e) {
      report.errors.push(`${pid}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (updates.length) await bulkUpdatePriceQuantity(await getUserAccessToken(), updates);
  return report;
}
