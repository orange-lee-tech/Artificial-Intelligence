/** T5: a retry after a local timeout stays on the local provider. */
import { join } from "node:path"
import { readJsonl, makeReporter, ROOT } from "../harness.mjs"
import { LOGS, runDsh, truncate, removeLedger, saveEvidence, writeResult } from "../lib/e2e.mjs"

const reporter = makeReporter("5", "retry after a local timeout stays on the local provider")
truncate([LOGS.mock, LOGS.router, LOGS.guard])
removeLedger()

const run = await runDsh({
  prompt: "say hi",
  patch: join(ROOT, "test/patches/retry-timeout.yml"),
  timeoutMs: 180000,
})
const requests = readJsonl(LOGS.mock).filter((e) => e.event === "request")
const routerEvents = readJsonl(LOGS.router)
const routes = routerEvents.filter((e) => e.event === "route")
const locks = routerEvents.filter((e) => e.event === "route-locked")

reporter.check("the retried step finally produced the scripted answer", run.stdout.includes("retry ok"), {
  status: run.status, ms: run.ms, tail: run.stdout.slice(-300),
})
reporter.check("the first local call was scripted to time out",
  requests.length >= 1 && requests[0].mode === "timeout", requests.length >= 1 ? requests[0] : null)
reporter.check("a retry happened after the timeout", requests.length >= 2, requests.map((r) => r.seq + ":" + r.mode))
reporter.check("every attempt, including the retry, used the local provider",
  requests.length >= 2 && requests.every((r) => r.provider === "mock-local"),
  requests.map((r) => r.provider))
reporter.check("no attempt was made on the cloud mock provider",
  requests.every((r) => r.provider !== "mock-cloud"), null)
reporter.check("routing ran only once, so the retry could not re-route",
  routes.length === 1, routes)
reporter.check("no local-route lock violation was logged", locks.length === 0, locks)

const result = reporter.result([
  "real headless run with a scripted TIMEOUT on the first call and a scripted ok on the second",
  "llm-retry is the stock plugin in the profile; the second request is the retry",
])
writeResult("t5", result)
saveEvidence("t5", [LOGS.mock, LOGS.router, LOGS.guard])
console.log(JSON.stringify({ case: result.case, verdict: result.verdict }, null, 0))
process.exit(result.verdict === "PASS" ? 0 : 1)
