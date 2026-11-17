import { afterEach, describe, expect, it, vi } from "vitest";
import { getMarket } from "@/lib/markets";
import { extractJson } from "./llm";
import { cleanDescription, htmlToText, writeListing } from "./listing-writer";

describe("helpers", () => {
  it("extrait le JSON d'une réponse bavarde", () => {
    expect(extractJson<{ a: number }>('Voici : {"a": 1} merci')).toEqual({ a: 1 });
  });

  it("nettoie la description générée", () => {
    const out = cleanDescription('<p>Top <a href="https://x.com">ici</a> contact@x.com https://y.fr</p><script>1</script>');
    expect(out).toBe("<p>Top ici  </p>");
  });

  it("transforme le HTML fournisseur en texte", () => {
    expect(htmlToText("<p>A<br>B</p><img src=x><p>C</p>")).toBe("A\nB\n C");
  });
});

describe("writeListing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("appelle OpenRouter et remet en forme le résultat", async () => {
    process.env.AI_API_KEY = "test";
    let sent: { model: string; reasoning: unknown } | null = null;
    let url = "";
    vi.stubGlobal("fetch", async (u: string, init: RequestInit) => {
      url = u;
      sent = JSON.parse(String(init.body));
      const content = JSON.stringify({
        title: "Hundebett rund Plüsch waschbar für kleine Hunde und Katzen – sehr weich und gemütlich",
        descriptionHtml: "<h2>Gemütlich</h2><p>Super weich.</p>",
        aspects: { Marke: "Markenlos", Material: ["Plüsch"] },
        optionNames: ["Farbe", "Größe"],
        variants: { "Grey-S": ["Grau", "S"], "Pink-M": ["Rosa", "M"] },
        categoryQuery: "Hundebett Plüsch",
      });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });

    const r = await writeListing(
      { nameEn: "Dog bed", descriptionHtml: "<p>soft</p>", optionNames: ["Color", "Size"], variantKeys: ["Grey-S", "Pink-M"] },
      getMarket("EBAY_DE"),
    );
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(sent!.model).toBe("deepseek/deepseek-v4.1-flash");
    expect(sent!.reasoning).toEqual({ effort: "none" });
    expect(r.title.length).toBeLessThanOrEqual(80);
    expect(r.aspects.Marke).toEqual(["Markenlos"]);
    expect(r.variesBy).toEqual([
      { name: "Farbe", values: ["Grau", "Rosa"] },
      { name: "Größe", values: ["S", "M"] },
    ]);
    expect(r.variantAspects["Pink-M"]).toEqual({ Farbe: ["Rosa"], Größe: ["M"] });
  });

  it("réessaie sans les options avancées si le fournisseur les refuse", async () => {
    process.env.AI_API_KEY = "test";
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      if (bodies.length === 1) return new Response("bad param", { status: 400 });
      const content = JSON.stringify({ title: "Titre de test assez long", descriptionHtml: "<p>Une description.</p>", aspects: {}, categoryQuery: "test" });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const r = await writeListing({ nameEn: "x", descriptionHtml: "", optionNames: [], variantKeys: ["a"] }, getMarket("EBAY_US"));
    expect(r.title).toBe("Titre de test assez long");
    expect(bodies[1].reasoning).toBeUndefined();
  });
});
