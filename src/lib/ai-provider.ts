/**
 * Which model to talk to, resolved at runtime rather than hardcoded.
 *
 * Myrmidon's chat pinned `llama-3.1-8b-instant`. Groq retired it, and the whole
 * feature returned 404 until someone edited the source — a provider's
 * deprecation schedule should not be able to take a feature down. So the model
 * is now chosen from what the provider actually reports it has: a preference
 * order is tried against the live model list, and anything present wins.
 *
 * That means a name disappearing is survivable, and so is a name being added
 * that this code has never heard of — if none of the preferences exist, the
 * first usable model on the account is used rather than failing.
 */

const GROQ_BASE = "https://api.groq.com/openai/v1";

/**
 * Preference order, best first. These are hints, not requirements: every one
 * may be gone and resolution still succeeds.
 */
const GROQ_PREFERENCES = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3-32b",
  "gemma2-9b-it",
];

/** Models that exist but cannot hold a tool-using conversation. */
const NOT_CHAT = /whisper|tts|guard|embed|vision-preview|distil/i;

interface Cached {
  model: string;
  at: number;
}

let cache: Cached | null = null;
const CACHE_MS = 10 * 60 * 1000;

/** Ask Groq what it currently serves. */
async function listGroqModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${GROQ_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  return (data.data ?? []).map((entry) => String(entry.id ?? "")).filter(Boolean);
}

/**
 * A Groq model that exists on this account right now.
 *
 * `GROQ_MODEL` in the environment always wins, so a specific model can be
 * pinned without a deploy. Otherwise the live list decides.
 */
export async function resolveGroqModel(apiKey: string): Promise<string> {
  const pinned = String(process.env.GROQ_MODEL || "").trim();
  if (pinned) return pinned;

  if (cache && Date.now() - cache.at < CACHE_MS) return cache.model;

  let available: string[] = [];
  try {
    available = await listGroqModels(apiKey);
  } catch {
    // The listing is a convenience, not a dependency.
  }

  let chosen = GROQ_PREFERENCES.find((name) => available.includes(name));
  if (!chosen) {
    // None of the names this code knows are available — take the first model
    // that looks like it can hold a conversation rather than giving up.
    chosen = available.find((name) => !NOT_CHAT.test(name));
  }
  if (!chosen) {
    // The list could not be read at all. Fall back to the first preference so
    // the caller still gets a request out; a 404 there is reported plainly.
    chosen = GROQ_PREFERENCES[0];
  }

  cache = { model: chosen, at: Date.now() };
  return chosen;
}

/** Forget the cached choice — used when a request 404s on a retired model. */
export function invalidateGroqModel(): void {
  cache = null;
}

/**
 * Turn a provider error into something a person can act on. A raw
 * "model_not_found" tells the user nothing about what to do next.
 */
export function describeModelError(status: number, body: string, model: string): string {
  if (status === 404 && /model/i.test(body)) {
    return (
      `The AI provider no longer serves "${model}". SPECTRE picks a current model automatically, ` +
      `so this usually clears on the next message. To pin one, set GROQ_MODEL in the environment.`
    );
  }
  if (status === 401 || status === 403) {
    return "The AI provider rejected the API key. Check GROQ_API_KEY (or ANTHROPIC_API_KEY) in the environment.";
  }
  if (status === 429) return "Rate limited by the AI provider — try again shortly.";
  return `AI provider error ${status}: ${body.slice(0, 200)}`;
}
