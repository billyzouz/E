import { beforeEach, describe, expect, it, vi } from "vitest";

/** Fausse base Supabase en mémoire, juste ce qu'utilise le pilote. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function query(table: string) {
  const rows = () => (tables[table] ??= []);
  const filters: ((r: Row) => boolean)[] = [];
  let action: "select" | "delete" = "select";
  let limitN = Infinity;
  const run = () => rows().filter((r) => filters.every((f) => f(r)));
  const builder = {
    select: () => builder,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), builder),
    lt: (k: string, v: string) => (filters.push((r) => String(r[k]) < v), builder),
    order: () => builder,
    limit: (n: number) => ((limitN = n), builder),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    delete: () => ((action = "delete"), builder),
    insert: async (row: Row) => {
      if (rows().some((r) => r.key === row.key)) return { error: { message: "duplicate key" } };
      rows().push({ updated_at: new Date().toISOString(), ...row });
      return { error: null };
    },
    upsert: async (row: Row) => {
      const i = rows().findIndex((r) => r.key === row.key);
      if (i >= 0) rows()[i] = row;
      else rows().push(row);
      return { error: null };
    },
    then: (resolve: (v: { data: Row[] | null; error: null }) => void) => {
      if (action === "delete") {
        const keep = rows().filter((r) => !filters.every((f) => f(r)));
        tables[table] = keep;
        return resolve({ data: null, error: null });
      }
      return resolve({ data: run().slice(0, limitN), error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/db", () => ({ db: () => ({ from: query }) }));
vi.mock("@/lib/services/finder", () => ({ findCandidates: vi.fn() }));
vi.mock("@/lib/services/import-product", () => ({ importCjProduct: vi.fn() }));
vi.mock("@/lib/services/publish-listing", () => ({ prepareListing: vi.fn(), publishListing: vi.fn() }));

const { runAutopilot, saveSettings, loadState } = await import("./autopilot");

const deps = () => ({
  publish: vi.fn(async () => ({ ebayListingId: "1" })),
  prepare: vi.fn(async () => ({ title: "t" })),
  find: vi.fn(async () => [
    { pid: "old", name: "Déjà là", score: 95, alreadyImported: true },
    { pid: "low", name: "Mauvais", score: 40, alreadyImported: false },
    { pid: "new", name: "Lampe", score: 88, alreadyImported: false },
  ]) as never,
  importProduct: vi.fn(async () => ({ markets: [{ status: "draft" }, { status: "skipped" }] })) as never,
  ebayConnected: async () => true,
  aiConfigured: () => true,
  now: Date.now,
});

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.market_listings = [
    { id: "r1", status: "ready", marketplace: "EBAY_DE", title: "A" },
    { id: "r2", status: "ready", marketplace: "EBAY_US", title: "B" },
    { id: "r3", status: "ready", marketplace: "EBAY_FR", title: "C" },
    { id: "d1", status: "draft", marketplace: "EBAY_IT" },
  ];
});

describe("runAutopilot", () => {
  it("ne fait rien tant qu'il est désactivé", async () => {
    const d = deps();
    const r = await runAutopilot(60_000, d);
    expect(r.ran).toBe(false);
    expect(d.publish).not.toHaveBeenCalled();
  });

  it("publie dans la limite du quota, rédige les brouillons et importe le meilleur produit neuf", async () => {
    await saveSettings({ enabled: true, publishesPerDay: 2, importsPerDay: 1, minScore: 70, keywords: ["led strip", "dog bed"] });
    const d = deps();
    const r = await runAutopilot(240_000, d);

    expect(r.ran).toBe(true);
    expect(d.publish).toHaveBeenCalledTimes(2); // quota de 2, alors que 3 annonces sont prêtes
    expect(d.prepare).toHaveBeenCalledWith("d1");
    expect(d.importProduct).toHaveBeenCalledWith("new"); // ni le déjà importé, ni la note trop basse

    const state = await loadState();
    expect(state.published).toBe(2);
    expect(state.imported).toBe(1);
    expect(state.keywordIndex).toBe(1); // prochaine niche : "dog bed"
  });

  it("respecte le quota du jour sur plusieurs passages", async () => {
    await saveSettings({ enabled: true, publishesPerDay: 2, importsPerDay: 1, keywords: ["led strip"] });
    await runAutopilot(240_000, deps());
    const d = deps();
    await runAutopilot(240_000, d);
    expect(d.publish).not.toHaveBeenCalled();
    expect(d.importProduct).not.toHaveBeenCalled();
  });

  it("refuse un second passage simultané", async () => {
    await saveSettings({ enabled: true, keywords: ["lamp"] });
    tables.app_state.push({ key: "autopilot_lock", value: {}, updated_at: new Date().toISOString() });
    const r = await runAutopilot(60_000, deps());
    expect(r.ran).toBe(false);
    expect(r.log[0]).toMatch(/déjà en cours/);
  });

  it("attend le compte eBay pour publier", async () => {
    await saveSettings({ enabled: true, keywords: ["lamp"] });
    const d = { ...deps(), ebayConnected: async () => false };
    const r = await runAutopilot(240_000, d);
    expect(d.publish).not.toHaveBeenCalled();
    expect(r.log).toContain("Publication : en attente du compte eBay");
  });
});
