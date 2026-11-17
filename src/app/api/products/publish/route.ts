import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { publishProduct } from "@/lib/services/publish-product";

const Body = z.object({ productId: z.string().uuid(), categoryId: z.string().regex(/^\d+$/).optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const { productId, categoryId } = parsed.data;
  try {
    if (categoryId) await db().from("products").update({ category_id: categoryId }).eq("id", productId);
    return NextResponse.json(await publishProduct(productId));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
