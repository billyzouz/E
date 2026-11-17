import { requireEnv } from "./env";

/** Les tâches planifiées doivent envoyer "Authorization: Bearer <CRON_SECRET>". */
export function isCronAuthorized(req: Request): boolean {
  return req.headers.get("authorization") === `Bearer ${requireEnv("CRON_SECRET")}`;
}
