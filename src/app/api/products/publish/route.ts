import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareListing, publishListing } from "@/lib/services/publish-listing";

export const maxDuration = 120;

const Body = z.object({
  listingId: z.string().uuid(),
  action: z.enum(["prepare", "publish"]).default("publish"),
});

/** prepare = l'IA rédige l'annonce ; publish = mise en ligne sur eBay (rédige d'abord si besoin). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const { listingId, action } = parsed.data;
  try {
    const result = action === "prepare" ? await prepareListing(listingId) : await publishListing(listingId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
