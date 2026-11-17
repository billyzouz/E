import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildConsentUrl } from "@/lib/ebay/oauth";

/** Redirige vers eBay pour connecter le compte vendeur. */
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildConsentUrl(state));
  res.cookies.set("ebay_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600 });
  return res;
}
