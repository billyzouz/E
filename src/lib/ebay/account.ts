import { db } from "@/lib/db";
import type { Market } from "@/lib/markets";
import { EbayApiError, ebayFetch } from "./client";

/**
 * Politiques vendeur (livraison, paiement, retours) : elles se créent une fois par pays dans le Seller Hub eBay.
 * L'appli les retrouve toute seule : elle prend celle dont le nom contient "auto" si elle existe, sinon la première.
 */
export async function getPolicies(token: string, m: Market) {
  const q = `marketplace_id=${m.id}`;
  const [f, p, r] = await Promise.all([
    ebayFetch<{ fulfillmentPolicies?: { fulfillmentPolicyId: string; name: string }[] }>(
      token,
      `/sell/account/v1/fulfillment_policy?${q}`,
    ),
    ebayFetch<{ paymentPolicies?: { paymentPolicyId: string; name: string }[] }>(token, `/sell/account/v1/payment_policy?${q}`),
    ebayFetch<{ returnPolicies?: { returnPolicyId: string; name: string }[] }>(token, `/sell/account/v1/return_policy?${q}`),
  ]);
  const pick = <T extends { name: string }>(list: T[] | undefined) =>
    list?.find((x) => /auto/i.test(x.name)) ?? list?.[0];

  const fulfillment = pick(f.fulfillmentPolicies);
  const payment = pick(p.paymentPolicies);
  const ret = pick(r.returnPolicies);
  if (!fulfillment || !payment || !ret) {
    throw new Error(
      `Politiques vendeur manquantes sur ${m.name} (${m.id}) : crée livraison, paiement et retours dans le Seller Hub de ce pays`,
    );
  }
  return {
    fulfillmentPolicyId: fulfillment.fulfillmentPolicyId,
    paymentPolicyId: payment.paymentPolicyId,
    returnPolicyId: ret.returnPolicyId,
  };
}

/** Adresse générique de chaque entrepôt CJ : eBay exige que le lieu d'expédition affiché soit le vrai pays. */
const WAREHOUSE_ADDRESS: Record<string, { city: string; postalCode: string; stateOrProvince?: string }> = {
  CN: { city: "Shenzhen", postalCode: "518000", stateOrProvince: "Guangdong" },
  US: { city: "Chino", postalCode: "91710", stateOrProvince: "CA" },
  GB: { city: "Birmingham", postalCode: "B1 1AA" },
  DE: { city: "Frankfurt am Main", postalCode: "60311" },
  FR: { city: "Paris", postalCode: "75001" },
  ES: { city: "Madrid", postalCode: "28001" },
  IT: { city: "Milano", postalCode: "20121" },
  PL: { city: "Warszawa", postalCode: "00-001" },
  CZ: { city: "Praha", postalCode: "11000" },
  NL: { city: "Amsterdam", postalCode: "1012" },
  AU: { city: "Sydney", postalCode: "2000", stateOrProvince: "NSW" },
  CA: { city: "Toronto", postalCode: "M5H 2N2", stateOrProvince: "ON" },
};

/** Renvoie la clé du lieu d'expédition eBay pour un entrepôt, en le créant au premier usage. */
export async function ensureLocation(token: string, country: string): Promise<string> {
  const { data } = await db().from("ebay_locations").select("merchant_location_key").eq("country", country).maybeSingle();
  if (data) return data.merchant_location_key;

  const addr = WAREHOUSE_ADDRESS[country];
  if (!addr) throw new Error(`Adresse d'entrepôt inconnue pour ${country}`);
  const key = `cj-${country.toLowerCase()}`;
  try {
    await ebayFetch(token, `/sell/inventory/v1/location/${key}`, {
      method: "POST",
      body: JSON.stringify({
        name: `CJ ${country}`,
        locationTypes: ["WAREHOUSE"],
        merchantLocationStatus: "ENABLED",
        location: { address: { ...addr, country } },
      }),
    });
  } catch (e) {
    // déjà créé côté eBay (ex : base réinitialisée) : on la réutilise
    if (!(e instanceof EbayApiError && e.status === 409)) throw e;
  }
  await db().from("ebay_locations").upsert({ country, merchant_location_key: key });
  return key;
}
