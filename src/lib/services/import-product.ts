import { db } from "@/lib/db";
import { cheapestFreight, extractPid, getProduct, productImages, variantStock, type CjProduct } from "@/lib/cj/client";
import { usdToEur } from "@/lib/cj/currency";
import { useDbTokenCache } from "@/lib/cj/token-cache";
import { computeSellPrice, rulesFromEnv } from "@/lib/pricing";

/** Nombre max de variantes importées par produit (les plus en stock d'abord). */
export const MAX_VARIANTS = 10;

/** Nettoie le HTML fournisseur : retire scripts, styles, iframes et attributs d'événements. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "");
}

/** Variantes en stock dans l'entrepôt d'expédition, les plus fournies d'abord. */
export function pickVariants(p: CjProduct, shipFrom: string, max = MAX_VARIANTS) {
  return p.variants
    .map((v) => ({ v, stock: variantStock(v, shipFrom) }))
    .filter((x) => x.stock > 0)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, max);
}

export interface ImportOptions {
  shipFrom?: string; // pays de l'entrepôt CJ (CN, FR, DE…)
  shipTo?: string; // pays de l'acheteur
}

/**
 * Importe un produit CJ (lien ou pid) en brouillon : une ligne par variante en stock,
 * avec le prix de vente calculé. Rien n'est publié sur eBay à ce stade.
 *
 * Seulement 2 appels CJ : la fiche produit (qui contient déjà le stock)
 * et un calcul de port sur la variante la plus lourde (on applique ce port à toutes : prudent).
 */
export async function importCjProduct(linkOrPid: string, opts: ImportOptions = {}) {
  useDbTokenCache();
  const shipFrom = opts.shipFrom || process.env.CJ_FROM_COUNTRY || "CN";
  const shipTo = opts.shipTo || "FR";

  const p = await getProduct(extractPid(linkOrPid));
  const picked = pickVariants(p, shipFrom);
  if (!picked.length) throw new Error(`« ${p.productNameEn} » : aucun stock dans l'entrepôt ${shipFrom}`);

  const heaviest = picked.reduce((a, b) => (b.v.variantWeight > a.v.variantWeight ? b : a)).v;
  const freight = await cheapestFreight({ fromCountry: shipFrom, toCountry: shipTo, vid: heaviest.vid, quantity: 1 });
  const shipping = usdToEur(freight.logisticPrice);
  const rules = rulesFromEnv();
  const images = productImages(p);

  const rows = picked.map(({ v, stock }) => {
    const cost = usdToEur(v.variantSellPrice);
    const label = v.variantKey || v.variantNameEn || "";
    const title = picked.length > 1 && label ? `${p.productNameEn} - ${label}` : p.productNameEn;
    return {
      cj_pid: p.pid,
      cj_vid: v.vid,
      sku: `CJ-${v.variantSku}`,
      title: title.slice(0, 80),
      description_html: sanitizeHtml(p.description ?? ""),
      image_urls: [v.variantImage, ...images].filter((x): x is string => !!x).slice(0, 24),
      cost_eur: cost,
      shipping_eur: shipping,
      logistic_name: freight.logisticName,
      delivery_days: freight.logisticAging,
      ship_from: shipFrom,
      cj_listed_num: p.listedNum ?? null,
      price_eur: computeSellPrice(cost, shipping, rules).price,
      stock,
      status: "draft",
      last_synced_at: new Date().toISOString(),
    };
  });

  const { data, error } = await db().from("products").upsert(rows, { onConflict: "cj_vid" }).select();
  if (error) throw error;
  return data;
}
