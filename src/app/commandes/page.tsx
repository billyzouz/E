import { ShoppingCart } from "lucide-react";
import { Badge, Card, Empty, PageHeader, flag, money } from "@/components/ui";
import { hasDb } from "@/lib/config-status";
import { db } from "@/lib/db";
import { getMarket } from "@/lib/markets";

export const dynamic = "force-dynamic";

export default async function CommandesPage() {
  if (!hasDb()) return <PageHeader title="Commandes" subtitle="Configure Supabase dans les réglages" />;
  const { data: orders } = await db().from("orders").select("*").order("created_at", { ascending: false }).limit(200);

  return (
    <>
      <PageHeader
        title="Commandes"
        subtitle="Chaque commande eBay payée est passée chez CJ, puis le numéro de suivi est renvoyé à eBay. Toutes les 15 min."
      />
      {!orders?.length ? (
        <Empty icon={<ShoppingCart className="h-8 w-8" />} title="Aucune commande pour l'instant">
          Elles apparaîtront ici dès ta première vente.
        </Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                {["Date", "Pays", "Commande eBay", "Acheteur", "Total", "Commande CJ", "Suivi", "Statut"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {orders.map((o) => {
                let country = "";
                try {
                  country = o.marketplace ? getMarket(o.marketplace).country : "";
                } catch {
                  /* marché inconnu */
                }
                return (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-400">{new Date(o.created_at).toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3">{country ? flag(country) : "–"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">{o.ebay_order_id}</td>
                    <td className="px-4 py-3 text-zinc-300">{o.buyer ?? "–"}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{money(o.total, o.currency ?? "EUR")}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{o.cj_order_id ?? "–"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {o.tracking_number ? `${o.carrier ?? ""} ${o.tracking_number}` : "–"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={o.status} />
                      {o.last_error && <div className="mt-1 max-w-64 text-xs text-rose-400">{o.last_error}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
