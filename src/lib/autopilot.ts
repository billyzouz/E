import { z } from "zod";
import { db } from "@/lib/db";
import { REGIONS } from "@/lib/niches";
import { findCandidates } from "@/lib/services/finder";
import { importCjProduct } from "@/lib/services/import-product";
import { prepareListing, publishListing } from "@/lib/services/publish-listing";

/**
 * Pilote automatique : à chaque passage (déclenché par le planificateur), dans la limite du temps et des quotas :
 *   1. publie sur eBay les annonces prêtes (quota par jour, pour respecter les limites du compte eBay)
 *   2. fait rédiger par l'IA les annonces en brouillon
 *   3. importe le meilleur produit de la niche suivante (rotation sur toutes les niches)
 */

export const AutopilotSettings = z.object({
  enabled: z.boolean().default(false),
  keywords: z.array(z.string().trim().min(2).max(60)).max(100).default([]),
  importsPerDay: z.coerce.number().int().min(0).max(50).default(5),
  publishesPerDay: z.coerce.number().int().min(0).max(200).default(5),
  minScore: z.coerce.number().int().min(0).max(100).default(70),
  minCostUsd: z.coerce.number().min(0).default(3),
  maxCostUsd: z.coerce.number().min(0).default(35),
});
export type AutopilotSettings = z.infer<typeof AutopilotSettings>;

export interface AutopilotState {
  day: string; // AAAA-MM-JJ (UTC) des compteurs
  imported: number;
  published: number;
  keywordIndex: number;
  lastRunAt: string | null;
  lastLog: string[];
}

const SETTINGS_KEY = "autopilot_settings";
const STATE_KEY = "autopilot_state";

/** Toutes les niches de départ, sans doublon. */
export const DEFAULT_KEYWORDS = [...new Set(REGIONS.flatMap((r) => r.niches.map((n) => n.keyword)))];

const today = () => new Date().toISOString().slice(0, 10);

