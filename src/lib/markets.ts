/**
 * Marchés eBay gérés. Un seul compte vendeur peut publier sur chacun.
 * Chaque annonce est écrite dans la langue du pays et expédiée depuis l'entrepôt CJ le plus rapide.
 */
export interface Market {
  id: string; // ID marketplace eBay
  country: string; // pays des acheteurs (code ISO)
  name: string;
  currency: string;
  language: string; // Content-Language eBay
  languageName: string; // pour l'IA
  /** Entrepôts CJ testés, du plus proche au plus lointain. On garde le plus rapide qui a du stock. */
  warehouses: string[];
  fixedFee: number; // frais fixe eBay par commande, en devise locale (à ajuster selon ton compte)
}

const EU_WAREHOUSES = ["DE", "FR", "ES", "IT", "PL", "CZ", "NL", "GB", "CN"];

export const MARKETS: Market[] = [
  { id: "EBAY_US", country: "US", name: "États-Unis", currency: "USD", language: "en-US", languageName: "American English", warehouses: ["US", "CN"], fixedFee: 0.4 },
  { id: "EBAY_GB", country: "GB", name: "Royaume-Uni", currency: "GBP", language: "en-GB", languageName: "British English", warehouses: ["GB", "DE", "FR", "CN"], fixedFee: 0.3 },
  { id: "EBAY_DE", country: "DE", name: "Allemagne", currency: "EUR", language: "de-DE", languageName: "German", warehouses: EU_WAREHOUSES, fixedFee: 0.35 },
  { id: "EBAY_FR", country: "FR", name: "France", currency: "EUR", language: "fr-FR", languageName: "French", warehouses: ["FR", ...EU_WAREHOUSES.filter((w) => w !== "FR")], fixedFee: 0.35 },
  { id: "EBAY_IT", country: "IT", name: "Italie", currency: "EUR", language: "it-IT", languageName: "Italian", warehouses: ["IT", ...EU_WAREHOUSES.filter((w) => w !== "IT")], fixedFee: 0.35 },
  { id: "EBAY_ES", country: "ES", name: "Espagne", currency: "EUR", language: "es-ES", languageName: "Spanish", warehouses: ["ES", ...EU_WAREHOUSES.filter((w) => w !== "ES")], fixedFee: 0.35 },
  { id: "EBAY_AU", country: "AU", name: "Australie", currency: "AUD", language: "en-AU", languageName: "Australian English", warehouses: ["AU", "CN"], fixedFee: 0.3 },
  { id: "EBAY_CA", country: "CA", name: "Canada", currency: "CAD", language: "en-CA", languageName: "Canadian English", warehouses: ["CA", "US", "CN"], fixedFee: 0.4 },
];

export const MARKET_IDS = MARKETS.map((m) => m.id) as [string, ...string[]];

export function getMarket(id: string): Market {
  const m = MARKETS.find((x) => x.id === id);
  if (!m) throw new Error(`Marché inconnu : ${id}`);
  return m;
}

/** Marchés activés (variable ENABLED_MARKETS, ex "EBAY_US,EBAY_GB,EBAY_DE"). Tous par défaut. */
export function enabledMarkets(env: Record<string, string | undefined> = process.env): Market[] {
  const raw = env.ENABLED_MARKETS?.trim();
  if (!raw) return MARKETS;
  const ids = raw.split(",").map((s) => s.trim().toUpperCase());
  return MARKETS.filter((m) => ids.includes(m.id));
}

/** "7-12" → 12 ; "3" → 3 ; vide → Infinity. On compare toujours sur le délai max annoncé. */
export function maxDays(aging: string | null | undefined): number {
  const nums = (aging ?? "").match(/\d+/g)?.map(Number) ?? [];
  return nums.length ? Math.max(...nums) : Infinity;
}
