/**
 * Calcul du prix de vente eBay à partir du coût fournisseur.
 *
 * Prix = (coût produit + port + frais fixe eBay) / (1 - taux frais eBay - marge cible)
 * Ensuite arrondi au ,99 supérieur. Le bénéfice minimum en euros est garanti.
 */
export interface PricingRules {
  targetMargin: number; // ex 0.20 = 20 % du prix de vente
  ebayFeeRate: number; // ex 0.13 = 13 % du prix de vente
  ebayFixedFee: number; // ex 0.35 € par commande
  minProfit: number; // bénéfice minimum en €
}

export interface PriceBreakdown {
  price: number;
  ebayFees: number;
  cost: number;
  profit: number;
  marginRate: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function rulesFromEnv(env: Record<string, string | undefined> = process.env): PricingRules {
  const num = (key: string, fallback: number) => {
    const v = env[key];
    const n = v === undefined || v === "" ? fallback : Number(v);
    if (!Number.isFinite(n)) throw new Error(`${key} invalide : ${v}`);
    return n;
  };
  return {
    targetMargin: num("PRICING_TARGET_MARGIN", 0.2),
    ebayFeeRate: num("PRICING_EBAY_FEE_RATE", 0.13),
    ebayFixedFee: num("PRICING_EBAY_FIXED_FEE", 0.35),
    minProfit: num("PRICING_MIN_PROFIT", 3),
  };
}

export function breakdown(price: number, productCost: number, shippingCost: number, rules: PricingRules): PriceBreakdown {
  const ebayFees = round2(price * rules.ebayFeeRate + rules.ebayFixedFee);
  const cost = round2(productCost + shippingCost);
  const profit = round2(price - ebayFees - cost);
  return { price, ebayFees, cost, profit, marginRate: price > 0 ? round2(profit / price) : 0 };
}

/** Arrondit au prix "psychologique" en ,99 qui est >= au prix donné. */
export function toCharmPrice(raw: number): number {
  const candidate = Math.floor(raw) + 0.99;
  return round2(candidate >= raw ? candidate : candidate + 1);
}

export function computeSellPrice(productCost: number, shippingCost: number, rules: PricingRules): PriceBreakdown {
  if (productCost < 0 || shippingCost < 0) throw new Error("Coûts négatifs");
  const keep = 1 - rules.ebayFeeRate - rules.targetMargin;
  if (keep <= 0) throw new Error("Frais eBay + marge cible >= 100 %, impossible");

  const base = productCost + shippingCost + rules.ebayFixedFee;
  let price = toCharmPrice(base / keep);

  // Garantit le bénéfice minimum en euros.
  const minPrice = (base + rules.minProfit) / (1 - rules.ebayFeeRate);
  if (price < minPrice) price = toCharmPrice(minPrice);

  return breakdown(price, productCost, shippingCost, rules);
}
