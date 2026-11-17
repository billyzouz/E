import { ebayFetch } from "./client";

export interface EbayAddress {
  fullName: string;
  contactAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateOrProvince?: string;
    postalCode: string;
    countryCode: string;
  };
  primaryPhone?: { phoneNumber: string };
}

export interface EbayOrder {
  orderId: string;
  creationDate: string;
  orderFulfillmentStatus: "NOT_STARTED" | "IN_PROGRESS" | "FULFILLED";
  orderPaymentStatus: string;
  buyer: { username: string };
  pricingSummary: { total: { value: string; currency: string } };
  lineItems: { lineItemId: string; sku?: string; title: string; quantity: number }[];
  fulfillmentStartInstructions: { shippingStep: { shipTo: EbayAddress } }[];
}

/** Commandes payées pas encore expédiées. */
export async function getOrdersToShip(token: string): Promise<EbayOrder[]> {
  const params = new URLSearchParams({
    filter: "orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}",
    limit: "50",
  });
  const res = await ebayFetch<{ orders?: EbayOrder[] }>(token, `/sell/fulfillment/v1/order?${params}`);
  return (res.orders ?? []).filter((o) => o.orderPaymentStatus === "PAID");
}

/** Envoie le numéro de suivi à eBay : la commande passe en "expédiée". */
export function markShipped(
  token: string,
  orderId: string,
  lineItems: { lineItemId: string; quantity: number }[],
  carrierCode: string,
  trackingNumber: string,
) {
  return ebayFetch(token, `/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`, {
    method: "POST",
    body: JSON.stringify({
      lineItems,
      shippedDate: new Date().toISOString(),
      shippingCarrierCode: carrierCode,
      trackingNumber,
    }),
  });
}
