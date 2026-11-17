/**
 * CJ facture en USD. Taux USD→EUR fixé par variable d'env pour rester simple.
 * Mets-le un peu au-dessus du taux réel pour te couvrir des variations.
 */
export function usdToEur(usd: number): number {
  const rate = Number(process.env.USD_TO_EUR_RATE || "0.95");
  return Math.round(usd * rate * 100) / 100;
}
