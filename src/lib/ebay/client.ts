import { ebayHosts, marketplace } from "./config";

export class EbayApiError extends Error {
  constructor(public status: number, public body: unknown, path: string) {
    super(`eBay API ${status} sur ${path} : ${JSON.stringify(body)}`);
  }
}

/** Appel générique à l'API REST eBay avec un access token. */
export async function ebayFetch<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");
  headers.set("Content-Language", marketplace().contentLanguage);
  headers.set("X-EBAY-C-MARKETPLACE-ID", marketplace().id);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(new URL(path, ebayHosts().api), { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new EbayApiError(res.status, body, path);
  return body as T;
}
