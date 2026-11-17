import { after, NextResponse } from "next/server";
import { createJob, runAutoImport } from "@/lib/services/finder";
import { AutoImportBody } from "@/lib/services/finder-schema";

// L'import continue en arrière-plan après la réponse, jusqu'à 5 min.
export const maxDuration = 300;

/** Lance l'import des meilleurs produits en arrière-plan et répond tout de suite. */
export async function POST(req: Request) {
  const parsed = AutoImportBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  try {
    const jobId = await createJob(parsed.data);
    after(() => runAutoImport(jobId, parsed.data));
    return NextResponse.json({ jobId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
