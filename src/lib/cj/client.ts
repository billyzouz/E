import { requireEnv } from "@/lib/env";

/**
 * Client API CJ Dropshipping (v2.0).
 * Doc : https://developers.cjdropshipping.com/en/api/api2/
 * Les noms de champs ont été écrits sans accès direct à la doc :
 * à vérifier au premier appel réel avec ta clé.
 */
const BASE = "https://developers.cjdropshipping.com/api2.0/v1";

interface CjEnvelope<T> {
  code: number;
  result: boolean;
  message: string;
  data: T;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Limite de débit CJ : 1 requête/seconde sur le compte gratuit (code 1600200).
 * On espace tous les appels d'au moins MIN_GAP_MS, et on réessaie si CJ refuse quand même.
 */
const MIN_GAP_MS = Number(process.env.CJ_MIN_GAP_MS || "1100");
const RATE_LIMIT_CODE = 1600200;
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exécute les appels CJ un par un, espacés d'au moins MIN_GAP_MS. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      lastCallAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

async function cjRequest<T>(url: string, init: RequestInit): Promise<CjEnvelope<T>> {
  for (let attempt = 0; ; attempt++) {
    const json = await throttled(async () => (await (await fetch(url, init)).json()) as CjEnvelope<T>);
    if (json.code !== RATE_LIMIT_CODE || attempt >= 3) return json;
    await sleep(MIN_GAP_MS * (attempt + 2));
  }
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const json = await cjRequest<{ accessToken: string; accessTokenExpiryDate: string }>(
    `${BASE}/authentication/getAccessToken`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: requireEnv("CJ_API_KEY") }),
    },
  );
  if (!json.result) throw new Error(`CJ auth : ${json.message}`);
  cachedToken = { value: json.data.accessToken, expiresAt: Date.parse(json.data.accessTokenExpiryDate) };
  return cachedToken.value;
}

export async function cjFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("CJ-Access-Token", await getAccessToken());
  if (init.body) headers.set("Content-Type", "application/json");
  const json = await cjRequest<T>(`${BASE}${path}`, { ...init, headers });
  if (!json.result) throw new Error(`CJ ${path} : ${json.code} ${json.message}`);
  return json.data;
}

export interface CjVariant {
  vid: string;
  variantSku: string;
  variantNameEn: string;
  variantImage: string;
  variantSellPrice: number; // USD
  variantWeight: number; // grammes
}

export interface CjProduct {
  pid: string;
  productNameEn: string;
  productSku: string;
  productImage: string; // souvent un tableau JSON encodé en string
  productWeight: string;
  sellPrice: string;
  description: string; // HTML
  categoryName: string;
  variants: CjVariant[];
}

export function getProduct(pid: string) {
  return cjFetch<CjProduct>(`/product/query?pid=${encodeURIComponent(pid)}`);
}

/** Récupère l'ID produit depuis un lien CJ (ex …/product/xxx-p-1234ABCD.html) ou renvoie la valeur telle quelle. */
export function extractPid(input: string): string {
  const m = input.match(/-p-([A-Za-z0-9-]+)\.html/);
  return m ? m[1] : input.trim();
}

export function productImages(p: CjProduct): string[] {
  try {
    const parsed = JSON.parse(p.productImage);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* pas du JSON */
  }
  return p.productImage ? p.productImage.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/** Stock total disponible pour une variante, tous entrepôts confondus. */
export async function getVariantStock(vid: string): Promise<number> {
  const rows = await cjFetch<{ storageNum?: number; totalInventoryNum?: number }[]>(
    `/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`,
  );
  return (rows ?? []).reduce((sum, r) => sum + (r.totalInventoryNum ?? r.storageNum ?? 0), 0);
}

export interface CjFreightOption {
  logisticName: string;
  logisticPrice: number; // USD
  logisticAging: string; // ex "7-12" jours
}

export function calculateFreight(params: { fromCountry: string; toCountry: string; vid: string; quantity: number }) {
  return cjFetch<CjFreightOption[]>("/logistic/freightCalculate", {
    method: "POST",
    body: JSON.stringify({
      startCountryCode: params.fromCountry,
      endCountryCode: params.toCountry,
      products: [{ vid: params.vid, quantity: params.quantity }],
    }),
  });
}

/** Option de livraison la moins chère. */
export async function cheapestFreight(params: { fromCountry: string; toCountry: string; vid: string; quantity: number }) {
  const options = await calculateFreight(params);
  if (!options.length) throw new Error(`Aucune livraison CJ ${params.fromCountry} → ${params.toCountry}`);
  return options.reduce((a, b) => (b.logisticPrice < a.logisticPrice ? b : a));
}

export interface CjOrderInput {
  orderNumber: string; // on met l'orderId eBay : évite les doublons
  shippingCountryCode: string;
  shippingProvince?: string;
  shippingCity: string;
  shippingAddress: string;
  shippingAddress2?: string;
  shippingZip: string;
  shippingCustomerName: string;
  shippingPhone?: string;
  fromCountryCode: string;
  logisticName: string;
  products: { vid: string; quantity: number }[];
}

export function createOrder(order: CjOrderInput) {
  return cjFetch<{ orderId: string; orderNum: string }>("/shopping/order/createOrderV2", {
    method: "POST",
    body: JSON.stringify(order),
  });
}

export function getOrderDetail(cjOrderId: string) {
  return cjFetch<{ orderId: string; orderStatus: string; trackNumber?: string; logisticName?: string }>(
    `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(cjOrderId)}`,
  );
}
