import { NextResponse, type NextRequest } from "next/server";

/**
 * Protège le tableau de bord et les routes internes par mot de passe (HTTP Basic).
 * Restent publiques : le retour OAuth eBay, la notification de suppression eBay,
 * et les tâches planifiées (qui ont leur propre secret).
 */
const PUBLIC_PATHS = ["/api/ebay/callback", "/api/ebay/account-deletion", "/api/cron/"];

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return NextResponse.next();

  const password = process.env.ADMIN_PASSWORD;
  if (!password) return new NextResponse("ADMIN_PASSWORD non configuré", { status: 500 });

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given === password) return NextResponse.next();
  }
  return new NextResponse("Authentification requise", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="dashboard"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
