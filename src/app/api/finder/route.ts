import { NextResponse } from "next/server";
import { findCandidates } from "@/lib/services/finder";
import { FinderBody } from "@/lib/services/finder-schema";

/** Recherche et classe des produits CJ (1 appel CJ, quelques secondes). */
export async function POST(req: Request) {
  const parsed = FinderBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  try {
    return NextResponse.json({ candidates: await findCandidates(parsed.data) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
