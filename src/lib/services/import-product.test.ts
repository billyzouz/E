import { describe, expect, it } from "vitest";
import type { CjFreightOption, CjProduct } from "@/lib/cj/client";
import { getMarket } from "@/lib/markets";
import { chooseWarehouse, pickVariants, sanitizeHtml } from "./import-product";

describe("sanitizeHtml", () => {
  it("retire scripts et handlers", () => {
    expect(sanitizeHtml('<p onclick="x()">ok</p><script>alert(1)</script>')).toBe("<p>ok</p>");
  });
});

const variant = (vid: string, inv: Record<string, number>, weight = 200) => ({
  vid,
  variantSku: vid,
  variantNameEn: null,
  variantKey: vid,
  variantImage: null,
  variantSellPrice: 5,
  variantWeight: weight,
  inventories: Object.entries(inv).map(([countryCode, totalInventory]) => ({ countryCode, totalInventory })),
});

describe("pickVariants", () => {
  const product = { variants: [variant("a", {}), variant("b", { CN: 5 }), variant("c", { CN: 40, US: 10 })] } as unknown as CjProduct;

  it("garde les variantes en stock quelque part, les plus fournies d'abord", () => {
    expect(pickVariants(product).map((x) => x.v.vid)).toEqual(["c", "b"]);
    expect(pickVariants(product, 1)).toHaveLength(1);
  });
});

describe("chooseWarehouse", () => {
  const product = {
    variants: [variant("light", { CN: 100, US: 3 }, 100), variant("heavy", { CN: 100 }, 900)],
  } as unknown as CjProduct;
  const picked = pickVariants(product);
  const quotes: Record<string, CjFreightOption> = {
    US: { logisticName: "USPS", logisticPrice: 6, logisticAging: "2-5" },
    CN: { logisticName: "CJPacket", logisticPrice: 3, logisticAging: "8-15" },
  };
  const asked: string[] = [];
  const quote = async (from: string, vid: string) => {
    asked.push(`${from}:${vid}`);
    return quotes[from] ?? null;
  };

  it("prend l'entrepôt le plus rapide, même plus cher", async () => {
    const c = await chooseWarehouse(getMarket("EBAY_US"), picked, quote, 20);
    expect(c?.shipFrom).toBe("US");
    expect(c?.variants.map((x) => x.v.vid)).toEqual(["light"]); // seule variante en stock aux US
  });

  it("calcule le port sur la variante la plus lourde de l'entrepôt", () => {
    expect(asked).toContain("CN:heavy");
  });

  it("écarte les entrepôts trop lents", async () => {
    const c = await chooseWarehouse(getMarket("EBAY_AU"), picked, quote, 10);
    expect(c).toBeNull();
  });
});
