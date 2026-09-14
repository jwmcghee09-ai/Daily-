// Model resolution, tested against the failure that caused this: a provider
// retiring a hardcoded model ID and taking the whole feature down with it.
//
// The resolver is only worth having if it survives the case where NONE of the
// names in the source still exist, so that is the case that matters most here.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "spectre-ai-"));
execFileSync("npx", ["tsc", "src/lib/ai-provider.ts", "--target", "es2022",
  "--module", "esnext", "--outDir", dir, "--skipLibCheck"], { stdio: ["ignore", "pipe", "pipe"] });

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

const realFetch = globalThis.fetch;
/** Stand in for Groq's model listing. */
function stubModels(ids, { status = 200 } = {}) {
  globalThis.fetch = async () => ({
    ok: status === 200,
    status,
    json: async () => ({ data: ids.map((id) => ({ id })) }),
  });
}

// A fresh module per case, so the internal cache never leaks between them.
const load = async () => import(`${join(dir, "ai-provider.js")}?v=${Math.random()}`);

// ── The preference order is honoured when the models exist ──
{
  stubModels(["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "whisper-large-v3"]);
  const m = await load();
  check("picks the preferred model when present",
    (await m.resolveGroqModel("k")) === "llama-3.3-70b-versatile");
}

// ── The reported failure: the pinned model is gone ──
{
  stubModels(["llama-3.3-70b-versatile", "gemma2-9b-it"]);
  const m = await load();
  const chosen = await m.resolveGroqModel("k");
  check("falls past a retired model instead of 404ing",
    chosen !== "llama-3.1-8b-instant" && chosen === "llama-3.3-70b-versatile", chosen);
}

// ── EVERY known name is gone — the case the resolver exists for ──
{
  stubModels(["some-future-model-v9", "another-unknown-70b", "whisper-large-v3"]);
  const m = await load();
  const chosen = await m.resolveGroqModel("k");
  check("uses an unknown model rather than failing",
    chosen === "some-future-model-v9", chosen);
  check("skips models that cannot chat", !/whisper/.test(chosen));
}

// ── Only non-chat models available ──
{
  stubModels(["whisper-large-v3", "llama-guard-4-12b"]);
  const m = await load();
  const chosen = await m.resolveGroqModel("k");
  check("never selects a transcription or guard model", !/whisper|guard/.test(chosen), chosen);
}

// ── The listing itself fails ──
{
  stubModels([], { status: 500 });
  const m = await load();
  const chosen = await m.resolveGroqModel("k");
  check("still returns a model when the listing is unavailable", typeof chosen === "string" && chosen.length > 0, chosen);
}

// ── An explicit pin always wins ──
{
  stubModels(["llama-3.3-70b-versatile"]);
  process.env.GROQ_MODEL = "my-pinned-model";
  const m = await load();
  check("GROQ_MODEL overrides resolution", (await m.resolveGroqModel("k")) === "my-pinned-model");
  delete process.env.GROQ_MODEL;
}

// ── Caching, and invalidation when a model dies mid-flight ──
{
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ data: [{ id: "llama-3.3-70b-versatile" }] }) }; };
  const m = await load();
  await m.resolveGroqModel("k");
  await m.resolveGroqModel("k");
  check("caches the choice", calls === 1, `${calls} listing call(s) for 2 resolutions`);
  m.invalidateGroqModel();
  await m.resolveGroqModel("k");
  check("invalidate forces a re-resolve", calls === 2, `${calls} calls`);
}

// ── Errors explain what to do ──
{
  const m = await load();
  const dead = m.describeModelError(404, '{"error":{"code":"model_not_found"}}', "llama-3.1-8b-instant");
  check("a retired model reads as recoverable, not as a crash",
    /no longer serves/.test(dead) && /GROQ_MODEL/.test(dead));
  check("a bad key names the key", /API key/i.test(m.describeModelError(401, "nope", "x")));
  check("rate limiting says so", /[Rr]ate limited/.test(m.describeModelError(429, "slow down", "x")));
}

globalThis.fetch = realFetch;
rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll AI-provider checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
