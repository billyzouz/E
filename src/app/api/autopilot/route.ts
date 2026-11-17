import { NextResponse } from "next/server";
import { loadSettings, loadState, runAutopilot, saveSettings } from "@/lib/autopilot";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Réglages et état du pilote automatique (tableau de bord). */
export async function GET() {
  const [settings, state] = await Promise.all([loadSettings(), loadState()]);
  return NextResponse.json({ settings, state });
}

/** Enregistre les réglages. Avec ?run=1, lance aussi un passage tout de suite. */
export async function POST(req: Request) {
  try {
    const settings = await saveSettings(await req.json());
    const run = new URL(req.url).searchParams.get("run") === "1" ? await runAutopilot() : null;
    return NextResponse.json({ settings, run });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
