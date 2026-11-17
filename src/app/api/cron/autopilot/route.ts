import { NextResponse } from "next/server";
import { runAutopilot } from "@/lib/autopilot";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

/** Un passage du pilote automatique (appelé par le planificateur Supabase). */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new NextResponse("Non autorisé", { status: 401 });
  return NextResponse.json(await runAutopilot());
}
