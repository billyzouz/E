"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Candidate } from "@/lib/services/finder";

const WAREHOUSES = [
  { code: "CN", label: "Chine (moins cher, 7–20 j)" },
  { code: "FR", label: "France (rapide)" },
  { code: "DE", label: "Allemagne (rapide)" },
  { code: "ES", label: "Espagne (rapide)" },
];

export function Finder() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [shipFrom, setShipFrom] = useState("CN");
  const [minCost, setMinCost] = useState("3");
  const [maxCost, setMaxCost] = useState("30");
  const [count, setCount] = useState("10");
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const params = () => ({
    keyword: keyword || undefined,
    shipFrom,
    minCostEur: minCost === "" ? undefined : Number(minCost),
    maxCostEur: maxCost === "" ? undefined : Number(maxCost),
  });

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
    return json;
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy("search");
    setMsg(null);
    try {
      const { candidates } = await post("/api/finder", params());
      setResults(candidates);
      if (!candidates.length) setMsg("Aucun produit trouvé : élargis la fourchette de prix ou change de mot-clé.");
    } catch (err) {
      setMsg(String(err));
    }
    setBusy(null);
  }

  async function autoImport() {
    setBusy("auto");
    setMsg(null);
    try {
      await post("/api/finder/auto", { ...params(), count: Number(count) });
      setMsg("Import lancé en arrière-plan : suis l'avancement dans « Imports automatiques » (recharge la page).");
      router.refresh();
    } catch (err) {
      setMsg(String(err));
    }
    setBusy(null);
  }

  async function importOne(c: Candidate) {
    setBusy(c.pid);
    setMsg(null);
    try {
      const { products } = await post("/api/products/import", { link: c.pid, shipFrom });
      setMsg(`« ${c.name} » importé (${products.length} variante(s))`);
      setResults((r) => r?.map((x) => (x.pid === c.pid ? { ...x, alreadyImported: true } : x)) ?? null);
      router.refresh();
    } catch (err) {
      setMsg(String(err));
    }
    setBusy(null);
  }

  return (
    <>
      <form onSubmit={search} className="finder-form">
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Mot-clé en anglais (ex : dog bed, phone holder) — vide = tout le catalogue" />
        <select value={shipFrom} onChange={(e) => setShipFrom(e.target.value)}>
          {WAREHOUSES.map((w) => <option key={w.code} value={w.code}>{w.label}</option>)}
        </select>
        <label>Coût de <input className="num" value={minCost} onChange={(e) => setMinCost(e.target.value)} /> à <input className="num" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} /> €</label>
        <button disabled={!!busy}>{busy === "search" ? "Recherche…" : "Chercher"}</button>
      </form>
      <p>
        <button type="button" disabled={!!busy} onClick={autoImport}>
          {busy === "auto" ? "Lancement…" : `Importer automatiquement les ${count} meilleurs`}
        </button>{" "}
        <select value={count} onChange={(e) => setCount(e.target.value)}>
          {["5", "10", "20"].map((n) => <option key={n}>{n}</option>)}
        </select>
      </p>
      {msg && <p>{msg}</p>}

      {results && results.length > 0 && (
        <table>
          <thead>
            <tr><th></th><th>Produit</th><th>Coût</th><th title="Nombre de boutiques qui vendent déjà ce produit">Boutiques</th><th>Stock</th><th>Note</th><th></th></tr>
          </thead>
          <tbody>
            {results.map((c) => (
              <tr key={c.pid}>
                <td>{c.image && <img src={c.image} alt="" width={48} height={48} style={{ objectFit: "cover" }} />}</td>
                <td>{c.name}<div className="muted">{c.category}</div></td>
                <td>{c.costEur.toFixed(2)} €</td>
                <td>{c.listedNum}</td>
                <td>{c.stock}</td>
                <td><strong>{c.score}</strong>/100</td>
                <td>
                  {c.alreadyImported ? (
                    <span className="badge">importé</span>
                  ) : (
                    <button type="button" disabled={!!busy} onClick={() => importOne(c)}>
                      {busy === c.pid ? "…" : "Importer"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
