/** T3: a LOCAL_FIRST run performs zero cloud requests / zero network egress. */
import { join } from "node:path"
import { writeFileSync, existsSync, readFileSync } from "node:fs"
import { makeReporter, ROOT, EVIDENCE } from "../harness.mjs"
import { LOGS, E2E, runDsh, truncate, removeLedger, saveEvidence, writeResult, ensureDir } from "../lib/e2e.mjs"

const reporter = makeReporter("3", "LOCAL_FIRST performs zero cloud requests and zero network egress")
ensureDir(E2E)
truncate([LOGS.mock, LOGS.router, LOGS.guard, LOGS.network])
removeLedger()

const patch = join(ROOT, "test/patches/local-first.yml")
const noNetwork = "file://" + join(ROOT, "test/no-network.mjs")
const run = await runDsh({
  prompt: "summarise the ten plagues in one sentence",
  patch,
  env: { NODE_OPTIONS: "--import " + noNetwork, NETGUARD_LOG: LOGS.network },
  timeoutMs: 180000,
})

// structural zero-cloud: the composed tree must have every real cloud adapter disabled
const dump = await runDsh({ dumpConfig: true })
writeFileSync(LOGS.dump, dump.stdout)
const dumpText = readFileSync(LOGS.dump, "utf8")
reporter.check("every real cloud LLM plugin is disabled in the composed profile",
  ["llm-deepseek", "llm-deepseek-account", "llm-pi-ai", "session-title-llm"].every((id) => {
    const index = dumpText.indexOf("id: " + id)
    if (index === -1) return false
    return dumpText.slice(index, index + 400).includes("disabled: true")
  }), { dumpBytes: dumpText.length })

const networkAttempts = existsSync(LOGS.network) ? readFileSync(LOGS.network, "utf8").trim() : ""
reporter.check("no socket, DNS or fetch attempt was made by the whole process tree",
  networkAttempts === "", networkAttempts === "" ? null : networkAttempts.split("\n").slice(0, 10))

const requests = (await import("../harness.mjs")).readJsonl(LOGS.mock).filter((e) => e.event === "request")
reporter.check("the run answered through the mock provider", run.stdout.includes("mock reply"), {
  status: run.status, ms: run.ms, tail: run.stdout.slice(-200),
})
reporter.check("only the local provider was reached", requests.length >= 1 && requests.every((r) => r.provider === "mock-local"),
  requests.map((r) => r.provider + "/" + r.model))
reporter.check("the cloud-like mock provider was never reached", requests.every((r) => r.provider !== "mock-cloud"), null)

// the local-first switch itself is functional: a cloud-ish prompt classifies as cloud
const router = await import(join(ROOT, "packages/dsh-local-first-router/lib/index.js"))
const config = { policy: "local-first", classifier: { cloudKeywords: ["云端", "gpt-4"] } }
const cloudDecision = router.classify("用云端 GPT-4 帮我润色", config)
const localDecision = router.classify("summarise the ten plagues", config)
reporter.check("classifier selects cloud for a cloud keyword prompt", cloudDecision.kind === "cloud", cloudDecision)
reporter.check("classifier selects local for an ordinary prompt", localDecision.kind === "local", localDecision)

const result = reporter.result([
  "NODE_OPTIONS=--import test/no-network.mjs blocks net/dns/tls/fetch and logs attempts",
  "cloud adapters are structurally absent (llm-deepseek, llm-deepseek-account, llm-pi-ai, session-title-llm disabled)",
  "mock-cloud exists as a provider but was not reached",
])
writeResult("t3", result)
saveEvidence("t3", [LOGS.mock, LOGS.router, LOGS.guard, LOGS.network, LOGS.dump])
console.log(JSON.stringify({ case: result.case, verdict: result.verdict }, null, 0))
process.exit(result.verdict === "PASS" ? 0 : 1)
