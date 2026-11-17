/**
 * T6 — no reservation means no cloud request.
 *
 * Two independent refusal paths are exercised against the real isolated headless
 * profile:
 *   a) enforce mode without a ledger file (BUDGET_NO_LEDGER) — a cap that cannot be
 *      recorded must not be silently skipped;
 *   b) a paid provider with no configured price (BUDGET_UNKNOWN_PRICE) — fail closed
 *      instead of guessing.
 *
 * Both must end with the budget-guard's terminal error chunk and ZERO provider calls.
 */
import { readJsonl, makeReporter } from "../harness.mjs"
import { LOGS, removeLedger, runDsh, saveEvidence, truncate, writeResult } from "../lib/e2e.mjs"

const reporter = makeReporter("6", "no reservation -> no provider call (fail closed)")
const PATCHES = { a: "test/patches/t6-no-ledger.yml", b: "test/patches/t6-unknown-price.yml" }
const runs = {}

for (const [label, patch] of Object.entries(PATCHES)) {
  truncate([LOGS.mock, LOGS.guard, LOGS.router])
  removeLedger()
  const run = await runDsh({ prompt: "say hi", patch, timeoutMs: 120000 })
  const requests = readJsonl(LOGS.mock).filter((e) => e.event === "request")
  const denials = readJsonl(LOGS.guard).filter((e) => e.event === "denied")
  runs[label] = { run, requests, denials }
}

const a = runs.a
const b = runs.b

reporter.check("(a) BUDGET_NO_LEDGER is reported", a.denials.length === 1 && a.denials[0].code === "BUDGET_NO_LEDGER", a.denials)
reporter.check("(a) not a single provider call was attempted", a.requests.length === 0, a.requests)
reporter.check("(a) the step produced no model text", !a.run.stdout.includes("mock reply"), { tail: a.run.stdout.slice(-120) })

reporter.check("(b) BUDGET_UNKNOWN_PRICE is reported", b.denials.length === 1 && b.denials[0].code === "BUDGET_UNKNOWN_PRICE", b.denials)
reporter.check("(b) not a single provider call was attempted", b.requests.length === 0, b.requests)
reporter.check("(b) no ledger was written for a refused call", readJsonl(LOGS.ledger).length === 0, readJsonl(LOGS.ledger))

const result = reporter.result([
  "Both refusals are real headless runs of the a1d1-isolated profile; the mock adapter is the only registered provider.",
  "The budget-guard yields a terminal finish chunk without calling next(), so the adapter is never prepared or streamed.",
])
writeResult("t6", result)
saveEvidence("t6", [LOGS.guard, LOGS.mock, LOGS.ledger])
process.exit(result.verdict === "PASS" ? 0 : 1)
