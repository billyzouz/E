import { db } from "@/lib/db";
import { createOrder, getOrderDetail } from "@/lib/cj/client";
import { useDbTokenCache } from "@/lib/cj/token-cache";
import { getOrdersToShip, markShipped, type EbayOrder } from "@/lib/ebay/fulfillment";
import { getUserAccessToken } from "@/lib/ebay/token-store";

/** Code transporteur eBay à partir du nom de transport CJ. "Other" si inconnu. */
export function carrierCode(logisticName: string | null | undefined): string {
  const n = (logisticName ?? "").toLowerCase();
  if (n.includes("yanwen")) return "Yanwen";
  if (n.includes("4px")) return "4PX";
  if (n.includes("yunexpress") || n.includes("yun express")) return "YunExpress";
  if (n.includes("china post")) return "ChinaPost";
  if (n.includes("colissimo")) return "Colissimo";
  if (n.includes("dhl")) return "DHL";
  return "Other";
}

/** "FR" → "France" (CJ demande le nom du pays en plus du code). */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Étape 1 : chaque nouvelle commande eBay payée devient une commande CJ. */
async function forwardNewOrders(token: string) {
  const orders = await getOrdersToShip(token);
  const report = { forwarded: 0, manual: 0, errors: [] as string[] };

  for (const o of orders) {
    const { data: existing } = await db().from("orders").select("id").eq("ebay_order_id", o.orderId).maybeSingle();
    if (existing) continue; // déjà traitée : on ne recommande jamais deux fois

    const { error: insertError } = await db().from("orders").insert({
      ebay_order_id: o.orderId,
      buyer: o.buyer.username,
      total_eur: Number(o.pricingSummary.total.value),
      raw: o,
    });
    if (insertError) {
      report.errors.push(`${o.orderId}: ${insertError.message}`);
      continue;
    }

    try {
      const cjOrderId = await placeCjOrder(o);
      if (!cjOrderId) {
        report.manual++;
        continue;
      }
      await db().from("orders").update({ status: "ordered_cj", cj_order_id: cjOrderId }).eq("ebay_order_id", o.orderId);
      report.forwarded++;
    } catch (e) {
      await db().from("orders").update({ status: "error", last_error: String(e) }).eq("ebay_order_id", o.orderId);
      report.errors.push(`${o.orderId}: ${String(e)}`);
    }
  }
  return report;
}

/** Renvoie l'ID de commande CJ, ou null si la commande doit être traitée à la main. */
async function placeCjOrder(o: EbayOrder): Promise<string | null> {
  const skus = o.lineItems.map((l) => l.sku).filter((s): s is string => !!s);
  const { data: products } = await db()
    .from("products")
    .select("sku, cj_vid, logistic_name, ship_from")
    .in("sku", skus);
  const bySku = new Map((products ?? []).map((p) => [p.sku, p]));

  const toManual = async (reason: string) => {
    await db().from("orders").update({ status: "manual", last_error: reason }).eq("ebay_order_id", o.orderId);
    return null;
  };
  if (skus.length !== o.lineItems.length || skus.some((s) => !bySku.has(s))) {
    return toManual("Article sans SKU connu : à commander à la main");
  }
  const warehouses = new Set(skus.map((s) => bySku.get(s)!.ship_from));
  if (warehouses.size > 1) return toManual("Articles d'entrepôts CJ différents : à commander à la main");

  const shipTo = o.fulfillmentStartInstructions[0]?.shippingStep.shipTo;
  if (!shipTo) throw new Error("Adresse de livraison absente");
  const a = shipTo.contactAddress;
  const first = bySku.get(skus[0])!;

  const res = await createOrder({
    orderNumber: o.orderId,
    shippingCountryCode: a.countryCode,
    shippingCountry: countryName(a.countryCode),
    shippingProvince: a.stateOrProvince || a.city, // obligatoire chez CJ, souvent vide sur eBay France
    shippingCity: a.city,
    shippingAddress: a.addressLine1,
    shippingAddress2: a.addressLine2,
    shippingZip: a.postalCode,
    shippingCustomerName: shipTo.fullName,
    shippingPhone: shipTo.primaryPhone?.phoneNumber,
    fromCountryCode: first.ship_from,
    logisticName: first.logistic_name,
    payType: process.env.CJ_AUTO_PAY === "true" ? 2 : 3,
    products: o.lineItems.map((l) => ({
      vid: bySku.get(l.sku!)!.cj_vid,
      quantity: l.quantity,
      storeLineItemId: l.lineItemId,
    })),
  });
  if (res.interceptOrderReasons?.length) {
    throw new Error(`CJ a bloqué la commande : ${res.interceptOrderReasons.map((r) => r.message).join(" ; ")}`);
  }
  return res.orderId;
}

/** Étape 2 : dès que CJ fournit un numéro de suivi, on le pousse sur eBay. */
async function pushTracking(token: string) {
  const { data: pending } = await db().from("orders").select("*").eq("status", "ordered_cj");
  const report = { shipped: 0, errors: [] as string[] };

  for (const row of pending ?? []) {
    try {
      const detail = await getOrderDetail(row.cj_order_id);
      if (!detail.trackNumber) continue;
      const carrier = carrierCode(detail.logisticName);
      const raw = row.raw as EbayOrder;
      await markShipped(
        token,
        row.ebay_order_id,
        raw.lineItems.map((l) => ({ lineItemId: l.lineItemId, quantity: l.quantity })),
        carrier,
        detail.trackNumber,
      );
      await db()
        .from("orders")
        .update({ status: "shipped", tracking_number: detail.trackNumber, carrier })
        .eq("id", row.id);
      report.shipped++;
    } catch (e) {
      report.errors.push(`${row.ebay_order_id}: ${String(e)}`);
    }
  }
  return report;
}

export async function syncOrders() {
  useDbTokenCache();
  const token = await getUserAccessToken();
  return { incoming: await forwardNewOrders(token), tracking: await pushTracking(token) };
}
