"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Play, Save } from "lucide-react";
import { Card, CardTitle, buttonClass, cx, inputClass } from "@/components/ui";
import type { AutopilotSettings, AutopilotState } from "@/lib/autopilot";

export function AutopilotPanel({ initial, state }: { initial: AutopilotSettings; state: AutopilotState }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [keywords, setKeywords] = useState(initial.keywords.join("\n"));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<string[]>(state.lastLog ?? []);

  async function save(run: boolean, next = s) {
    setBusy(run ? "run" : "save");
    setMsg(null);
    try {
      const body = { ...next, keywords: keywords.split("\n").map((k) => k.trim()).filter(Boolean) };
      const res = await fetch(`/api/autopilot${run ? "?run=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setS(json.settings);
      if (json.run?.log) setLog(json.run.log);
      setMsg({ ok: true, text: run ? "Passage terminé" : "Réglages enregistrés" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
    setBusy(null);
  }

  const num = (key: keyof AutopilotSettings, label: string, hint: string) => (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <input
        type="number"
        className={cx(inputClass, "mt-1")}
        value={String(s[key])}
        onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
      />
      <span className="mt-1 block text-[11px] text-zinc-600">{hint}</span>
    </label>
  );

  return (
    <Card className={cx(s.enabled && "border-violet-500/40")}>
      <CardTitle hint={state.lastRunAt ? `Dernier passage : ${new Date(state.lastRunAt).toLocaleString("fr-FR")}` : "Jamais lancé"}>
        <span className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-violet-400" /> Pilote automatique
        </span>
      </CardTitle>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
        <div>
          <div className="font-medium text-zinc-100">{s.enabled ? "Activé" : "Désactivé"}</div>
          <div className="text-xs text-zinc-500">
            Aujourd&apos;hui : {state.imported}/{s.importsPerDay} imports · {state.published}/{s.publishesPerDay} publications
          </div>
        </div>
        <button
          role="switch"
          aria-checked={s.enabled}
          disabled={!!busy}
          onClick={() => save(false, { ...s, enabled: !s.enabled })}
          className={cx("relative h-7 w-12 rounded-full transition", s.enabled ? "bg-accent" : "bg-zinc-700")}
        >
          <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", s.enabled ? "left-6" : "left-1")} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        {num("importsPerDay", "Produits importés / jour", "chacun préparé pour 8 pays")}
        {num("publishesPerDay", "Annonces publiées / jour", "1 annonce = 1 pays. Reste sous ta limite eBay")}
        {num("minScore", "Note minimum", "sur 100")}
        <div className="grid grid-cols-2 gap-2">
          {num("minCostUsd", "Coût min ($)", "")}
          {num("maxCostUsd", "Coût max ($)", "")}
        </div>
      </div>

      <label className="mt-4 block">
        <span className="text-xs text-zinc-400">Niches surveillées (une par ligne, en anglais), parcourues à tour de rôle</span>
        <textarea className={cx(inputClass, "mt-1 h-32 font-mono text-xs")} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={buttonClass.secondary} disabled={!!busy} onClick={() => save(false)}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
        </button>
        <button className={buttonClass.primary} disabled={!!busy || !s.enabled} onClick={() => save(true)} title={s.enabled ? "" : "Active d'abord le pilote"}>
          {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Lancer un passage maintenant
        </button>
        {msg && <span className={cx("text-sm", msg.ok ? "text-emerald-400" : "text-rose-400")}>{msg.text}</span>}
      </div>
      {busy === "run" && <p className="mt-2 text-xs text-zinc-500">Un passage peut durer jusqu&apos;à 4 minutes.</p>}

      {log.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Journal du dernier passage</div>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-950/70 p-3 text-xs leading-relaxed text-zinc-400">
            {log.join("\n")}
          </pre>
        </div>
      )}
    </Card>
  );
}
