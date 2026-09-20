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
 * One chat backend, in the order it should be tried.
 *
 * Groq and OpenAI both speak the OpenAI /chat/completions shape — same request
 * body, same tool-calling fields, same streaming format — so a caller can move
 * between them without changing anything but the URL, key and model.
 */
export interface ChatProvider {
  name: string;
  url: string;
  key: string;
  model: string;
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GROQ_CHAT_URL = `${GROQ_BASE}/chat/completions`;
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

/**
 * Every configured backend, best first.
 *
 * Myrmidon ran on Groq alone. Model retirement is handled above, but that is
 * only one of the ways a single provider takes the feature down with it — an
 * outage, an expired key or a sustained rate limit does the same, and there was
 * nothing behind it. Groq stays first because its free tier is what keeps this
 * cheap; OpenAI is there so a bad hour at Groq is not a dead product.
 *
 * `AI_PROVIDER=groq` or `AI_PROVIDER=openai` pins one for debugging.
 */
export async function resolveChatProviders(): Promise<ChatProvider[]> {
  const pinned = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  const groqKey = String(process.env.GROQ_API_KEY || "").trim();
  const openAiKey = String(process.env.OPENAI_API_KEY || "").trim();

  const providers: ChatProvider[] = [];

  if (groqKey && pinned !== "openai") {
    providers.push({
      name: "Groq",
      url: GROQ_CHAT_URL,
      key: groqKey,
      model: await resolveGroqModel(groqKey),
    });
  }

  if (openAiKey && pinned !== "groq") {
    providers.push({
      name: "OpenAI",
      url: OPENAI_URL,
      key: openAiKey,
      model: String(process.env.OPENAI_MODEL || "").trim() || DEFAULT_OPENAI_MODEL,
    });
  }

  return providers;
}

/**
 * Whether a failed response is worth trying the next provider for.
 *
 * A provider being down, out of quota, or refusing our key is not going to fix
 * itself on a retry, and the next backend may well answer. A 400 is our own
 * malformed request and will fail identically everywhere, so it is not
 * worth the extra round trip.
 */
export function shouldFailOver(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

/** Said once, so every surface explains a missing key the same way. */
export const NO_PROVIDER_MESSAGE =
  "No AI provider is configured — set GROQ_API_KEY or OPENAI_API_KEY in the environment.";

/**
 * A backend failed in a way another backend might not.
 *
 * Callers used to decide this by looking for a provider's name in the error
 * text, which quietly stopped working: describeModelError says "The AI
 * provider…" and "GROQ_API_KEY", so a test for "Groq" matched neither and the
 * fallback never ran. Carrying the decision on the error type instead means it
 * cannot drift out of step with the wording again.
 */
export class ProviderUnavailableError extends Error {
  readonly provider: string;
  readonly status: number;

  constructor(provider: string, status: number, message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
    this.status = status;
  }
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
