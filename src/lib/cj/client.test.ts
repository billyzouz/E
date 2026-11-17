import { afterEach, describe, expect, it, vi } from "vitest";

const ok = (data: unknown) => ({ code: 200, result: true, message: "Success", data });

describe("cjFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("espace les appels et réessaie en cas de limite de débit", async () => {
    process.env.CJ_API_KEY = "k";
    process.env.CJ_MIN_GAP_MS = "50";
    const calls: number[] = [];
    let productCalls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(Date.now());
      const body = url.includes("getAccessToken")
        ? ok({ accessToken: "t", accessTokenExpiryDate: "2099-01-01T00:00:00+08:00" })
        : ++productCalls === 1
          ? { code: 1600200, result: false, message: "Too Many Requests", data: null }
          : ok({ pid: "p1", productNameEn: "Dog bed", variants: [] });
      return { json: async () => body } as Response;
    });

    const { getProduct } = await import("./client");
    expect((await getProduct("p1")).productNameEn).toBe("Dog bed");
    expect(calls).toHaveLength(3);
    for (let i = 1; i < calls.length; i++) expect(calls[i] - calls[i - 1]).toBeGreaterThanOrEqual(45);
  });

  it("réutilise le token stocké au lieu d'en redemander un", async () => {
    process.env.CJ_API_KEY = "k";
    process.env.CJ_MIN_GAP_MS = "1";
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return { json: async () => ok({ pid: "p1", variants: [] }) } as Response;
    });

    const { getProduct, setTokenCache } = await import("./client");
    setTokenCache({ load: async () => ({ value: "stored", expiresAt: Date.now() + 86_400_000 }), save: async () => {} });
    await getProduct("p1");
    expect(urls.some((u) => u.includes("getAccessToken"))).toBe(false);
  });

  it("lit la recherche listV2", async () => {
    process.env.CJ_API_KEY = "k";
    process.env.CJ_MIN_GAP_MS = "1";
    let searchUrl = "";
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("listV2")) searchUrl = url;
      const data = url.includes("getAccessToken")
        ? { accessToken: "t", accessTokenExpiryDate: "2099-01-01" }
        : { totalRecords: 1, content: [{ productList: [{ id: "a", nameEn: "Hoodie", sellPrice: "9.5" }] }] };
      return { json: async () => ok(data) } as Response;
    });

    const { searchProducts } = await import("./client");
    const r = await searchProducts({ keyWord: "hoodie", countryCode: "FR", minInventory: 50 });
    expect(r.items[0].nameEn).toBe("Hoodie");
    expect(searchUrl).toContain("keyWord=hoodie");
    expect(searchUrl).toContain("countryCode=FR");
    expect(searchUrl).toContain("startWarehouseInventory=50");
    expect(searchUrl).toContain("orderBy=1");
  });
});

describe("helpers", () => {
  it("extrait le pid d'un lien CJ", async () => {
    const { extractPid } = await import("./client");
    expect(
      extractPid("https://www.cjdropshipping.com/product/dog-beds-p-C6DE90E8-E78A-4688-8CD1-2525F687A9E1.html"),
    ).toBe("C6DE90E8-E78A-4688-8CD1-2525F687A9E1");
  });

  it("compte le stock de l'entrepôt d'expédition seulement", async () => {
    const { variantStock } = await import("./client");
    const v = {
      vid: "v",
      variantSku: "s",
      variantNameEn: null,
      variantKey: null,
      variantImage: null,
      variantSellPrice: 1,
      variantWeight: 100,
      inventories: [
        { countryCode: "CN", totalInventory: 900 },
        { countryCode: "FR", totalInventory: 12 },
      ],
    };
    expect(variantStock(v, "FR")).toBe(12);
    expect(variantStock(v, "DE")).toBe(0);
  });
});
