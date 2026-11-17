import { CheckCircle2, CircleDashed, ExternalLink } from "lucide-react";
import { Card, CardTitle, PageHeader, buttonClass, flag } from "@/components/ui";
import { configStatus, hasDb } from "@/lib/config-status";
import { db } from "@/lib/db";
import { MARKETS, enabledMarkets } from "@/lib/markets";
import { rulesFromEnv } from "@/lib/pricing";
import { loadSettings, loadState } from "@/lib/autopilot";
import { AutopilotPanel } from "./autopilot-panel";

export const dynamic = "force-dynamic";

const GROUPS: Record<string, string> = {
  base: "Base",
  cj: "CJ Dropshipping",
  ia: "Intelligence artificielle",
  ebay: "eBay",
};

export default async function ReglagesPage() {
  const status = configStatus();
  const enabled = new Set(enabledMarkets().map((m) => m.id));
  const rules = rulesFromEnv();
  const account = hasDb() ? (await db().from("ebay_accounts").select("environment, updated_at").limit(1).maybeSingle()).data : null;
  const ebayReady = status.filter((s) => s.group === "ebay").every((s) => s.ok);
  const [autopilot, autopilotState] = hasDb() ? await Promise.all([loadSettings(), loadState()]) : [null, null];

  return (
    <>
      <PageHeader
        title="Réglages"
        subtitle="Les clés se mettent dans Vercel → Settings → Environment Variables, puis il faut redéployer."
      />

      {autopilot && autopilotState && (
        <div className="mb-6">
          <AutopilotPanel initial={autopilot} state={autopilotState} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Configuration</CardTitle>
          <div className="space-y-5">
            {Object.entries(GROUPS).map(([group, label]) => (
              <div key={group}>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</div>
                <ul className="space-y-1.5">
                  {status
                    .filter((s) => s.group === group)
                    .map((s) => (
                      <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 text-zinc-300">
                          {s.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <CircleDashed className="h-4 w-4 text-zinc-600" />}
                          {s.label}
                        </span>
                        <code className="text-xs text-zinc-500">{s.key}</code>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardTitle>Compte eBay</CardTitle>
            {account ? (
              <p className="text-sm text-emerald-400">
                Connecté ({account.environment}) · token mis à jour le {new Date(account.updated_at).toLocaleString("fr-FR")}
              </p>
            ) : (
              <p className="text-sm text-zinc-400">Pas encore connecté.</p>
            )}
            <a
              href={ebayReady ? "/api/ebay/connect" : undefined}
              aria-disabled={!ebayReady}
              className={`${buttonClass.secondary} mt-4 ${ebayReady ? "" : "pointer-events-none opacity-50"}`}
            >
              <ExternalLink className="h-4 w-4" /> {account ? "Reconnecter" : "Connecter mon compte eBay"}
            </a>
            {!ebayReady && <p className="mt-2 text-xs text-zinc-500">Ajoute d&apos;abord les 3 clés eBay.</p>}
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              Sur chaque pays où tu vends, crée une fois dans le Seller Hub une politique de livraison, de paiement et de retours.
              L&apos;appli les retrouve toute seule (elle prend celle dont le nom contient « auto », sinon la première).
            </p>
          </Card>

          <Card>
            <CardTitle hint="variable ENABLED_MARKETS">Pays actifs</CardTitle>
            <div className="grid grid-cols-2 gap-2">
              {MARKETS.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    enabled.has(m.id) ? "border-zinc-700 text-zinc-200" : "border-zinc-800 text-zinc-600 line-through"
                  }`}
                >
                  <span>{flag(m.country)}</span> {m.name} <span className="ml-auto text-xs text-zinc-500">{m.currency}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Règles de prix</CardTitle>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-zinc-500">Marge visée</dt>
              <dd className="text-right text-zinc-200">{Math.round(rules.targetMargin * 100)} % du prix</dd>
              <dt className="text-zinc-500">Frais eBay estimés</dt>
              <dd className="text-right text-zinc-200">{Math.round(rules.ebayFeeRate * 100)} % + frais fixe du pays</dd>
              <dt className="text-zinc-500">Bénéfice minimum</dt>
              <dd className="text-right text-zinc-200">{rules.minProfit} (devise du pays)</dd>
              <dt className="text-zinc-500">Délai max accepté</dt>
              <dd className="text-right text-zinc-200">{process.env.MAX_DELIVERY_DAYS || "20"} jours</dd>
              <dt className="text-zinc-500">Paiement auto CJ</dt>
              <dd className="text-right text-zinc-200">{process.env.CJ_AUTO_PAY === "true" ? "Activé" : "Désactivé"}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
