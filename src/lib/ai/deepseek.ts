import { requireEnv } from "@/lib/env";

/**
 * Client DeepSeek (API compatible OpenAI). Modèle par défaut : deepseek-flash (= DeepSeek V4.1 Flash).
 * Doc : https://api-docs.deepseek.com/
 */
const BASE = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";

interface ChatResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/** Extrait le premier objet JSON d'un texte (au cas où le modèle ajoute du texte autour). */
export function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Réponse IA sans JSON");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

/** Demande une réponse JSON au modèle (mode sans réflexion : rapide et peu cher). */
export async function chatJson<T>(system: string, user: string): Promise<T> {
  const call = async (jsonMode: boolean) =>
    fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireEnv("DEEPSEEK_API_KEY")}` },
      body: JSON.stringify({
        model: MODEL,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(90_000),
    });

  let res = await call(true);
  if (res.status === 400) res = await call(false); // si le mode JSON n'est pas accepté, on parse le texte
  if (!res.ok) throw new Error(`DeepSeek ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as ChatResponse;
  return extractJson<T>(json.choices[0]?.message.content ?? "");
}
