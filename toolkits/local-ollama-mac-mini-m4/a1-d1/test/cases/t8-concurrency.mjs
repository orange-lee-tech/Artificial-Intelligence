/**
 * T8 - concurrent reservations are atomic across processes.
 *
 * Twenty independent OS processes race on one ledger. Each call reserves one
 * unit of CNY 0.106 against a CNY 0.55 daily cap, so exactly five may be
 * admitted and fifteen must be refused with BUDGET_DAILY.
 *
 * The streams are deliberately abandoned (never iterated): the reservation is
 * the only side effect, which isolates the ledger lock from provider timing and
 * keeps the arithmetic deterministic.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, makeReporter, readJsonl } from '../harness.mjs'

const WORKER = join(ROOT, 'test', 'workers', 'reserve-worker.mjs')
const NODE = process.execPath
const N = 20
const DAY_CAP = 0.55
const UNIT = 0.106

const caseDir = join(ROOT, 'evidence', 't8')
mkdirSync(caseDir, { recursive: true })
const ledger = join(caseDir, 'ledger.jsonl')
const guardLog = join(caseDir, 'guard.jsonl')
const mockLog = join(caseDir, 'mock-calls.jsonl')
for (const file of [ledger, guardLog, mockLog]) {
  if (existsSync(file)) rmSync(file)
}

const guard = {
  mode: 'enforce',
  ledgerFile: ledger,
  logFile: guardLog,
  freeProviders: [],
  perRequestYuan: 0.2,
  dailyYuan: DAY_CAP,
  defaultReserveOutputTokens: 100,
  prices: { 'mock-cloud': { inputPerMTok: 1000.0, outputPerMTok: 1000.0 } },
}
const payload = JSON.stringify({ guard, mock: { providers: ['mock-local', 'mock-cloud'], logFile: mockLog } })

function runWorker() {
  return new Promise((resolve) => {
    const child = spawn(NODE, [WORKER, payload], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (data) => { out = out + data })
    child.stderr.on('data', (data) => { err = err + data })
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

const started = Date.now()
const workers = await Promise.all(Array.from({ length: N }, () => runWorker()))
const elapsedMs = Date.now() - started

const reporter = makeReporter('8', 'concurrent reservations stay within the daily cap')
reporter.check('all worker processes exited cleanly', workers.every((w) => w.code === 0), workers.filter((w) => w.code !== 0).map((w) => ({ code: w.code, err: w.err.slice(0, 200) })))

const ledgerText = existsSync(ledger) ? readFileSync(ledger, 'utf8') : ''
const ledgerLines = ledgerText.split('\n').filter((line) => line.trim() !== '')
const events = readJsonl(ledger)
reporter.check('every ledger line is complete JSON (no torn append)', ledgerLines.length === events.length, { lines: ledgerLines.length, parsed: events.length })

const reserves = events.filter((e) => e.type === 'reserve')
const settles = events.filter((e) => e.type === 'settle')
const releases = events.filter((e) => e.type === 'release')
const reservedSum = reserves.reduce((sum, e) => sum + e.amount, 0)

reporter.check('exactly five reservations were admitted', reserves.length === 5, reserves.map((e) => e.amount))
reporter.check('all reservation ids are unique', new Set(reserves.map((e) => e.id)).size === reserves.length)
reporter.check('the admitted total stays within the daily cap', reservedSum <= DAY_CAP + 1e-9, { reservedSum: Number(reservedSum.toFixed(6)), cap: DAY_CAP })
reporter.check('the admitted total matches five units (no lost reserve)', Math.abs(reservedSum - UNIT * 5) < 1e-6, Number(reservedSum.toFixed(6)))

const denials = readJsonl(guardLog).filter((e) => e.event === 'denied')
reporter.check('fifteen calls were refused', denials.length === N - reserves.length, denials.length)
reporter.check('every refusal is BUDGET_DAILY', denials.every((e) => e.code === 'BUDGET_DAILY'), [...new Set(denials.map((e) => e.code))])
reporter.check('no reservation was settled or released', settles.length === 0 && releases.length === 0, { settles: settles.length, releases: releases.length })
reporter.check('no provider call happened (streams were abandoned before iteration)', readJsonl(mockLog).filter((e) => e.event === 'request').length === 0)

const result = reporter.result([
  'Twenty real OS processes contended on the same ledger file; the lock is taken before read-check-append, so the check is serialized with the write.',
  'Each worker reserved exactly one unit (CNY ' + UNIT + ') and never iterated the stream, so pending reservations drive the cap.',
  'Elapsed ' + elapsedMs + ' ms for ' + N + ' processes.',
])
writeFileSync(join(caseDir, 'result.json'), JSON.stringify(result, null, 2))
process.exit(result.verdict === 'PASS' ? 0 : 1)
