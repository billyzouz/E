import { NextResponse } from "next/server";
import { z } from "zod";
import { importCjProduct } from "@/lib/services/import-product";

// Un calcul de port par entrepôt et par pays : compter ~10-20 s.
export const maxDuration = 120;

const Body = z.object({ link: z.string().min(3) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lien CJ manquant" }, { status: 400 });
  try {
    return NextResponse.json(await importCjProduct(parsed.data.link));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
