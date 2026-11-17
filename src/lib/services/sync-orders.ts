import { db } from "@/lib/db";
import { createOrder, getOrderDetail } from "@/lib/cj/client";
import { getOrdersToShip, markShipped, type EbayOrder } from "@/lib/ebay/fulfillment";
import { getUserAccessToken } from "@/lib/ebay/token-store";

/** Code transporteur eBay à partir du nom de transport CJ. "Other" si inconnu. */
export function carrierCode(logisticName: string | undefined): string {
  const n = (logisticName ?? "").toLowerCase();
  if (n.includes("yanwen")) return "Yanwen";
  if (n.includes("4px")) return "4PX";
  if (n.includes("yunexpress") || n.includes("yun express")) return "YunExpress";
  if (n.includes("china post")) return "ChinaPost";
  if (n.includes("colissimo")) return "Colissimo";
  if (n.includes("dhl")) return "DHL";
  return "Other";
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
  const { data: products } = await db().from("products").select("sku, cj_vid, logistic_name").in("sku", skus);
  const bySku = new Map((products ?? []).map((p) => [p.sku, p]));

  if (skus.length !== o.lineItems.length || skus.some((s) => !bySku.has(s))) {
    await db()
      .from("orders")
      .update({ status: "manual", last_error: "Article sans SKU connu : à commander à la main" })
      .eq("ebay_order_id", o.orderId);
    return null;
  }

  const shipTo = o.fulfillmentStartInstructions[0]?.shippingStep.shipTo;
  if (!shipTo) throw new Error("Adresse de livraison absente");
  const a = shipTo.contactAddress;

  const res = await createOrder({
    orderNumber: o.orderId,
    shippingCountryCode: a.countryCode,
    shippingProvince: a.stateOrProvince,
    shippingCity: a.city,
    shippingAddress: a.addressLine1,
    shippingAddress2: a.addressLine2,
    shippingZip: a.postalCode,
    shippingCustomerName: shipTo.fullName,
    shippingPhone: shipTo.primaryPhone?.phoneNumber,
    fromCountryCode: process.env.CJ_FROM_COUNTRY || "CN",
    logisticName: bySku.get(skus[0])!.logistic_name,
    products: o.lineItems.map((l) => ({ vid: bySku.get(l.sku!)!.cj_vid, quantity: l.quantity })),
  });
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
  const token = await getUserAccessToken();
  return { incoming: await forwardNewOrders(token), tracking: await pushTracking(token) };
}
