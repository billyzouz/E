import { describe, expect, it } from "vitest";
import type { CjSearchItem } from "@/lib/cj/client";
import { parseUsd, scoreCandidate } from "./finder";

const item = (o: Partial<CjSearchItem>): CjSearchItem => ({
  id: "x",
  nameEn: "x",
  sku: "x",
  bigImage: "",
  sellPrice: "10",
  listedNum: 0,
  warehouseInventoryNum: 0,
  ...o,
});

describe("parseUsd", () => {
  it("prend le prix le plus bas d'une fourchette", () => {
    expect(parseUsd("11.85")).toBe(11.85);
    expect(parseUsd("1.20 -- 3.40")).toBe(1.2);
    expect(parseUsd(undefined)).toBeNaN();
  });
});

describe("scoreCandidate", () => {
  it("note mieux un produit populaire, en stock et bien placé en prix", () => {
    const top = scoreCandidate(item({ listedNum: 1000, warehouseInventoryNum: 1000, verifiedWarehouse: 1 }), 12);
    const flop = scoreCandidate(item({ listedNum: 0, warehouseInventoryNum: 10 }), 80);
    expect(top).toBe(100);
    expect(flop).toBeLessThan(10);
  });
});
