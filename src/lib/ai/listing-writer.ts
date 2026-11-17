import { z } from "zod";
import type { Market } from "@/lib/markets";
import { chatJson } from "./llm";

export interface ListingSource {
  nameEn: string;
  descriptionHtml: string;
  optionNames: string[]; // ex ["Color", "Size"]
  variantKeys: string[]; // ex ["Black-XL", "Red-M"]
}

const Output = z.object({
  title: z.string().min(10),
  descriptionHtml: z.string().min(20),
  aspects: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  optionNames: z.array(z.string()).default([]),
  variants: z.record(z.string(), z.array(z.string())).default({}),
  categoryQuery: z.string().min(2),
});

export type WrittenListing = {
  title: string;
  descriptionHtml: string;
  aspects: Record<string, string[]>;
  /** options traduites, ex [{ name: "Farbe", values: ["Schwarz", "Rot"] }] */
  variesBy: { name: string; values: string[] }[];
  /** variant_key CJ → aspects traduits de cette variante, ex { "Black-XL": { Farbe: ["Schwarz"], Größe: ["XL"] } } */
  variantAspects: Record<string, Record<string, string[]>>;
  categoryQuery: string;
};

/** Texte brut d'un HTML fournisseur, raccourci pour l'IA. */
export function htmlToText(html: string, max = 5000): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, max);
}

/** Retire de la description générée tout ce qu'eBay interdit (liens, scripts, contacts). */
export function cleanDescription(html: string): string {
  return html
    .replace(/<(script|style|iframe|form)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/https?:\/\/[^\s<>"']+/gi, "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "");
}

const SYSTEM = `You write high-converting eBay listings for a dropshipping store.
Return ONLY a JSON object, no other text.
Rules:
- Write everything in the requested language, natural and native, never a literal translation.
- title: max 80 characters, most important search keywords first, no ALL CAPS words, no emojis, no "free shipping", no brand names unless the product is genuinely that brand (use "compatible with" wording for accessories).
- descriptionHtml: clean HTML using only <h2>, <p>, <ul>, <li>, <strong>. Benefits first, then specifications, then what is in the box. No links, no contact details, no shipping or delivery promises, no medical or safety claims you cannot prove.
- aspects: eBay item specifics in the target language with the exact aspect names eBay uses on that site (e.g. on eBay.de "Marke", "Farbe"; on eBay.com "Brand", "Color"). Always include the brand aspect set to the local word for unbranded/generic (e.g. "Unbranded", "Markenlos", "Sans marque", "Senza marca", "Sin marca"). Add material, type, features when known. Do NOT include the variation options here.
- optionNames: the variation option names translated into the eBay aspect names of that site, same order as given.
- variants: for each source variant key, the translated option values in the same order as optionNames.
- categoryQuery: 2 to 5 words in the target language describing the product, used to find the eBay category.`;

export async function writeListing(src: ListingSource, market: Market): Promise<WrittenListing> {
  const user = JSON.stringify({
    targetSite: market.id,
    language: market.languageName,
    productName: src.nameEn,
    supplierDescription: htmlToText(src.descriptionHtml),
    optionNames: src.optionNames,
    variantKeys: src.variantKeys,
  });

  const raw = Output.parse(await chatJson<unknown>(SYSTEM, user));

  const aspects: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw.aspects)) {
    const values = (Array.isArray(v) ? v : [v]).map((x) => x.trim().slice(0, 65)).filter(Boolean);
    if (k.trim() && values.length) aspects[k.trim().slice(0, 40)] = values;
  }

  const names = src.optionNames.length > 1 || src.variantKeys.length > 1 ? raw.optionNames : [];
  const variantAspects: Record<string, Record<string, string[]>> = {};
  const valuesByName = new Map<string, Set<string>>(names.map((n) => [n, new Set<string>()]));
  for (const key of src.variantKeys) {
    const values = raw.variants[key] ?? key.split("-");
    variantAspects[key] = {};
    names.forEach((name, i) => {
      const value = (values[i] ?? values[values.length - 1] ?? key).slice(0, 65);
      variantAspects[key][name] = [value];
      valuesByName.get(name)!.add(value);
    });
  }

  return {
    title: raw.title.replace(/\s+/g, " ").trim().slice(0, 80),
    descriptionHtml: cleanDescription(raw.descriptionHtml),
    aspects,
    variesBy: names.map((name) => ({ name, values: [...valuesByName.get(name)!] })),
    variantAspects,
    categoryQuery: raw.categoryQuery,
  };
}
