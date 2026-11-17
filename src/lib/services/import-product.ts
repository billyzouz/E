import { db } from "@/lib/db";
import { cheapestFreight, extractPid, getProduct, getVariantStock, productImages } from "@/lib/cj/client";
import { usdToEur } from "@/lib/cj/currency";
import { computeSellPrice, rulesFromEnv } from "@/lib/pricing";

/** Nettoie le HTML fournisseur : retire scripts, styles, iframes et attributs d'événements. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "");
}

/**
 * Importe un produit CJ (lien ou pid) en brouillon : une ligne par variante,
 * avec le prix de vente déjà calculé. Rien n'est publié sur eBay à ce stade.
 */
export async function importCjProduct(linkOrPid: string, shipTo = "FR") {
  const pid = extractPid(linkOrPid);
  const p = await getProduct(pid);
  const rules = rulesFromEnv();
  const fromCountry = process.env.CJ_FROM_COUNTRY || "CN";
  const images = productImages(p);

  const rows = [];
  for (const v of p.variants) {
    const freight = await cheapestFreight({ fromCountry, toCountry: shipTo, vid: v.vid, quantity: 1 });
    const cost = usdToEur(v.variantSellPrice);
    const shipping = usdToEur(freight.logisticPrice);
    const price = computeSellPrice(cost, shipping, rules);
    const stock = await getVariantStock(v.vid);
    const title = p.variants.length > 1 ? `${p.productNameEn} - ${v.variantNameEn}` : p.productNameEn;

    rows.push({
      cj_pid: p.pid,
      cj_vid: v.vid,
      sku: `CJ-${v.variantSku}`,
      title: title.slice(0, 80),
      description_html: sanitizeHtml(p.description),
      image_urls: [v.variantImage, ...images].filter(Boolean).slice(0, 24),
      cost_eur: cost,
      shipping_eur: shipping,
      logistic_name: freight.logisticName,
      price_eur: price.price,
      stock,
      status: "draft",
      last_synced_at: new Date().toISOString(),
    });
  }

  const { data, error } = await db().from("products").upsert(rows, { onConflict: "cj_vid" }).select();
  if (error) throw error;
  return data;
}
