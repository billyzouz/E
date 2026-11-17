import { createHash } from "node:crypto";

/**
 * eBay vérifie l'URL de notification en envoyant ?challenge_code=XXX.
 * Il faut répondre SHA-256(challengeCode + verificationToken + endpointUrl) en hexadécimal.
 */
export function challengeResponse(challengeCode: string, verificationToken: string, endpointUrl: string): string {
  return createHash("sha256").update(challengeCode).update(verificationToken).update(endpointUrl).digest("hex");
}
