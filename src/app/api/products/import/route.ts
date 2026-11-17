import { NextResponse } from "next/server";
import { z } from "zod";
import { importCjProduct } from "@/lib/services/import-product";

export const maxDuration = 60;

const Body = z.object({
  link: z.string().min(3),
  shipFrom: z.enum(["CN", "FR", "DE", "ES", "IT", "PL", "GB", "US"]).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lien CJ manquant" }, { status: 400 });
  try {
    const products = await importCjProduct(parsed.data.link, { shipFrom: parsed.data.shipFrom });
    return NextResponse.json({ products });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
