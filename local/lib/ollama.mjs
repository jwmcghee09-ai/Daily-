// Minimal client for a locally running Ollama daemon (default localhost:11434).
// No SDK, no API key, no data leaving the machine.

const DEFAULT_HOST = process.env.OLLAMA_HOST?.replace(/\/$/, "") || "http://127.0.0.1:11434";

export class OllamaUnavailable extends Error {}
export class OllamaModelMissing extends Error {}

export async function listModels(host = DEFAULT_HOST) {
  let res;
  try {
    res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(4000) });
  } catch {
    throw new OllamaUnavailable(
      `Can't reach Ollama at ${host}.\n` +
        `  • Install it from https://ollama.com/download\n` +
        `  • Then start it with:  ollama serve\n` +
        `  • Or run with --no-ai for the numbers without the written summary.`,
    );
  }
  if (!res.ok) throw new OllamaUnavailable(`Ollama responded ${res.status} at ${host}`);
  const data = await res.json();
  return (data.models ?? []).map((m) => m.name);
}

export async function ensureModel(model, host = DEFAULT_HOST) {
  const models = await listModels(host);
  const found = models.some((m) => m === model || m.split(":")[0] === model.split(":")[0]);
  if (!found) {
    throw new OllamaModelMissing(
      `Ollama is running but has no model called "${model}".\n` +
        (models.length ? `  Installed: ${models.join(", ")}\n` : "  No models installed yet.\n") +
        `  Build the SPECTRE model:  cd local && ollama create spectre -f Modelfile\n` +
        `  Or point at one you have: --model ${models[0] ?? "llama3.1"}`,
    );
  }
  return true;
}

/**
 * Stream a chat completion, calling onToken for each chunk.
 * @returns {Promise<string>} the full response text
 */
export async function chat({ model, system, user, host = DEFAULT_HOST, onToken, timeoutMs = 180000 }) {
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      stream: true,
      options: { temperature: 0.2 },
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed (${res.status}) ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt;
      try { evt = JSON.parse(trimmed); } catch { continue; }
      const piece = evt.message?.content ?? "";
      if (piece) { full += piece; onToken?.(piece); }
    }
  }
  return full;
}

export { DEFAULT_HOST };
