import { NextResponse } from "next/server";
import { z } from "zod";
import { importCjProduct } from "@/lib/services/import-product";

// Import lent à cause de la limite CJ (1 appel/s) : on laisse jusqu'à 5 min.
export const maxDuration = 300;

const Body = z.object({ link: z.string().min(3) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lien CJ manquant" }, { status: 400 });
  try {
    return NextResponse.json({ products: await importCjProduct(parsed.data.link) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
