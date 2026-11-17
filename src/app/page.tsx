import Link from "next/link";
import { AlertTriangle, Boxes, Globe2, Package, ShoppingCart, Wallet } from "lucide-react";
import { Badge, Card, CardTitle, PageHeader, Stat, buttonClass, flag, money } from "@/components/ui";
import { configStatus, hasDb } from "@/lib/config-status";
import { db } from "@/lib/db";
import { enabledMarkets } from "@/lib/markets";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const missing = configStatus().filter((c) => !c.ok);
  if (!hasDb()) return <SetupBanner missing={missing.map((m) => m.label)} />;

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: listings }, { count: productCount }, { data: orders }, { data: jobs }, { data: account }] =
    await Promise.all([
      db().from("market_listings").select("marketplace, status"),
      db().from("products").select("cj_pid", { count: "exact", head: true }),
      db().from("orders").select("status, total, currency, created_at").gte("created_at", since),
      db().from("import_jobs").select("*").order("created_at", { ascending: false }).limit(4),
      db().from("ebay_accounts").select("environment").limit(1).maybeSingle(),
    ]);

  const count = (s: string) => (listings ?? []).filter((l) => l.status === s).length;
  const revenue = new Map<string, number>();
  for (const o of orders ?? []) {
    if (o.currency) revenue.set(o.currency, (revenue.get(o.currency) ?? 0) + Number(o.total ?? 0));
  }
  const toHandle = (orders ?? []).filter((o) => o.status === "manual" || o.status === "error").length;

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        subtitle="Ton activité sur les 8 marchés eBay"
        action={
          <Link href="/recherche" className={buttonClass.primary}>
            Trouver des produits
          </Link>
        }
      />

      {missing.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Il manque {missing.length} réglage{missing.length > 1 ? "s" : ""} : {missing.map((m) => m.label).join(", ")}.{" "}
            <Link href="/reglages" className="underline underline-offset-2">
              Voir les réglages
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Annonces en ligne" value={count("listed")} sub={`${count("ready")} prêtes · ${count("draft")} brouillons`} icon={<Globe2 className="h-4 w-4" />} />
        <Stat label="Produits importés" value={productCount ?? 0} sub="variantes CJ" icon={<Boxes className="h-4 w-4" />} />
        <Stat
          label="Commandes (30 j)"
          value={orders?.length ?? 0}
          sub={toHandle ? <span className="text-amber-400">{toHandle} à traiter</span> : "tout est automatique"}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <Stat
          label="Chiffre d'affaires (30 j)"
          value={revenue.size ? money([...revenue.values()][0], [...revenue.keys()][0]) : money(0)}
          sub={revenue.size > 1 ? [...revenue.entries()].slice(1).map(([c, v]) => money(v, c)).join(" · ") : "toutes devises"}
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle hint={account ? `eBay connecté (${account.environment})` : "eBay non connecté"}>Couverture par pays</CardTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {enabledMarkets().map((m) => {
              const mine = (listings ?? []).filter((l) => l.marketplace === m.id);
              const live = mine.filter((l) => l.status === "listed").length;
              return (
                <div key={m.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <span className="text-lg">{flag(m.country)}</span> {m.name}
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white tabular-nums">{live}</div>
                  <div className="text-xs text-zinc-500">en ligne · {mine.length - live} en attente</div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardTitle>Derniers imports automatiques</CardTitle>
          {jobs?.length ? (
            <ul className="space-y-3">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-zinc-200">« {j.params?.keyword || "tout le catalogue"} »</div>
                    <div className="text-xs text-zinc-500">
                      {new Date(j.created_at).toLocaleString("fr-FR")} · {j.imported}/{j.total} importés
                    </div>
                  </div>
                  <Badge status={j.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">
              Aucun import pour l&apos;instant.{" "}
              <Link href="/recherche" className="text-violet-400 hover:underline">
                Lancer une recherche
              </Link>
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle>Comment ça tourne</CardTitle>
        <ol className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Trouver", "Les produits CJ les mieux notés sur tes niches."],
            ["Importer", "Pour chaque pays, l'entrepôt CJ qui livre le plus vite est choisi."],
            ["Rédiger", "L'IA (DeepSeek via OpenRouter) écrit l'annonce dans la langue du pays."],
            ["Vendre", "Commande eBay → commande CJ → suivi renvoyé à eBay."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-violet-300">
                {i + 1}
              </span>
              <div>
                <div className="font-medium text-zinc-200">{t}</div>
                <div className="text-zinc-500">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

function SetupBanner({ missing }: { missing: string[] }) {
  return (
    <>
      <PageHeader title="Bienvenue" subtitle="Encore quelques réglages avant de démarrer" />
      <Card>
        <div className="flex items-center gap-3 text-zinc-300">
          <Package className="h-5 w-5 text-violet-400" />
          Il manque : {missing.join(", ")}.
        </div>
      </Card>
    </>
  );
}
