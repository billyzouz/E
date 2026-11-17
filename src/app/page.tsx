import { db } from "@/lib/db";
import { breakdown, rulesFromEnv } from "@/lib/pricing";
import { Finder } from "./finder";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

const REQUIRED = [
  "ADMIN_PASSWORD",
  "APP_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_RUNAME",
  "CJ_API_KEY",
  "CRON_SECRET",
];

const eur = (n: number | string | null) => (n === null ? "-" : `${Number(n).toFixed(2)} €`);

export default async function Dashboard() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  const rules = rulesFromEnv();
  if (missing.includes("SUPABASE_URL") || missing.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    return <Setup missing={missing} />;
  }

  const [{ data: products }, { data: orders }, { data: account }, { data: jobs }] = await Promise.all([
    db().from("products").select("*").order("created_at", { ascending: false }).limit(200),
    db().from("orders").select("*").order("created_at", { ascending: false }).limit(50),
    db().from("ebay_accounts").select("ebay_user, environment, updated_at").limit(1).maybeSingle(),
    db().from("import_jobs").select("*").order("created_at", { ascending: false }).limit(5),
  ]);

  return (
    <main>
      <h1>Tableau de bord</h1>
      {missing.length > 0 && <Setup missing={missing} />}

      <section>
        <h2>Compte eBay</h2>
        {account ? (
          <p className="ok">Connecté ({account.environment})</p>
        ) : (
          <p>
            <span className="ko">Non connecté</span> : <a href="/api/ebay/connect">connecter mon compte eBay</a>
          </p>
        )}
      </section>

      <section>
        <h2>Trouver des produits</h2>
        <p className="muted">
          Classés par note : nombre de boutiques qui les vendent déjà (preuve de demande), stock, prix d&apos;achat.
          Les données de ventes eBay s&apos;ajouteront quand ton compte eBay sera connecté.
        </p>
        <Finder />
      </section>

      {jobs && jobs.length > 0 && (
        <section>
          <h2>Imports automatiques</h2>
          {jobs.map((j) => (
            <details key={j.id}>
              <summary>
                {new Date(j.created_at).toLocaleString("fr-FR")} · « {j.params?.keyword || "tout le catalogue"} » ·{" "}
                <span className="badge">{j.status === "running" ? "en cours" : j.status === "done" ? "terminé" : "erreur"}</span>{" "}
                {j.imported}/{j.total} importés{j.failed ? `, ${j.failed} échecs` : ""}
              </summary>
              <pre className="log">{(j.log ?? []).join("\n") || "…"}</pre>
            </details>
          ))}
        </section>
      )}

      <section>
        <h2>Importer un produit CJ par lien</h2>
        <ImportForm />
      </section>

      <section>
        <h2>Produits ({products?.length ?? 0})</h2>
        <table>
          <thead>
            <tr><th></th><th>Titre</th><th>Coût + port</th><th>Prix eBay</th><th>Bénéfice</th><th>Livraison</th><th>Stock</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.image_urls?.[0] && <img src={p.image_urls[0]} alt="" width={40} height={40} style={{ objectFit: "cover" }} />}</td>
                <td>{p.title}<div className="muted">{p.sku}</div></td>
                <td>{eur(Number(p.cost_eur) + Number(p.shipping_eur))}</td>
                <td>{eur(p.price_eur)}</td>
                <td>{eur(breakdown(Number(p.price_eur), Number(p.cost_eur), Number(p.shipping_eur), rules).profit)}</td>
                <td>{p.ship_from} · {p.delivery_days ? `${p.delivery_days} j` : "-"}</td>
                <td>{p.stock}</td>
                <td><span className="badge">{p.status}</span>{p.last_error && <div className="ko muted">{p.last_error}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Commandes ({orders?.length ?? 0})</h2>
        <table>
          <thead>
            <tr><th>Commande eBay</th><th>Acheteur</th><th>Total</th><th>Commande CJ</th><th>Suivi</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id}>
                <td>{o.ebay_order_id}</td>
                <td>{o.buyer}</td>
                <td>{eur(o.total_eur)}</td>
                <td>{o.cj_order_id ?? "-"}</td>
                <td>{o.tracking_number ?? "-"}</td>
                <td><span className="badge">{o.status}</span>{o.last_error && <div className="ko muted">{o.last_error}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Setup({ missing }: { missing: string[] }) {
  return (
    <section>
      <h2>Configuration incomplète</h2>
      <p>Variables d&apos;environnement manquantes (voir <code>.env.example</code>) :</p>
      <ul>{missing.map((k) => <li key={k}><code>{k}</code></li>)}</ul>
    </section>
  );
}
