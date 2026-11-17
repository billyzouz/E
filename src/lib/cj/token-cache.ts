import { db } from "@/lib/db";
import { setTokenCache } from "./client";

const KEY = "cj_access_token";
let installed = false;

/** Garde le token CJ dans Supabase : un seul appel d'authentification tous les ~15 jours. */
export function useDbTokenCache() {
  if (installed) return;
  installed = true;
  setTokenCache({
    async load() {
      const { data } = await db().from("app_state").select("value").eq("key", KEY).maybeSingle();
      return (data?.value as { value: string; expiresAt: number } | undefined) ?? null;
    },
    async save(token) {
      await db().from("app_state").upsert({ key: KEY, value: token, updated_at: new Date().toISOString() });
    },
  });
}
