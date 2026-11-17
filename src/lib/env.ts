/** Lit une variable d'environnement obligatoire, avec un message clair si elle manque. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  return v;
}
