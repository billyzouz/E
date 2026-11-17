/** État de la configuration, affiché dans le tableau de bord. */
export interface ConfigItem {
  key: string;
  label: string;
  ok: boolean;
  group: "base" | "cj" | "ebay" | "ia";
}

const ITEMS: Omit<ConfigItem, "ok">[] = [
  { key: "SUPABASE_URL", label: "Base de données Supabase", group: "base" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Clé secrète Supabase", group: "base" },
  { key: "ADMIN_PASSWORD", label: "Mot de passe du tableau de bord", group: "base" },
  { key: "APP_URL", label: "Adresse du site", group: "base" },
  { key: "CRON_SECRET", label: "Secret des tâches planifiées", group: "base" },
  { key: "CJ_API_KEY", label: "Clé API CJ Dropshipping", group: "cj" },
  { key: "AI_API_KEY", label: "Clé OpenRouter (rédaction des annonces)", group: "ia" },
  { key: "EBAY_CLIENT_ID", label: "eBay App ID", group: "ebay" },
  { key: "EBAY_CLIENT_SECRET", label: "eBay Cert ID", group: "ebay" },
  { key: "EBAY_RUNAME", label: "eBay RuName", group: "ebay" },
];

export function configStatus(env: Record<string, string | undefined> = process.env): ConfigItem[] {
  return ITEMS.map((i) => ({ ...i, ok: !!env[i.key] }));
}

export const hasDb = () => !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
