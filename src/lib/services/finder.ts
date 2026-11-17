import { db } from "@/lib/db";
import { searchProducts, type CjSearchItem } from "@/lib/cj/client";
import { useDbTokenCache } from "@/lib/cj/token-cache";
import { importCjProduct } from "./import-product";
import { prepareListing } from "./publish-listing";

export interface FinderParams {
  keyword?: string;
  warehouse?: string; // limiter aux produits stockés dans ce pays (vide = tous)
  minCostUsd?: number;
  maxCostUsd?: number;
  minStock?: number;
  limit?: number;
}

export interface Candidate {
  pid: string;
  name: string;
  image: string;
  costUsd: number;
  listedNum: number;
  stock: number;
  category: string;
  deliveryDays: string | null;
  score: number;
  alreadyImported: boolean;
}

/** "11.85" ou "1.20 -- 3.40" → prix le plus bas en USD. */
export function parseUsd(price: string | undefined): number {
  const nums = (price ?? "").match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  return nums.length ? Math.min(...nums) : NaN;
}

/**
 * Note sur 100 d'un produit CJ :
 * - popularité : nombre de boutiques qui le vendent déjà (preuve de demande), en log
 * - stock confortable (évite les ruptures)
 * - coût dans la zone où la marge eBay est la plus facile (5–28 $)
 * - stock vérifié par CJ
 */
export function scoreCandidate(item: CjSearchItem, costUsd: number): number {
  const popularity = Math.min(Math.log10((item.listedNum ?? 0) + 1) / 3, 1) * 50; // 1000 boutiques = max
  const stock = Math.min((item.warehouseInventoryNum ?? 0) / 500, 1) * 20;
  const price = costUsd >= 5 && costUsd <= 28 ? 20 : costUsd >= 2 && costUsd <= 45 ? 10 : 0;
  const verified = item.verifiedWarehouse === 1 ? 10 : 0;
  return Math.round(popularity + stock + price + verified);
}

/** Cherche dans le catalogue CJ et classe les produits. Un seul appel CJ. */
export async function findCandidates(p: FinderParams): Promise<Candidate[]> {
  useDbTokenCache();
  const { items } = await searchProducts({
    keyWord: p.keyword || undefined,
    countryCode: p.warehouse || undefined,
    startSellPrice: p.minCostUsd,
    endSellPrice: p.maxCostUsd,
    minInventory: p.minStock ?? 50,
    orderBy: 1, // les plus vendus par d'autres boutiques d'abord
    size: 100,
  });

  const { data: existing } = await db().from("products").select("cj_pid");
  const imported = new Set((existing ?? []).map((r) => r.cj_pid));

  return items
    .map((item) => {
      const costUsd = parseUsd(item.nowPrice || item.sellPrice);
      return {
        pid: item.id,
        name: item.nameEn,
        image: item.bigImage,
        costUsd,
        listedNum: item.listedNum ?? 0,
        stock: item.warehouseInventoryNum ?? 0,
        category: item.threeCategoryName || item.oneCategoryName || "",
        deliveryDays: item.deliveryCycle ?? null,
        score: scoreCandidate(item, costUsd),
        alreadyImported: imported.has(item.id),
      };
    })
    .filter((c) => Number.isFinite(c.costUsd))
    .sort((a, b) => b.score - a.score)
    .slice(0, p.limit ?? 50);
}

async function updateJob(id: string, patch: Record<string, unknown>) {
  await db()
    .from("import_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Crée la trace d'un import automatique (affichée dans le tableau de bord). */
export async function createJob(params: FinderParams & { count: number }) {
  const { data, error } = await db().from("import_jobs").insert({ params }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

/** Si la clé DeepSeek est configurée, l'IA rédige les annonces des pays retenus. */
async function writeListingsFor(pid: string, log: string[]) {
  if (!process.env.DEEPSEEK_API_KEY) return;
  const { data: drafts } = await db().from("market_listings").select("id, marketplace").eq("cj_pid", pid).eq("status", "draft");
  for (const d of drafts ?? []) {
    try {
      await prepareListing(d.id);
    } catch (e) {
      log.push(`    IA ${d.marketplace} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** Importe les `count` meilleurs produits pas encore importés, pour tous les pays activés. */
export async function runAutoImport(jobId: string, params: FinderParams & { count: number }) {
  const log: string[] = [];
  let imported = 0;
  let failed = 0;
  try {
    const picks = (await findCandidates(params)).filter((c) => !c.alreadyImported).slice(0, params.count);
    await updateJob(jobId, { total: picks.length });

    for (const c of picks) {
      try {
        const r = await importCjProduct(c.pid);
        const ok = r.markets.filter((m) => m.status === "draft");
        imported++;
        log.push(
          `OK  ${c.name} (note ${c.score}) → ${ok.length} pays : ${ok.map((m) => `${m.marketplace.replace("EBAY_", "")} depuis ${m.shipFrom} ${m.deliveryDays} j`).join(", ") || "aucun"}`,
        );
        await writeListingsFor(c.pid, log);
      } catch (e) {
        failed++;
        log.push(`KO  ${c.name} : ${e instanceof Error ? e.message : String(e)}`);
      }
      await updateJob(jobId, { imported, failed, log });
    }
    await updateJob(jobId, { status: "done", imported, failed, log });
  } catch (e) {
    log.push(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    await updateJob(jobId, { status: "error", imported, failed, log });
  }
}
