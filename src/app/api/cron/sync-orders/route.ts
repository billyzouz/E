import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { syncOrders } from "@/lib/services/sync-orders";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new NextResponse("Non autorisé", { status: 401 });
  // Rien à synchroniser tant que le compte eBay n'est pas connecté
  if (!process.env.EBAY_CLIENT_ID) return NextResponse.json({ skipped: "clés eBay absentes" });
  const { data: account } = await db().from("ebay_accounts").select("id").limit(1).maybeSingle();
  if (!account) return NextResponse.json({ skipped: "compte eBay non connecté" });
  return NextResponse.json(await syncOrders());
}
