import { ebayHosts } from "./config";

export class EbayApiError extends Error {
  constructor(public status: number, public body: unknown, path: string) {
    super(`eBay API ${status} sur ${path} : ${JSON.stringify(body)}`);
  }
}

export interface EbayCallOptions extends RequestInit {
  /** Marché visé (EBAY_DE…) et sa langue : eBay en a besoin pour les annonces et les politiques. */
  marketplaceId?: string;
  contentLanguage?: string;
}

/** Appel générique à l'API REST eBay avec un access token. */
export async function ebayFetch<T>(accessToken: string, path: string, init: EbayCallOptions = {}): Promise<T> {
  const { marketplaceId, contentLanguage, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");
  if (contentLanguage) headers.set("Content-Language", contentLanguage);
  if (marketplaceId) headers.set("X-EBAY-C-MARKETPLACE-ID", marketplaceId);
  if (rest.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(new URL(path, ebayHosts().api), { ...rest, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new EbayApiError(res.status, body, path);
  return body as T;
}
