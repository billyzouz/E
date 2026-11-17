import { db } from "@/lib/db";
import {
  cheapestFreight,
  extractPid,
  getProductWithStock,
  productImages,
  stockByCountry,
  type CjFreightOption,
  type CjProduct,
} from "@/lib/cj/client";
import { useDbTokenCache } from "@/lib/cj/token-cache";
import { usdTo } from "@/lib/fx";
import { enabledMarkets, maxDays, type Market } from "@/lib/markets";
import { computeSellPrice, rulesFromEnv } from "@/lib/pricing";

/** Nombre max de variantes importées par produit (les plus en stock d'abord). */
export const MAX_VARIANTS = 10;
/** Quantité affichée sur eBay : plafonnée pour ne jamais survendre un stock fournisseur instable. */
export const MAX_LISTED_QUANTITY = 5;
export const listedQuantity = (stock: number) => Math.max(0, Math.min(stock, MAX_LISTED_QUANTITY));

/** Nettoie le HTML fournisseur : retire scripts, styles, iframes et attributs d'événements. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "");
}

/** Variantes qui ont du stock quelque part, les plus fournies d'abord. */
export function pickVariants(p: CjProduct, max = MAX_VARIANTS) {
  return p.variants
    .map((v) => {
      const stock = stockByCountry(v);
      return { v, stock, total: Object.values(stock).reduce((a, b) => a + b, 0) };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, max);
}

type Picked = ReturnType<typeof pickVariants>;

export interface WarehouseChoice {
  shipFrom: string;
  freight: CjFreightOption;
  variants: Picked;
}

/**
 * Pour un pays acheteur, teste chaque entrepôt CJ qui a du stock (dans l'ordre de proximité du marché)
 * et garde celui qui livre le plus vite (délai max annoncé), puis le moins cher à délai égal.
 * Le port est calculé sur la variante la plus lourde de l'entrepôt : prudent pour toutes les autres.
 */
export async function chooseWarehouse(
  market: Market,
  picked: Picked,
  quote: (from: string, vid: string) => Promise<CjFreightOption | null>,
  maxDeliveryDays: number,
): Promise<WarehouseChoice | null> {
  let best: WarehouseChoice | null = null;
  for (const wh of market.warehouses) {
    const variants = picked.filter((x) => (x.stock[wh] ?? 0) > 0);
    if (!variants.length) continue;
    const heaviest = variants.reduce((a, b) => (b.v.variantWeight > a.v.variantWeight ? b : a)).v;
    const freight = await quote(wh, heaviest.vid);
    if (!freight || maxDays(freight.logisticAging) > maxDeliveryDays) continue;

    const better =
      !best ||
      maxDays(freight.logisticAging) < maxDays(best.freight.logisticAging) ||
      (maxDays(freight.logisticAging) === maxDays(best.freight.logisticAging) &&
        freight.logisticPrice < best.freight.logisticPrice);
    if (better) best = { shipFrom: wh, freight, variants };
  }
  return best;
}

export interface MarketResult {
  marketplace: string;
  status: "draft" | "skipped";
  shipFrom?: string;
  deliveryDays?: string;
  reason?: string;
}

/**
 * Importe un produit CJ (lien ou pid) pour tous les pays activés, en brouillon.
 * Appels CJ : 1 pour la fiche (stock compris) + 1 calcul de port par couple entrepôt/pays testé.
 */
export async function importCjProduct(linkOrPid: string, markets: Market[] = enabledMarkets()) {
  useDbTokenCache();
  const p = await getProductWithStock(extractPid(linkOrPid));
  const picked = pickVariants(p);
  if (!picked.length) throw new Error(`« ${p.productNameEn} » : aucun stock chez CJ`);

  const optionNames = (p.productKeyEn ?? "").split("-").map((s) => s.trim()).filter(Boolean);
  const images = productImages(p);

  const { data: products, error } = await db()
    .from("products")
    .upsert(
      picked.map(({ v, stock }) => ({
        cj_pid: p.pid,
        cj_vid: v.vid,
        cj_variant_sku: v.variantSku,
        name_en: p.productNameEn,
        variant_key: v.variantKey,
        option_names: optionNames,
        description_html: sanitizeHtml(p.description ?? ""),
        image_urls: [v.variantImage, ...images].filter((x): x is string => !!x).slice(0, 24),
        cost_usd: v.variantSellPrice,
        weight_g: v.variantWeight,
        stock_by_country: stock,
        cj_listed_num: p.listedNum ?? null,
        last_synced_at: new Date().toISOString(),
      })),
      { onConflict: "cj_vid" },
    )
    .select("id, cj_vid");
  if (error) throw error;
  const productIdByVid = new Map(products.map((r) => [r.cj_vid, r.id as string]));

  const maxDeliveryDays = Number(process.env.MAX_DELIVERY_DAYS || "20");
  const freightCache = new Map<string, CjFreightOption | null>();
  const results: MarketResult[] = [];

  for (const market of markets) {
    const quote = async (from: string, vid: string) => {
      const key = `${from}>${market.country}>${vid}`;
      if (!freightCache.has(key)) {
        freightCache.set(
          key,
          await cheapestFreight({ fromCountry: from, toCountry: market.country, vid, quantity: 1 }).catch(() => null),
        );
      }
      return freightCache.get(key)!;
    };

    const choice = await chooseWarehouse(market, picked, quote, maxDeliveryDays);
    if (!choice) {
      results.push({
        marketplace: market.id,
        status: "skipped",
        reason: `aucun entrepôt ne livre ${market.name} en ${maxDeliveryDays} j max`,
      });
      continue;
    }
    await saveMarketDraft(p.pid, market, choice, productIdByVid);
    results.push({
      marketplace: market.id,
      status: "draft",
      shipFrom: choice.shipFrom,
      deliveryDays: choice.freight.logisticAging,
    });
  }

  return { pid: p.pid, name: p.productNameEn, variants: picked.length, markets: results };
}

async function saveMarketDraft(
  pid: string,
  market: Market,
  choice: WarehouseChoice,
  productIdByVid: Map<string, string>,
) {
  const { data: listing, error } = await db()
    .from("market_listings")
    .upsert(
      {
        cj_pid: pid,
        marketplace: market.id,
        ship_from: choice.shipFrom,
        logistic_name: choice.freight.logisticName,
        delivery_days: choice.freight.logisticAging,
        group_key: `${pid}-${market.country}`.slice(0, 50),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cj_pid,marketplace" },
    )
    .select("id")
    .single();
  if (error) throw error;

  const rules = { ...rulesFromEnv(), ebayFixedFee: market.fixedFee };
  const shipping = await usdTo(market.currency, choice.freight.logisticPrice);

  const offers = [];
  for (const { v, stock } of choice.variants) {
    const cost = await usdTo(market.currency, v.variantSellPrice);
    offers.push({
      listing_id: listing.id,
      product_id: productIdByVid.get(v.vid)!,
      sku: `${v.variantSku}-${market.country}`.slice(0, 50),
      currency: market.currency,
      shipping_cost: shipping,
      cost,
      price: computeSellPrice(cost, shipping, rules).price,
      quantity: listedQuantity(stock[choice.shipFrom] ?? 0),
    });
  }
  const { error: offerError } = await db().from("market_offers").upsert(offers, { onConflict: "listing_id,product_id" });
  if (offerError) throw offerError;
}