async function getValue<T>(key: string): Promise<T | null> {
  const { data } = await db().from("app_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

async function setValue(key: string, value: unknown) {
  const { error } = await db().from("app_state").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function loadSettings(): Promise<AutopilotSettings> {
  const stored = await getValue<Partial<AutopilotSettings>>(SETTINGS_KEY);
  const s = AutopilotSettings.parse(stored ?? {});
  return { ...s, keywords: s.keywords.length ? s.keywords : DEFAULT_KEYWORDS };
}

export async function saveSettings(input: unknown) {
  const s = AutopilotSettings.parse(input);
  await setValue(SETTINGS_KEY, s);
  return s;
}

export async function loadState(): Promise<AutopilotState> {
  const s = await getValue<AutopilotState>(STATE_KEY);
  const fresh: AutopilotState = { day: today(), imported: 0, published: 0, keywordIndex: 0, lastRunAt: null, lastLog: [] };
  if (!s) return fresh;
  // Nouveau jour : on remet les compteurs à zéro mais on garde la position dans les niches
  return s.day === today() ? s : { ...fresh, keywordIndex: s.keywordIndex, lastRunAt: s.lastRunAt, lastLog: s.lastLog };
}

const ebayReady = async () => {
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET || !process.env.EBAY_RUNAME) return false;
  const { data } = await db().from("ebay_accounts").select("id").limit(1).maybeSingle();
  return !!data;
};

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export interface RunDeps {
  publish: typeof publishListing;
  prepare: typeof prepareListing;
  find: typeof findCandidates;
  importProduct: typeof importCjProduct;
  ebayConnected: () => Promise<boolean>;
  aiConfigured: () => boolean;
  now: () => number;
}

const defaultDeps: RunDeps = {
  publish: publishListing,
  prepare: prepareListing,
  find: findCandidates,
  importProduct: importCjProduct,
  ebayConnected: ebayReady,
  aiConfigured: () => !!process.env.AI_API_KEY,
  now: Date.now,
};

const LOCK_KEY = "autopilot_lock";

/** Verrou : un seul passage à la fois (la clé primaire empêche deux verrous). Expire après 6 min. */
async function acquireLock(): Promise<boolean> {
  const staleBefore = new Date(Date.now() - 6 * 60_000).toISOString();
  await db().from("app_state").delete().eq("key", LOCK_KEY).lt("updated_at", staleBefore);
  const { error } = await db().from("app_state").insert({ key: LOCK_KEY, value: { at: new Date().toISOString() } });
  return !error;
}

const releaseLock = async () => {
  await db().from("app_state").delete().eq("key", LOCK_KEY);
};

/**
 * Un passage du pilote. S'arrête avant `budgetMs` pour rester sous la limite de durée de Vercel.
 * Renvoie le journal du passage.
 */
export async function runAutopilot(budgetMs = 240_000, deps: RunDeps = defaultDeps) {
  const settings = await loadSettings();
  if (!settings.enabled) return { ran: false, log: ["Pilote automatique désactivé"] };
  if (!(await acquireLock())) return { ran: false, log: ["Un passage est déjà en cours"] };
  try {
    return await runLocked(settings, budgetMs, deps);
  } finally {
    await releaseLock();
  }
}

async function runLocked(settings: AutopilotSettings, budgetMs: number, deps: RunDeps) {
  const state = await loadState();
  const log: string[] = [];
  const deadline = deps.now() + budgetMs;
  const timeLeft = (reserveMs: number) => deadline - deps.now() > reserveMs;

  // 1. Publier les annonces prêtes
  if (state.published >= settings.publishesPerDay) {
    log.push(`Publication : quota du jour atteint (${state.published}/${settings.publishesPerDay})`);
  } else if (!(await deps.ebayConnected())) {
    log.push("Publication : en attente du compte eBay");
  } else {
    const { data: ready } = await db()
      .from("market_listings")
      .select("id, marketplace, title")
      .eq("status", "ready")
      .order("created_at", { ascending: true })
      .limit(settings.publishesPerDay - state.published);
    for (const l of ready ?? []) {
      if (!timeLeft(60_000)) break;
      try {
        await deps.publish(l.id);
        state.published++;
        log.push(`Publié ${l.marketplace} : ${l.title}`);
      } catch (e) {
        log.push(`Échec publication ${l.marketplace} : ${errText(e)}`);
      }
    }
  }

  // 2. Rédiger les brouillons avec l'IA
  if (!deps.aiConfigured()) {
    log.push("Rédaction : clé IA manquante");
  } else {
    const { data: drafts } = await db()
      .from("market_listings")
      .select("id, marketplace")
      .eq("status", "draft")
      .order("created_at", { ascending: true })
      .limit(16);
    let written = 0;
    for (const d of drafts ?? []) {
      if (!timeLeft(45_000)) break;
      try {
        await deps.prepare(d.id);
        written++;
      } catch (e) {
        log.push(`Échec rédaction ${d.marketplace} : ${errText(e)}`);
      }
    }
    if (written) log.push(`Rédaction : ${written} annonce(s) écrite(s) par l'IA`);
  }

  // 3. Importer le meilleur produit de la niche suivante
  if (state.imported >= settings.importsPerDay) {
    log.push(`Import : quota du jour atteint (${state.imported}/${settings.importsPerDay})`);
  } else if (timeLeft(40_000) && settings.keywords.length) {
    // On essaie quelques niches si la première ne donne rien de neuf
    for (let tries = 0; tries < Math.min(3, settings.keywords.length) && timeLeft(40_000); tries++) {
      const keyword = settings.keywords[state.keywordIndex % settings.keywords.length];
      state.keywordIndex++;
      try {
        const candidates = await deps.find({
          keyword,
          minCostUsd: settings.minCostUsd,
          maxCostUsd: settings.maxCostUsd,
          limit: 50,
        });
        const pick = candidates.find((c) => !c.alreadyImported && c.score >= settings.minScore);
        if (!pick) {
          log.push(`Import « ${keyword} » : rien de neuf au-dessus de ${settings.minScore}/100`);
          continue;
        }
        const r = await deps.importProduct(pick.pid);
        const countries = r.markets.filter((m) => m.status === "draft").length;
        state.imported++;
        log.push(`Importé « ${keyword} » : ${pick.name} (note ${pick.score}, ${countries} pays)`);
        break;
      } catch (e) {
        log.push(`Échec import « ${keyword} » : ${errText(e)}`);
      }
    }
  }

  state.lastRunAt = new Date().toISOString();
  state.lastLog = log;
  await setValue(STATE_KEY, state);
  return { ran: true, log, state };
}
