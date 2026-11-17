// test/run-all.mjs - runs the ten A1/D1 validation cases sequentially and aggregates results.
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(HERE)
const CASES = HERE + '/cases'
const EVIDENCE = ROOT + '/evidence'
const NODE = process.execPath

const ORDER = [
  ['t1', 't1-config.mjs', 'Plugin load and config registration (dump-config)'],
  ['t2', 't2-inbox-order.mjs', 'agent/inbox/inserted runs before the first model request'],
  ['t3', 't3-local-first.mjs', 'LOCAL_FIRST produces zero cloud requests'],
  ['t4', 't4-no-next.mjs', 'llm/stream without next() produces zero adapter egress'],
  ['t5', 't5-retry-sticky.mjs', 'Local timeout retry stays on the local provider'],
  ['t6', 't6-no-reservation.mjs', 'No reservation / unknown price refuses the cloud request'],
  ['t7', 't7-budget-caps.mjs', 'Per-request and daily caps refuse the cloud request'],
  ['t8', 't8-concurrency.mjs', 'Concurrent reservations are atomic and cap-exact'],
  ['t9', 't9-subagent-provider.mjs', 'Explicit subagent provider is still budget constrained'],
  ['t10', 't10-cleanup.mjs', 'Crash and dispose clean up state correctly'],
]

function runCase(file) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(NODE, [join(CASES, file)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => { stdout += c.toString() })
    child.stderr.on('data', (c) => { stderr += c.toString() })
    child.on('close', (code, signal) => resolve({ code, signal, ms: Date.now() - started, stdout, stderr }))
    child.on('error', (err) => resolve({ code: -1, signal: null, ms: Date.now() - started, stdout, stderr: String(err) }))
  })
}

function verdictOf(id) {
  const p = join(EVIDENCE, id, 'result.json')
  if (!existsSync(p)) return undefined
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return undefined }
}

const rows = []
for (const [id, file, title] of ORDER) {
  const run = await runCase(file)
  const result = verdictOf(id)
  const verdict = result?.verdict ?? (run.code === 0 ? 'PASS' : 'FAIL')
  const failed = (result?.checks ?? []).filter((c) => c.ok !== true).map((c) => c.name)
  rows.push({ id, title, verdict, exitCode: run.code, ms: run.ms, failed })
  process.stdout.write('[' + id.toUpperCase() + '] ' + verdict.padEnd(6) + ' ' + String(run.ms).padStart(5) + 'ms  ' + title + (failed.length ? '  FAILED: ' + failed.join(', ') : '') + '\n')
  if (run.code !== 0 && run.stderr.trim()) {
    process.stdout.write('    stderr: ' + run.stderr.trim().split('\n').slice(-3).join(' | ') + '\n')
  }
}

const pass = rows.filter((r) => r.verdict === 'PASS').length
const summary = { generatedAt: new Date().toISOString(), total: rows.length, passed: pass, failed: rows.length - pass, cases: rows }
mkdirSync(EVIDENCE, { recursive: true })
writeFileSync(join(EVIDENCE, 'run-all.json'), JSON.stringify(summary, null, 2) + '\n')
const md = ['# A1/D1 validation summary', '', 'Generated: ' + summary.generatedAt, '', '| Case | Verdict | ms | Exit | Description |', '| --- | --- | --- | --- | --- |']
for (const r of rows) md.push('| ' + r.id.toUpperCase() + ' | ' + r.verdict + ' | ' + r.ms + ' | ' + r.exitCode + ' | ' + r.title + ' |')
md.push('', 'Total: ' + summary.total + ', PASS: ' + summary.passed + ', non-PASS: ' + summary.failed)
writeFileSync(join(EVIDENCE, 'run-all.md'), md.join('\n') + '\n')
process.stdout.write('\nTOTAL ' + summary.total + ' | PASS ' + summary.passed + ' | NON-PASS ' + summary.failed + '\n')
process.exit(summary.failed === 0 ? 0 : 1)