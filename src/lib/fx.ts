/**
 * Taux de change USD → devise locale (CJ facture en USD).
 * Source : taux BCE via frankfurter.app, mis en cache 12 h. Repli sur des taux fixes si l'API ne répond pas.
 * Une marge de sécurité (FX_SAFETY, 3 % par défaut) protège des variations et des frais de conversion.
 */
const FALLBACK: Record<string, number> = { USD: 1, EUR: 0.95, GBP: 0.8, AUD: 1.55, CAD: 1.4 };
const TTL_MS = 12 * 60 * 60_000;

let cache: { rates: Record<string, number>; at: number } | null = null;

export function setRatesForTest(rates: Record<string, number> | null) {
  cache = rates ? { rates, at: Date.now() } : null;
}

async function loadRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rates;
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,AUD,CAD", {
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { rates: Record<string, number> };
    cache = { rates: { USD: 1, ...json.rates }, at: Date.now() };
  } catch {
    cache = { rates: FALLBACK, at: Date.now() - TTL_MS + 10 * 60_000 }; // on réessaie dans 10 min
  }
  return cache.rates;
}

export async function usdTo(currency: string, usd: number): Promise<number> {
  const rate = (await loadRates())[currency] ?? FALLBACK[currency];
  if (!rate) throw new Error(`Devise non gérée : ${currency}`);
  const safety = 1 + Number(process.env.FX_SAFETY ?? "0.03");
  return Math.round(usd * rate * safety * 100) / 100;
}
