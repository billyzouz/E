"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Rocket, Search, Sparkles, Store, Warehouse } from "lucide-react";
import { Badge, Card, CardTitle, Empty, buttonClass, cx, inputClass } from "@/components/ui";
import type { Region } from "@/lib/niches";
import type { Candidate } from "@/lib/services/finder";

const WAREHOUSES = [
  { code: "", label: "Tous les entrepôts" },
  { code: "US", label: "États-Unis" },
  { code: "GB", label: "Royaume-Uni" },
  { code: "DE", label: "Allemagne" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Espagne" },
  { code: "IT", label: "Italie" },
  { code: "AU", label: "Australie" },
  { code: "CN", label: "Chine" },
];

interface Job {
  id: string;
  status: string;
  total: number;
  imported: number;
  failed: number;
  log: string[];
  params: { keyword?: string };
  created_at: string;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
  return json as T;
}

export function Finder({ regions }: { regions: Region[] }) {
  const [regionId, setRegionId] = useState(regions[0].id);
  const [keyword, setKeyword] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [minCost, setMinCost] = useState("3");
  const [maxCost, setMaxCost] = useState("35");
  const [count, setCount] = useState(10);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const region = regions.find((r) => r.id === regionId)!;
  const params = () => ({
    keyword: keyword || undefined,
    warehouse,
    minCostUsd: minCost === "" ? undefined : Number(minCost),
    maxCostUsd: maxCost === "" ? undefined : Number(maxCost),
  });

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/finder/jobs");
    if (res.ok) setJobs((await res.json()).jobs ?? []);
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!jobs.some((j) => j.status === "running")) return;
    const t = setInterval(loadJobs, 4000);
    return () => clearInterval(t);
  }, [jobs, loadJobs]);

  async function search(kw = keyword) {
    setBusy("search");
    setMsg(null);
    try {
      const { candidates } = await post<{ candidates: Candidate[] }>("/api/finder", { ...params(), keyword: kw || undefined });
      setResults(candidates);
      if (!candidates.length) setMsg({ ok: false, text: "Aucun produit : élargis la fourchette de prix ou change de mot-clé." });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
    setBusy(null);
  }

  async function autoImport() {
    setBusy("auto");
    setMsg(null);
    try {
      await post("/api/finder/auto", { ...params(), count });
      setMsg({ ok: true, text: "Import lancé en arrière-plan. Tu peux quitter la page : suivi ci-dessous." });
      loadJobs();
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
    setBusy(null);
  }

  async function importOne(c: Candidate) {
    setBusy(c.pid);
    setMsg(null);
    try {
      const r = await post<{ markets: { marketplace: string; status: string }[] }>("/api/products/import", { link: c.pid });
      const ok = r.markets.filter((m) => m.status === "draft").length;
      setMsg({ ok: true, text: `« ${c.name} » importé pour ${ok} pays sur ${r.markets.length}.` });
      setResults((rs) => rs?.map((x) => (x.pid === c.pid ? { ...x, alreadyImported: true } : x)) ?? null);
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle hint={region.markets.map((m) => m.replace("EBAY_", "")).join(" · ")}>Niches par région</CardTitle>
        <div className="mb-4 flex flex-wrap gap-2">
          {regions.map((r) => (
            <button
              key={r.id}
              onClick={() => setRegionId(r.id)}
              className={cx(
                "rounded-full px-3.5 py-1.5 text-sm transition",
                r.id === regionId ? "bg-accent text-white" : "bg-zinc-800/70 text-zinc-300 hover:bg-zinc-800",
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
        <p className="mb-3 text-sm text-zinc-500">{region.why}</p>
        <div className="flex flex-wrap gap-2">
          {region.niches.map((n) => (
            <button
              key={n.keyword}
              disabled={!!busy}
              onClick={() => {
                setKeyword(n.keyword);
                search(n.keyword);
              }}
              className={cx(
                "rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50",
                keyword === n.keyword
                  ? "border-violet-500/60 bg-accent-soft text-violet-200"
                  : "border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/60",
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
          className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px_auto_auto]"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              className={cx(inputClass, "pl-9")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Mot-clé en anglais (vide = tout le catalogue)"
            />
          </div>
          <select className={inputClass} value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            {WAREHOUSES.map((w) => (
              <option key={w.code} value={w.code}>
                {w.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <input className={cx(inputClass, "w-16! text-center")} value={minCost} onChange={(e) => setMinCost(e.target.value)} />
            à
            <input className={cx(inputClass, "w-16! text-center")} value={maxCost} onChange={(e) => setMaxCost(e.target.value)} />$
          </div>
          <button className={buttonClass.primary} disabled={!!busy}>
            {busy === "search" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Chercher
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
          <button className={buttonClass.secondary} disabled={!!busy} onClick={autoImport}>
            {busy === "auto" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4 text-violet-400" />}
            Importer automatiquement les {count} meilleurs
          </button>
          <div className="flex gap-1">
            {[5, 10, 20].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={cx("rounded-lg px-2.5 py-1 text-xs", n === count ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300")}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="text-xs text-zinc-500">Import + entrepôt le plus rapide par pays + annonces rédigées par l&apos;IA</span>
        </div>
        {msg && <p className={cx("mt-3 text-sm", msg.ok ? "text-emerald-400" : "text-rose-400")}>{msg.text}</p>}
      </Card>

      {jobs.length > 0 && (
        <Card>
          <CardTitle>Imports automatiques</CardTitle>
          <div className="space-y-3">
            {jobs.map((j) => (
              <details key={j.id} className="group rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-300">
                    « {j.params?.keyword || "tout le catalogue"} » ·{" "}
                    <span className="text-zinc-500">{new Date(j.created_at).toLocaleTimeString("fr-FR")}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400 tabular-nums">
                      {j.imported}/{j.total}
                      {j.failed ? ` · ${j.failed} échecs` : ""}
                    </span>
                    {j.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />}
                    <Badge status={j.status} />
                  </span>
                </summary>
                {j.total > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full bg-accent transition-all" style={{ width: `${((j.imported + j.failed) / j.total) * 100}%` }} />
                  </div>
                )}
                <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">{(j.log ?? []).join("\n") || "Démarrage…"}</pre>
              </details>
            ))}
          </div>
        </Card>
      )}

      {results === null ? (
        <Empty icon={<Sparkles className="h-8 w-8" />} title="Choisis une niche ou tape un mot-clé">
          Les produits sont classés par note sur 100. Plus il y a de boutiques qui vendent déjà le produit, plus la demande est prouvée.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((c) => (
            <div key={c.pid} className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 transition hover:border-zinc-700">
              <div className="relative aspect-square bg-zinc-950">
                {c.image && <img src={c.image} alt="" className="h-full w-full object-cover" loading="lazy" />}
                <div
                  className={cx(
                    "absolute left-3 top-3 rounded-lg px-2 py-1 text-xs font-semibold backdrop-blur",
                    c.score >= 75 ? "bg-emerald-500/80 text-white" : c.score >= 50 ? "bg-amber-500/80 text-white" : "bg-zinc-800/80 text-zinc-200",
                  )}
                >
                  {c.score}/100
                </div>
              </div>
              <div className="p-4">
                <div className="line-clamp-2 min-h-10 text-sm font-medium text-zinc-200">{c.name}</div>
                <div className="mt-1 truncate text-xs text-zinc-500">{c.category}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                  <span className="text-base font-semibold text-white">{c.costUsd.toFixed(2)} $</span>
                  <span className="flex items-center gap-1" title="Boutiques qui vendent déjà ce produit">
                    <Store className="h-3.5 w-3.5" /> {c.listedNum}
                  </span>
                  <span className="flex items-center gap-1" title="Stock CJ">
                    <Warehouse className="h-3.5 w-3.5" /> {c.stock}
                  </span>
                </div>
                <button
                  className={cx(c.alreadyImported ? buttonClass.secondary : buttonClass.primary, "mt-4 w-full")}
                  disabled={!!busy || c.alreadyImported}
                  onClick={() => importOne(c)}
                >
                  {c.alreadyImported ? (
                    <>
                      <Check className="h-4 w-4" /> Importé
                    </>
                  ) : busy === c.pid ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Import (8 pays)…
                    </>
                  ) : (
                    "Importer"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
