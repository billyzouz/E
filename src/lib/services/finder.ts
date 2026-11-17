import { db } from "@/lib/db";
import { searchProducts, type CjSearchItem } from "@/lib/cj/client";
import { usdToEur } from "@/lib/cj/currency";
import { useDbTokenCache } from "@/lib/cj/token-cache";
import { importCjProduct } from "./import-product";

export interface FinderParams {
  keyword?: string;
  shipFrom?: string; // entrepôt CJ : FR/DE = livraison rapide en Europe, CN = moins cher mais lent
  minCostEur?: number;
  maxCostEur?: number;
  minStock?: number;
  limit?: number;
}

export interface Candidate {
  pid: string;
  name: string;
  image: string;
  costEur: number;
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
 * Note sur 100 d'un produit CJ, sans données eBay pour l'instant :
 * - popularité : nombre de boutiques qui le vendent déjà (preuve de demande), en log
 * - stock confortable (évite les ruptures)
 * - coût dans la zone où la marge eBay est la plus facile (5–25 €)
 * - stock vérifié par CJ
 */
export function scoreCandidate(item: CjSearchItem, costEur: number): number {
  const popularity = Math.min(Math.log10((item.listedNum ?? 0) + 1) / 3, 1) * 50; // 1000 boutiques = max
  const stock = Math.min((item.warehouseInventoryNum ?? 0) / 500, 1) * 20;
  const price = costEur >= 5 && costEur <= 25 ? 20 : costEur >= 2 && costEur <= 40 ? 10 : 0;
  const verified = item.verifiedWarehouse === 1 ? 10 : 0;
  return Math.round(popularity + stock + price + verified);
}

/** Cherche dans le catalogue CJ et classe les produits. Un seul appel CJ. */
export async function findCandidates(p: FinderParams): Promise<Candidate[]> {
  useDbTokenCache();
  const usdRate = usdToEur(1) || 0.95;
  const { items } = await searchProducts({
    keyWord: p.keyword || undefined,
    countryCode: p.shipFrom || undefined,
    startSellPrice: p.minCostEur !== undefined ? +(p.minCostEur / usdRate).toFixed(2) : undefined,
    endSellPrice: p.maxCostEur !== undefined ? +(p.maxCostEur / usdRate).toFixed(2) : undefined,
    minInventory: p.minStock ?? 50,
    orderBy: 1, // les plus vendus par d'autres boutiques d'abord
    size: 100,
  });

  const { data: existing } = await db().from("products").select("cj_pid");
  const imported = new Set((existing ?? []).map((r) => r.cj_pid));

  return items
    .map((item) => {
      const costEur = usdToEur(parseUsd(item.nowPrice || item.sellPrice));
      return {
        pid: item.id,
        name: item.nameEn,
        image: item.bigImage,
        costEur,
        listedNum: item.listedNum ?? 0,
        stock: item.warehouseInventoryNum ?? 0,
        category: item.threeCategoryName || item.oneCategoryName || "",
        deliveryDays: item.deliveryCycle ?? null,
        score: scoreCandidate(item, costEur),
        alreadyImported: imported.has(item.id),
      };
    })
    .filter((c) => Number.isFinite(c.costEur))
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

/** Importe en brouillon les `count` meilleurs produits pas encore importés. Peut prendre une minute. */
export async function runAutoImport(jobId: string, params: FinderParams & { count: number }) {
  const log: string[] = [];
  let imported = 0;
  let failed = 0;
  try {
    const picks = (await findCandidates(params)).filter((c) => !c.alreadyImported).slice(0, params.count);
    await updateJob(jobId, { total: picks.length });

    for (const c of picks) {
      try {
        const rows = await importCjProduct(c.pid, { shipFrom: params.shipFrom });
        imported++;
        log.push(`OK  ${c.name} (${rows?.length ?? 0} variante(s), note ${c.score})`);
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
