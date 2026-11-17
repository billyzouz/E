import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { syncOrders } from "@/lib/services/sync-orders";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new NextResponse("Non autorisé", { status: 401 });
  return NextResponse.json(await syncOrders());
}
