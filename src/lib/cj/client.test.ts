import { afterEach, describe, expect, it, vi } from "vitest";

describe("cjFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("espace les appels et réessaie en cas de limite de débit", async () => {
    process.env.CJ_API_KEY = "k";
    process.env.CJ_MIN_GAP_MS = "50";
    const calls: number[] = [];
    let stockCalls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(Date.now());
      const body = url.includes("getAccessToken")
        ? { code: 200, result: true, message: "", data: { accessToken: "t", accessTokenExpiryDate: "2099-01-01" } }
        : ++stockCalls === 1
          ? { code: 1600200, result: false, message: "Too Many Requests", data: null }
          : { code: 200, result: true, message: "", data: [{ storageNum: 7 }] };
      return { json: async () => body } as Response;
    });

    const { getVariantStock } = await import("./client");
    expect(await getVariantStock("v1")).toBe(7);
    expect(calls).toHaveLength(3);
    for (let i = 1; i < calls.length; i++) expect(calls[i] - calls[i - 1]).toBeGreaterThanOrEqual(45);
  });

  it("extrait le pid d'un lien CJ", async () => {
    const { extractPid } = await import("./client");
    expect(
      extractPid("https://www.cjdropshipping.com/product/dog-beds-p-C6DE90E8-E78A-4688-8CD1-2525F687A9E1.html"),
    ).toBe("C6DE90E8-E78A-4688-8CD1-2525F687A9E1");
  });
});
