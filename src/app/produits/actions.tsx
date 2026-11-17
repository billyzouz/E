"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Send, Sparkles } from "lucide-react";
import { buttonClass, cx, inputClass } from "@/components/ui";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
  return json;
}

export function ListingActions({ id, status, hasTitle }: { id: string; status: string; hasTitle: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(action: "prepare" | "publish") {
    setBusy(action);
    setErr(null);
    try {
      await post("/api/products/publish", { listingId: id, action });
    } catch (e) {
      setErr(String(e));
    }
    setBusy(null);
    router.refresh();
  }

  if (status === "skipped") return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <button className={buttonClass.ghost} disabled={!!busy} onClick={() => run("prepare")} title="L'IA rédige l'annonce">
          {busy === "prepare" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-violet-400" />}
          {hasTitle ? "Réécrire" : "Rédiger"}
        </button>
        {status !== "listed" && (
          <button className={buttonClass.ghost} disabled={!!busy} onClick={() => run("publish")} title="Mettre en ligne sur eBay">
            {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-emerald-400" />}
            Publier
          </button>
        )}
      </div>
      {err && <span className="max-w-56 text-right text-xs text-rose-400">{err}</span>}
    </div>
  );
}

export function ImportByLink() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await post("/api/products/import", { link });
      const ok = r.markets.filter((m: { status: string }) => m.status === "draft").length;
      setMsg({ ok: true, text: `Importé pour ${ok} pays sur ${r.markets.length}` });
      setLink("");
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button className={buttonClass.secondary} onClick={() => setOpen(true)}>
        <Link2 className="h-4 w-4" /> Importer par lien CJ
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center">
      <input className={inputClass} autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://cjdropshipping.com/product/…-p-XXXX.html" />
      <button className={cx(buttonClass.primary, "shrink-0")} disabled={busy || !link}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Importer
      </button>
      {msg && <span className={cx("text-xs", msg.ok ? "text-emerald-400" : "text-rose-400")}>{msg.text}</span>}
    </form>
  );
}
