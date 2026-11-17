import { describe, expect, it } from "vitest";
import type { CjProduct } from "@/lib/cj/client";
import { pickVariants, sanitizeHtml } from "./import-product";

describe("sanitizeHtml", () => {
  it("retire scripts et handlers", () => {
    const out = sanitizeHtml('<p onclick="x()">ok</p><script>alert(1)</script>');
    expect(out).toBe("<p>ok</p>");
  });
});

describe("pickVariants", () => {
  const variant = (vid: string, fr: number) => ({
    vid,
    variantSku: vid,
    variantNameEn: null,
    variantKey: vid,
    variantImage: null,
    variantSellPrice: 5,
    variantWeight: 200,
    inventories: [{ countryCode: "FR", totalInventory: fr }],
  });
  const product = { variants: [variant("a", 0), variant("b", 5), variant("c", 50)] } as unknown as CjProduct;

  it("garde les variantes en stock, les plus fournies d'abord", () => {
    expect(pickVariants(product, "FR").map((x) => x.v.vid)).toEqual(["c", "b"]);
    expect(pickVariants(product, "FR", 1)).toHaveLength(1);
    expect(pickVariants(product, "CN")).toHaveLength(0);
  });
});
