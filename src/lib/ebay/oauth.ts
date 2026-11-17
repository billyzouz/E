import { EBAY_USER_SCOPES, ebayCredentials, ebayHosts } from "./config";

export interface EbayTokenResponse {
  access_token: string;
  expires_in: number; // secondes
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type: string;
}

function basicAuth() {
  const { clientId, clientSecret } = ebayCredentials();
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

/** URL vers laquelle on envoie le vendeur pour qu'il autorise l'appli. */
export function buildConsentUrl(state: string): string {
  const { clientId, ruName } = ebayCredentials();
  const url = new URL("/oauth2/authorize", ebayHosts().auth);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", EBAY_USER_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(body: Record<string, string>): Promise<EbayTokenResponse> {
  const res = await fetch(new URL("/identity/v1/oauth2/token", ebayHosts().api), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`eBay OAuth ${res.status} : ${JSON.stringify(json)}`);
  return json as EbayTokenResponse;
}

/** Échange le code reçu au retour du consentement contre des tokens. */
export function exchangeCode(code: string) {
  const { ruName } = ebayCredentials();
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: ruName });
}

/** Renouvelle l'access token (valable ~2 h) avec le refresh token (valable ~18 mois). */
export function refreshUserToken(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, scope: EBAY_USER_SCOPES.join(" ") });
}

/** Token "application" (sans vendeur), pour les API publiques comme la taxonomie ou Browse. */
export function appToken() {
  return tokenRequest({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" });
}
