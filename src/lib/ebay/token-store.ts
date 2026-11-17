import { db } from "@/lib/db";
import { ebayEnv } from "./config";
import { refreshUserToken, type EbayTokenResponse } from "./oauth";

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

export async function saveTokens(t: EbayTokenResponse, ebayUser = "default") {
  const { error } = await db()
    .from("ebay_accounts")
    .upsert(
      {
        ebay_user: ebayUser,
        environment: ebayEnv(),
        access_token: t.access_token,
        access_token_expires_at: inSeconds(t.expires_in),
        refresh_token: t.refresh_token,
        refresh_token_expires_at: t.refresh_token_expires_in ? inSeconds(t.refresh_token_expires_in) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ebay_user" },
    );
  if (error) throw error;
}

/** Renvoie un access token valide, en le renouvelant si besoin. */
export async function getUserAccessToken(ebayUser = "default"): Promise<string> {
  const { data, error } = await db()
    .from("ebay_accounts")
    .select("access_token, access_token_expires_at, refresh_token")
    .eq("ebay_user", ebayUser)
    .eq("environment", ebayEnv())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Aucun compte eBay connecté : va sur /api/ebay/connect");

  if (Date.parse(data.access_token_expires_at) > Date.now() + 5 * 60_000) return data.access_token;

  const fresh = await refreshUserToken(data.refresh_token);
  await db()
    .from("ebay_accounts")
    .update({
      access_token: fresh.access_token,
      access_token_expires_at: inSeconds(fresh.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq("ebay_user", ebayUser);
  return fresh.access_token;
}
