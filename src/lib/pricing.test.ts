import { describe, expect, it } from "vitest";
import { breakdown, computeSellPrice, toCharmPrice, type PricingRules } from "./pricing";

const rules: PricingRules = { targetMargin: 0.2, ebayFeeRate: 0.13, ebayFixedFee: 0.35, minProfit: 3 };

describe("toCharmPrice", () => {
  it("arrondit au ,99 supérieur", () => {
    expect(toCharmPrice(12.1)).toBe(12.99);
    expect(toCharmPrice(12.99)).toBe(12.99);
    expect(toCharmPrice(13)).toBe(13.99);
  });
});

describe("computeSellPrice", () => {
  it("atteint au moins la marge cible", () => {
    const r = computeSellPrice(10, 4, rules);
    expect(r.marginRate).toBeGreaterThanOrEqual(0.2);
    expect(r.profit).toBeGreaterThanOrEqual(3);
    expect(r.price.toFixed(2).endsWith("99")).toBe(true);
  });

  it("garantit le bénéfice minimum sur les petits produits", () => {
    const r = computeSellPrice(1, 1, rules);
    expect(r.profit).toBeGreaterThanOrEqual(3);
  });

  it("refuse une config impossible", () => {
    expect(() => computeSellPrice(10, 0, { ...rules, targetMargin: 0.9 })).toThrow();
  });

  it("le détail est cohérent", () => {
    const b = breakdown(29.99, 10, 4, rules);
    expect(b.ebayFees).toBe(4.25);
    expect(b.profit).toBe(11.74);
  });
});
