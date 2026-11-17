import { requireEnv } from "@/lib/env";

/**
 * Client API CJ Dropshipping (v2.0).
 * Doc : https://developers.cjdropshipping.com/en/api/api2/
 */
const BASE = "https://developers.cjdropshipping.com/api2.0/v1";

interface CjEnvelope<T> {
  code: number;
  result: boolean;
  message: string;
  data: T;
}

/**
 * Limite de débit CJ : 1 requête/seconde, y compris pour le token (code 1600200).
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

/** Stockage persistant du token (Supabase), pour ne pas en redemander un à chaque démarrage. */
export interface TokenCache {
  load(): Promise<{ value: string; expiresAt: number } | null>;
  save(token: { value: string; expiresAt: number }): Promise<void>;
}

let tokenCache: TokenCache | null = null;
let memoryToken: { value: string; expiresAt: number } | null = null;

export function setTokenCache(cache: TokenCache | null) {
  tokenCache = cache;
  memoryToken = null;
}

const isFresh = (t: { expiresAt: number } | null) => !!t && t.expiresAt > Date.now() + 60 * 60_000;

async function getAccessToken(): Promise<string> {
  if (isFresh(memoryToken)) return memoryToken!.value;

  const stored = await tokenCache?.load().catch(() => null);
  if (stored && isFresh(stored)) {
    memoryToken = stored;
    return stored.value;
  }

  const json = await cjRequest<{ accessToken: string; accessTokenExpiryDate: string }>(
    `${BASE}/authentication/getAccessToken`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: requireEnv("CJ_API_KEY") }),
    },
  );
  if (!json.result) throw new Error(`CJ auth : ${json.message}`);
  memoryToken = { value: json.data.accessToken, expiresAt: Date.parse(json.data.accessTokenExpiryDate) };
  await tokenCache?.save(memoryToken).catch(() => undefined);
  return memoryToken.value;
}

export async function cjFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("CJ-Access-Token", await getAccessToken());
  if (init.body) headers.set("Content-Type", "application/json");
  const json = await cjRequest<T>(`${BASE}${path}`, { ...init, headers });
  if (!json.result) throw new Error(`CJ ${path} : ${json.code} ${json.message}`);
  return json.data;
}

// ---------- Produits ----------

export interface CjInventory {
  countryCode: string;
  totalInventory: number;
}

export interface CjVariant {
  vid: string;
  variantSku: string;
  variantNameEn: string | null;
  variantKey: string | null; // ex "Black-XXL"
  variantImage: string | null;
  variantSellPrice: number; // USD
  variantWeight: number; // grammes
  inventories?: CjInventory[];
}

export interface CjProduct {
  pid: string;
  productNameEn: string;
  productSku: string;
  bigImage: string;
  productImageSet?: string[];
  productWeight: string;
  sellPrice: string | number;
  description: string; // HTML
  categoryName: string;
  listedNum?: number;
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
  const all = [p.bigImage, ...(p.productImageSet ?? [])].filter((x): x is string => !!x);
  return [...new Set(all)];
}

/** Stock d'une variante dans l'entrepôt d'expédition (la fiche produit CJ l'inclut déjà). */
export function variantStock(v: CjVariant, shipFrom: string): number {
  return (v.inventories ?? [])
    .filter((i) => i.countryCode === shipFrom)
    .reduce((sum, i) => sum + (i.totalInventory ?? 0), 0);
}

export interface CjSearchParams {
  keyWord?: string;
  page?: number;
  size?: number; // 100 max
  countryCode?: string; // produits avec du stock dans ce pays
  startSellPrice?: number; // USD
  endSellPrice?: number; // USD
  minInventory?: number;
  orderBy?: 0 | 1 | 2 | 3 | 4; // 0 pertinence, 1 nb de boutiques qui le vendent, 2 prix, 3 date, 4 stock
  sort?: "asc" | "desc";
}

export interface CjSearchItem {
  id: string;
  nameEn: string;
  sku: string;
  bigImage: string;
  sellPrice: string; // USD, parfois une fourchette "1.20 -- 3.40"
  nowPrice?: string;
  listedNum: number;
  warehouseInventoryNum: number;
  verifiedWarehouse?: number;
  deliveryCycle?: string;
  threeCategoryName?: string;
  oneCategoryName?: string;
}

/** Recherche dans le catalogue CJ (un seul appel, jusqu'à 100 produits). */
export async function searchProducts(p: CjSearchParams): Promise<{ total: number; items: CjSearchItem[] }> {
  const q = new URLSearchParams();
  q.set("page", String(p.page ?? 1));
  q.set("size", String(Math.min(p.size ?? 50, 100)));
  if (p.keyWord) q.set("keyWord", p.keyWord);
  if (p.countryCode) q.set("countryCode", p.countryCode);
  if (p.startSellPrice !== undefined) q.set("startSellPrice", String(p.startSellPrice));
  if (p.endSellPrice !== undefined) q.set("endSellPrice", String(p.endSellPrice));
  if (p.minInventory !== undefined) q.set("startWarehouseInventory", String(p.minInventory));
  q.set("orderBy", String(p.orderBy ?? 1));
  q.set("sort", p.sort ?? "desc");
  q.append("features", "enable_category");

  const data = await cjFetch<{ totalRecords: number; content: { productList: CjSearchItem[] }[] }>(
    `/product/listV2?${q}`,
  );
  return { total: data.totalRecords, items: (data.content ?? []).flatMap((c) => c.productList ?? []) };
}

// ---------- Livraison ----------

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
  if (!options?.length) throw new Error(`Aucune livraison CJ ${params.fromCountry} → ${params.toCountry}`);
  return options.reduce((a, b) => (b.logisticPrice < a.logisticPrice ? b : a));
}

// ---------- Commandes ----------

export interface CjOrderInput {
  orderNumber: string; // on met l'orderId eBay : CJ refuse un doublon
  shippingCountryCode: string;
  shippingCountry: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  shippingAddress2?: string;
  shippingZip: string;
  shippingCustomerName: string;
  shippingPhone?: string;
  fromCountryCode: string;
  logisticName: string;
  /** 2 = payé automatiquement avec le solde CJ, 3 = créée sans paiement (à payer à la main) */
  payType: 2 | 3;
  remark?: string;
  products: { vid: string; quantity: number; storeLineItemId?: string }[];
}

export function createOrder(order: CjOrderInput) {
  return cjFetch<{ orderId: string; orderStatus?: string; interceptOrderReasons?: { code: number; message: string }[] }>(
    "/shopping/order/createOrderV2",
    { method: "POST", headers: { platformToken: "" }, body: JSON.stringify(order) },
  );
}

export function getOrderDetail(cjOrderId: string) {
  return cjFetch<{ orderId: string; orderStatus: string; trackNumber?: string | null; logisticName?: string | null }>(
    `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(cjOrderId)}`,
  );
}
