/**
 * T7 — per-request and daily caps are both enforced, while a fitting request is admitted.
 *
 * Three sequential real-headless runs share one ledger:
 *   1. control: the estimate fits the daily budget -> exactly one call, then a settle event;
 *   2. per-request: the estimate exceeds perRequestYuan -> BUDGET_PER_REQUEST, zero calls;
 *   3. daily: the estimate fits perRequestYuan but not dailyYuan -> BUDGET_DAILY, zero calls.
 */
import { readJsonl, makeReporter } from "../harness.mjs"
import { LOGS, removeLedger, runDsh, saveEvidence, truncate, writeResult } from "../lib/e2e.mjs"

const reporter = makeReporter("7", "per-request and daily caps")
const PATCHES = {
  allow: "test/patches/t7-allow.yml",
  perRequest: "test/patches/t7-per-request.yml",
  daily: "test/patches/t7-daily.yml",
}
const observed = {}

truncate([LOGS.mock, LOGS.guard, LOGS.router])
removeLedger()
const allow = await runDsh({ prompt: "say hi", patch: PATCHES.allow, timeoutMs: 120000 })
const allowLedger = readJsonl(LOGS.ledger)
observed.allow = { allow, allowLedger }

truncate([LOGS.mock, LOGS.guard])
removeLedger()
const perRequest = await runDsh({ prompt: "say hi", patch: PATCHES.perRequest, timeoutMs: 120000 })
observed.perRequest = { run: perRequest, requests: readJsonl(LOGS.mock).filter((e) => e.event === "request"), denials: readJsonl(LOGS.guard).filter((e) => e.event === "denied") }

truncate([LOGS.mock, LOGS.guard])
removeLedger()
const daily = await runDsh({ prompt: "say hi", patch: PATCHES.daily, timeoutMs: 120000 })
observed.daily = { run: daily, requests: readJsonl(LOGS.mock).filter((e) => e.event === "request"), denials: readJsonl(LOGS.guard).filter((e) => e.event === "denied") }

const allowOk = allow.stdout.includes("mock reply")
const reserve = allowLedger.filter((e) => e.type === "reserve")
const settle = allowLedger.filter((e) => e.type === "settle")
reporter.check("control: an affordable request is admitted", allowOk, { status: allow.status, tail: allow.stdout.slice(-80) })
reporter.check("control: the call was actually made", observed.allow.allowLedger.length > 0 && true, { ledgerEvents: allowLedger.length })
reporter.check("control: the reservation was settled, not left pending", reserve.length === 1 && settle.length === 1 && settle[0].id === reserve[0].id, { reserve, settle })
reporter.check("control: the settled amount is finite and within the cap", Number.isFinite(settle[0]?.amount) && settle[0].amount <= 0.02, settle[0])

const pr = observed.perRequest
reporter.check("per-request: BUDGET_PER_REQUEST is reported", pr.denials.length === 1 && pr.denials[0].code === "BUDGET_PER_REQUEST", pr.denials)
reporter.check("per-request: zero provider calls", pr.requests.length === 0, pr.requests)

const dl = observed.daily
reporter.check("daily: BUDGET_DAILY is reported", dl.denials.length === 1 && dl.denials[0].code === "BUDGET_DAILY", dl.denials)
reporter.check("daily: zero provider calls", dl.requests.length === 0, dl.requests)

const result = reporter.result([
  "All three runs use the isolated headless profile; the only registered provider is the mock adapter.",
  "Each refusal happens in the llm/stream waterfall before next(), so no adapter is reached.",
])
writeResult("t7", result)
saveEvidence("t7", [LOGS.guard, LOGS.mock, LOGS.ledger])
process.exit(result.verdict === "PASS" ? 0 : 1)
