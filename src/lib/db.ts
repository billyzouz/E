import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let client: SupabaseClient | null = null;

/** Client Supabase serveur (clé service_role). Ne jamais l'importer côté navigateur. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  }
  return client;
}
