/** T2: agent/inbox/inserted fires before the first model request. */
import { readJsonl, makeReporter } from "../harness.mjs"
import { LOGS, runDsh, truncate, removeLedger, saveEvidence, writeResult } from "../lib/e2e.mjs"

const reporter = makeReporter("2", "agent/inbox/inserted precedes the first model request")
truncate([LOGS.mock, LOGS.router, LOGS.guard])
removeLedger()

const run = await runDsh({ prompt: "say hello in five words" })
const routerEvents = readJsonl(LOGS.router)
const mockEvents = readJsonl(LOGS.mock)
const guardEvents = readJsonl(LOGS.guard)
const routes = routerEvents.filter((e) => e.event === "route")
const requests = mockEvents.filter((e) => e.event === "request")

reporter.check("headless run produced the mock answer", run.stdout.includes("mock reply"), {
  status: run.status, signal: run.signal, ms: run.ms, tail: run.stdout.slice(-200),
})
reporter.check("router recorded exactly one routing decision", routes.length === 1, routes)
reporter.check("decision is local and names mock-local/mock-small",
  routes.length === 1 && routes[0].kind === "local" && routes[0].provider === "mock-local" && routes[0].model === "mock-small",
  routes.length === 1 ? routes[0] : null)
reporter.check("exactly one model request was made", requests.length === 1, requests)
reporter.check("that request went to the local mock provider",
  requests.length === 1 && requests[0].provider === "mock-local", requests.length === 1 ? requests[0] : null)
reporter.check("routing timestamp is not after the request timestamp",
  routes.length === 1 && requests.length === 1 && Date.parse(routes[0].t) <= Date.parse(requests[0].t),
  routes.length === 1 && requests.length === 1 ? { route: routes[0].t, request: requests[0].t } : null)
reporter.check("the recorded decision time precedes the request time",
  routes.length === 1 && requests.length === 1 && routes[0].decidedAt <= Date.parse(requests[0].t),
  routes.length === 1 && requests.length === 1 ? { decidedAt: routes[0].decidedAt, request: requests[0].t } : null)
reporter.check("no cloud-classified request reached the cloud mock provider",
  requests.every((r) => r.provider === "mock-local"), requests.map((r) => r.provider))

const result = reporter.result([
  "real headless profile a1d1-isolated, one prompt, router + mock JSONL evidence",
  "route event precedes the first adapter request in the same run",
])
writeResult("t2", result)
saveEvidence("t2", [LOGS.mock, LOGS.router, LOGS.guard])
console.log(JSON.stringify({ case: result.case, verdict: result.verdict }, null, 0))
process.exit(result.verdict === "PASS" ? 0 : 1)
