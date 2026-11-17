import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Derniers imports automatiques (suivi en direct dans la page Recherche). */
export async function GET() {
  const { data, error } = await db().from("import_jobs").select("*").order("created_at", { ascending: false }).limit(5);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data });
}
