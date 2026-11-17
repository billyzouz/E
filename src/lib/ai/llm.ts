import { requireEnv } from "@/lib/env";

/**
 * Client IA via OpenRouter (API compatible OpenAI). Modèle par défaut : DeepSeek V4.1 Flash.
 * Doc : https://openrouter.ai/docs
 * Pour passer par un autre fournisseur compatible, changer AI_BASE_URL et AI_MODEL.
 */
const BASE = process.env.AI_BASE_URL || "https://openrouter.ai/api/v1";
export const AI_MODEL = process.env.AI_MODEL || "deepseek/deepseek-v4.1-flash";

interface ChatResponse {
  choices?: { message: { content: string | null } }[];
  error?: { message: string };
}

/** Extrait le premier objet JSON d'un texte (au cas où le modèle ajoute du texte autour). */
export function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Réponse IA sans JSON");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

/** Demande une réponse JSON au modèle, sans mode réflexion (rapide et peu cher). */
export async function chatJson<T>(system: string, user: string): Promise<T> {
  const call = (strict: boolean) =>
    fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requireEnv("AI_API_KEY")}`,
        "X-Title": "E-dropship",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 4000,
        // Si le modèle ou le fournisseur refuse ces options (400), on réessaie sans.
        ...(strict ? { reasoning: { effort: "none" }, response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });

  let res = await call(true);
  if (res.status === 400) res = await call(false);
  if (res.status === 402) throw new Error("Crédit OpenRouter épuisé : recharge ton compte");
  if (!res.ok) throw new Error(`IA ${res.status} : ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as ChatResponse;
  if (json.error) throw new Error(`IA : ${json.error.message}`);
  return extractJson<T>(json.choices?.[0]?.message.content ?? "");
}
