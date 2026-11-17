import { NextResponse, type NextRequest } from "next/server";
import { requireEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { challengeResponse } from "@/lib/ebay/account-deletion";

const endpointUrl = () => `${requireEnv("APP_URL")}/api/ebay/account-deletion`;

/** Vérification de l'URL par eBay. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("challenge_code");
  if (!code) return new NextResponse("challenge_code manquant", { status: 400 });
  return NextResponse.json({
    challengeResponse: challengeResponse(code, requireEnv("EBAY_DELETION_VERIFICATION_TOKEN"), endpointUrl()),
  });
}

/**
 * Un utilisateur eBay a supprimé son compte : on efface ses données perso chez nous.
 * TODO avant la production : vérifier la signature X-EBAY-SIGNATURE (SDK eBay event-notification).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username: string | undefined = body?.notification?.data?.username;
  if (username) {
    await db().from("orders").update({ buyer: null, raw: {} }).eq("buyer", username);
  }
  return new NextResponse(null, { status: 204 });
}
