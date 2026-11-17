"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ImportForm() {
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(`Erreur : ${json.error}`);
    setMsg(`${json.products.length} variante(s) importée(s) en brouillon`);
    setLink("");
    router.refresh();
  }

  return (
    <>
      <form onSubmit={submit}>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Lien ou ID produit CJ Dropshipping" />
        <button disabled={busy || !link}>{busy ? "Import…" : "Importer"}</button>
      </form>
      {msg && <p>{msg}</p>}
    </>
  );
}
