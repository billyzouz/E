import { requireEnv } from "@/lib/env";

export type EbayEnv = "sandbox" | "production";

export function ebayEnv(): EbayEnv {
  return process.env.EBAY_ENV === "production" ? "production" : "sandbox";
}

export function ebayHosts(env: EbayEnv = ebayEnv()) {
  return env === "production"
    ? { api: "https://api.ebay.com", auth: "https://auth.ebay.com" }
    : { api: "https://api.sandbox.ebay.com", auth: "https://auth.sandbox.ebay.com" };
}

/** Droits demandés au vendeur lors de la connexion OAuth. */
export const EBAY_USER_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
];

export function ebayCredentials() {
  return {
    clientId: requireEnv("EBAY_CLIENT_ID"),
    clientSecret: requireEnv("EBAY_CLIENT_SECRET"),
    ruName: requireEnv("EBAY_RUNAME"),
  };
}
