import { db } from "@/lib/db";
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
  if (missing.includes("SUPABASE_URL") || missing.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    return <Setup missing={missing} />;
  }

  const [{ data: products }, { data: orders }, { data: account }] = await Promise.all([
    db().from("products").select("*").order("created_at", { ascending: false }).limit(100),
    db().from("orders").select("*").order("created_at", { ascending: false }).limit(50),
    db().from("ebay_accounts").select("ebay_user, environment, updated_at").limit(1).maybeSingle(),
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
        <h2>Importer un produit CJ</h2>
        <ImportForm />
      </section>

      <section>
        <h2>Produits ({products?.length ?? 0})</h2>
        <table>
          <thead>
            <tr><th>SKU</th><th>Titre</th><th>Coût + port</th><th>Prix eBay</th><th>Stock</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.sku}</td>
                <td>{p.title}</td>
                <td>{eur(Number(p.cost_eur) + Number(p.shipping_eur))}</td>
                <td>{eur(p.price_eur)}</td>
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
