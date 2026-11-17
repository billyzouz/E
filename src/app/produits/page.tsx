import { Package } from "lucide-react";
import { Badge, Card, Empty, PageHeader, flag, money } from "@/components/ui";
import { hasDb } from "@/lib/config-status";
import { db } from "@/lib/db";
import { getMarket } from "@/lib/markets";
import { breakdown, rulesFromEnv } from "@/lib/pricing";
import { ImportByLink, ListingActions } from "./actions";

export const dynamic = "force-dynamic";

interface Offer {
  price: number;
  cost: number;
  shipping_cost: number;
  currency: string;
  quantity: number;
}

export default async function ProduitsPage() {
  if (!hasDb()) return <PageHeader title="Produits & annonces" subtitle="Configure Supabase dans les réglages" />;

  const [{ data: products }, { data: listings }] = await Promise.all([
    db().from("products").select("cj_pid, name_en, image_urls, cost_usd, cj_listed_num, created_at").order("created_at", { ascending: false }),
    db().from("market_listings").select("*, offers:market_offers(price, cost, shipping_cost, currency, quantity)"),
  ]);

  // Une entrée par produit CJ (les variantes sont regroupées)
  const groups = new Map<string, { name: string; image?: string; variants: number; minCost: number; listedNum: number | null }>();
  for (const p of products ?? []) {
    const g = groups.get(p.cj_pid);
    if (g) {
      g.variants++;
      g.minCost = Math.min(g.minCost, Number(p.cost_usd));
    } else {
      groups.set(p.cj_pid, { name: p.name_en, image: p.image_urls?.[0], variants: 1, minCost: Number(p.cost_usd), listedNum: p.cj_listed_num });
    }
  }
  const rules = rulesFromEnv();

  return (
    <>
      <PageHeader
        title="Produits & annonces"
        subtitle={`${groups.size} produits · une annonce par pays, rédigée dans la langue du pays`}
        action={<ImportByLink />}
      />

      {groups.size === 0 ? (
        <Empty icon={<Package className="h-8 w-8" />} title="Aucun produit">
          Va dans « Trouver des produits » ou colle un lien CJ en haut à droite.
        </Empty>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([pid, g]) => {
            const mine = (listings ?? [])
              .filter((l) => l.cj_pid === pid)
              .sort((a, b) => a.marketplace.localeCompare(b.marketplace));
            return (
              <Card key={pid} className="p-0">
                <div className="flex items-center gap-4 border-b border-zinc-800 p-4">
                  {g.image && <img src={g.image} alt="" className="h-14 w-14 rounded-xl object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-zinc-100">{g.name}</div>
                    <div className="text-xs text-zinc-500">
                      {g.variants} variante{g.variants > 1 ? "s" : ""} · dès {g.minCost.toFixed(2)} $ chez CJ
                      {g.listedNum ? ` · vendu par ${g.listedNum} boutiques` : ""}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Pays</th>
                        <th className="px-4 py-2.5 font-medium">Statut</th>
                        <th className="px-4 py-2.5 font-medium">Expédié depuis</th>
                        <th className="px-4 py-2.5 font-medium">Prix</th>
                        <th className="px-4 py-2.5 font-medium">Bénéfice / vente</th>
                        <th className="px-4 py-2.5 font-medium">Titre</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {mine.map((l) => {
                        const m = getMarket(l.marketplace);
                        const offers = (l.offers ?? []) as Offer[];
                        const prices = offers.map((o) => Number(o.price));
                        const profits = offers.map((o) => breakdown(Number(o.price), Number(o.cost), Number(o.shipping_cost), { ...rules, ebayFixedFee: m.fixedFee }).profit);
                        return (
                          <tr key={l.id} className="align-top">
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className="mr-1.5">{flag(m.country)}</span>
                              {m.name}
                            </td>
                            <td className="px-4 py-3">
                              <Badge status={l.status} />
                              {l.last_error && <div className="mt-1 max-w-56 text-xs text-rose-400">{l.last_error}</div>}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                              {flag(l.ship_from)} {l.ship_from} · {l.delivery_days} j
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-200">
                              {prices.length ? money(Math.min(...prices), m.currency) : "–"}
                              {prices.length > 1 && Math.max(...prices) !== Math.min(...prices) && (
                                <span className="text-zinc-500"> – {money(Math.max(...prices), m.currency)}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-emerald-400">
                              {profits.length ? money(Math.min(...profits), m.currency) : "–"}
                            </td>
                            <td className="max-w-xs px-4 py-3 text-zinc-400">
                              <span className="line-clamp-2">{l.title ?? <em className="text-zinc-600">à rédiger par l&apos;IA</em>}</span>
                            </td>
                            <td className="px-4 py-3">
                              <ListingActions id={l.id} status={l.status} hasTitle={!!l.title} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
