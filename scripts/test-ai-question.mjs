// Does the Ask AI panel answer what you actually asked?
//
// It did not. The question was one key among roughly fifty in a JSON blob sent
// as the user message, the system prompt opened with an output schema and
// reached "address the user's specific question" on its thirty-fourth line, and
// a rule to cover every ticker in a sixty-seven position book competed with the
// answer for a 4,096-token budget. Whatever anyone typed, the same report came
// back.
//
// None of that is visible from the outside — the reply is fluent and about the
// right portfolio — so this stands a mock provider in front of the route and
// reads what the product actually sends.
//
// Run against a server started with OPENAI_BASE_URL pointed at the mock:
//   node scripts/test-ai-question.mjs http://localhost:PORT
import http from "node:http";

const base = (process.argv[2] || "http://localhost:3611").replace(/\/+$/, "");
const MOCK_PORT = Number(process.argv[3] || 4599);

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

// ── A provider that records rather than answers ────────────────────────────
let captured = null;
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    try { captured = JSON.parse(body); } catch { captured = { parseError: body.slice(0, 200) }; }
    // Enough of a streaming response that the route completes rather than
    // retrying into a second provider and muddying what was captured.
    const payload = JSON.stringify({
      answer: "Mock answer. This is general information only and not financial advice — consider "
        + "speaking with a licensed financial adviser before making investment decisions.",
      portfolioDrivers: [], holdingBreakdown: [], riskChecks: [], nextActions: [],
    });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: payload } }] })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });
});
await new Promise((resolve) => mock.listen(MOCK_PORT, resolve));

// ── An account with something to ask about ─────────────────────────────────
const email = `ai-${Date.now()}@example.com`;
const reg = await fetch(`${base}/api/auth/register`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "CiTestPass123!", displayName: "AI", acceptsTerms: true }),
});
const cookie = "spectre_session=" + (/spectre_session=([^;]+)/.exec(reg.headers.get("set-cookie") || "")?.[1] ?? "");
check("a test account exists", reg.status === 200 && cookie.length > 20, `HTTP ${reg.status}`);

// Ask AI refuses an empty account, so give it something to be about. CSL is in
// there because the question names it, and a reply that ignores a named holding
// is the failure being tested for.
const csv = [
  "Code,Name,Units,Price,Value",
  "CSL,CSL Limited,100,181.46,18146",
  "BHP,BHP Group Ltd,500,45.82,22910",
  "CBA,Commonwealth Bank,200,148.12,29624",
].join("\n");
const imported = await fetch(`${base}/api/import/csv`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ source: "asx", fileName: "t.csv", csvText: csv }),
});
check("a portfolio to ask about", imported.status === 200, `HTTP ${imported.status}`);

const QUESTION = "Why is my CSL position down and should I be worried about it specifically?";

const res = await fetch(`${base}/api/pro/holdings-ai`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ question: QUESTION }),
});
// Drain the stream so the route finishes its work before anything is asserted.
await res.text().catch(() => "");

check("the route reached the provider", captured !== null && !captured.parseError,
  captured?.parseError ? "body did not parse" : `HTTP ${res.status}`);

if (captured && !captured.parseError) {
  const messages = captured.messages ?? [];
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const users = messages.filter((m) => m.role === "user").map((m) => m.content ?? "");

  // ── The question has to be the thing being answered ──────────────────────
  check("the question is sent at all", users.some((u) => u.includes("CSL position down")));

  check("and as its own message, not only buried in the context blob",
    users.length >= 2 && users.some((u) => u.length < 2000 && u.includes(QUESTION)),
    `${users.length} user message(s), shortest ${Math.min(...users.map((u) => u.length))} chars`);

  check("which is the last thing the model reads",
    (messages[messages.length - 1]?.content ?? "").includes(QUESTION));

  // ── The system prompt has to put it first ────────────────────────────────
  const questionAt = system.indexOf("THE QUESTION COMES FIRST");
  const schemaAt = system.indexOf("Use this exact schema");
  check("the system prompt leads with answering the question, before the schema",
    questionAt !== -1 && questionAt < schemaAt,
    questionAt === -1 ? "instruction missing" : `question at ${questionAt}, schema at ${schemaAt}`);

  check("a generic summary is named as a failure, not left implied",
    /generic portfolio summary in response to a specific question is a failure/i.test(system));

  // ── The breakdown must not eat the answer ────────────────────────────────
  check("the per-holding breakdown is capped rather than covering every ticker",
    /Up to 12 entries/.test(system) && !/must cover all tickers/.test(system));

  check("and there is budget left to answer in",
    captured.max_tokens >= 8192, String(captured.max_tokens));

  // ── The portfolio still has to be there ──────────────────────────────────
  const blob = users.find((u) => u.length > 2000) ?? "";
  check("the portfolio context is still sent alongside it",
    blob.includes("portfolio") && blob.includes("totalValue"),
    `${blob.length} chars of context`);
}

mock.close();
console.log(failures === 0 ? "\nAll Ask-AI question checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
