/** Helpers that drive the real isolated headless profile and collect evidence. */
import { spawn } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { EVIDENCE, ROOT } from "../harness.mjs"

export const PROFILE = "a1d1-isolated"
export const E2E = join(EVIDENCE, "e2e")
export const LOGS = {
  mock: join(E2E, "mock-calls.jsonl"),
  router: join(E2E, "router.jsonl"),
  guard: join(E2E, "guard.jsonl"),
  ledger: join(E2E, "ledger.jsonl"),
  dump: join(E2E, "dump-config.yml"),
  network: join(E2E, "network-attempts.jsonl"),
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

export function truncate(files) {
  ensureDir(E2E)
  for (const file of files) writeFileSync(file, "")
}

export function removeLedger() {
  for (const path of [LOGS.ledger, LOGS.ledger + ".lock"]) {
    try { rmSync(path, { force: true }) } catch { /* ignore */ }
  }
}

/** Spawn the real dsh CLI against the isolated profile (no shell). */
export function runDsh(options) {
  const opts = options === undefined ? {} : options
  const args = [PROFILE]
  if (opts.patch !== undefined) args.push("--patch", opts.patch)
  if (opts.dumpConfig === true) args.push("--dump-config")
  else args.push(opts.prompt)
  const env = { ...process.env, ...(opts.env === undefined ? {} : opts.env) }
  return new Promise((resolve) => {
    const child = spawn("/usr/local/bin/dsh", args, { cwd: ROOT, env })
    let stdout = ""
    let stderr = ""
    const started = Date.now()
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
    }, opts.timeoutMs === undefined ? 180000 : opts.timeoutMs)
    child.stdout.on("data", (chunk) => { stdout += String(chunk) })
    child.stderr.on("data", (chunk) => { stderr += String(chunk) })
    child.on("close", (status, signal) => {
      clearTimeout(timer)
      resolve({ status, signal, stdout, stderr, ms: Date.now() - started, args })
    })
  })
}

/** Copy the run's logs into evidence/<case>/ so each case keeps its own copy. */
export function saveEvidence(caseId, files) {
  const dir = join(EVIDENCE, caseId)
  ensureDir(dir)
  for (const file of files) {
    if (existsSync(file)) copyFileSync(file, join(dir, basename(file)))
  }
  return dir
}

/** Persist a case result next to its evidence. */
export function writeResult(caseId, result) {
  const dir = join(EVIDENCE, caseId)
  ensureDir(dir)
  writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 2) + "\n")
}
