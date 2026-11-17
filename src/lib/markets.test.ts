import { describe, expect, it } from "vitest";
import { enabledMarkets, getMarket, maxDays } from "./markets";

describe("markets", () => {
  it("lit le délai max", () => {
    expect(maxDays("7-12")).toBe(12);
    expect(maxDays("3")).toBe(3);
    expect(maxDays(null)).toBe(Infinity);
  });

  it("filtre les marchés activés", () => {
    expect(enabledMarkets({ ENABLED_MARKETS: "ebay_us, EBAY_DE" }).map((m) => m.id)).toEqual(["EBAY_US", "EBAY_DE"]);
    expect(enabledMarkets({}).length).toBe(8);
  });

  it("met l'entrepôt local en premier", () => {
    expect(getMarket("EBAY_FR").warehouses[0]).toBe("FR");
    expect(getMarket("EBAY_US").warehouses[0]).toBe("US");
  });
});
