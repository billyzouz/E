import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/ebay/oauth";
import { saveTokens } from "@/lib/ebay/token-store";

/** Retour d'eBay après consentement (URL "auth accepted" du RuName). */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("ebay_oauth_state")?.value;

  if (!code) return new NextResponse("Connexion eBay refusée ou annulée", { status: 400 });
  if (!state || state !== expected) return new NextResponse("State OAuth invalide", { status: 400 });

  await saveTokens(await exchangeCode(code));
  const res = NextResponse.redirect(new URL("/?ebay=connected", req.url));
  res.cookies.delete("ebay_oauth_state");
  return res;
}
