/**
 * T10 - a crashed process and an unloaded plugin must leave the ledger honest.
 *
 * Part A (crash): a worker reserves one paid stream and is SIGKILLed before the
 * stream settles. The outstanding reservation must survive as pending, must keep
 * counting against the daily cap, and the stale lock left behind must be
 * reclaimed while a live lock keeps failing closed.
 *
 * Part B (unload): disposing the guard fiber must remove its llm/stream listener
 * without rewriting the ledger, and must leave an in-flight reservation pending.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { ROOT, createApp, collect, finalReason, textOf, makeReporter, readJsonl, request } from '../harness.mjs'

const NODE = '/opt/homebrew/opt/node@22/bin/node'
const caseDir = join(ROOT, 'evidence', 't10')
mkdirSync(caseDir, { recursive: true })
const ledger = join(caseDir, 'ledger.jsonl')
const guardLog = join(caseDir, 'guard.jsonl')
const mockLog = join(caseDir, 'mock-calls.jsonl')
const lockPath = ledger + '.lock'
for (const f of [ledger, guardLog, mockLog, lockPath]) if (existsSync(f)) rmSync(f)

const mockConfig = { providers: ['mock-local', 'mock-cloud'], logFile: mockLog, text: 'mock reply' }
const price = { 'mock-cloud': { inputPerMTok: 1000, outputPerMTok: 1000 } }
const baseGuard = {
  mode: 'enforce',
  ledgerFile: ledger,
  logFile: guardLog,
  freeProviders: [],
  perRequestYuan: 0.2,
  dailyYuan: 2.0,
  defaultReserveOutputTokens: 100,
  prices: price
}
const repo = makeReporter('10', 'crash and unload leave the budget ledger honest')
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim() !== '') : [])
const ledgerEvents = () => lines(ledger).map((l) => JSON.parse(l))

// ---------- Part A1: crash leaves the reservation pending ----------
const worker = join(ROOT, 'test', 'workers', 'reserve-then-hang.mjs')
const payload = JSON.stringify({ guard: baseGuard, mock: mockConfig })
const child = spawn(NODE, [worker, payload], { stdio: ['ignore', 'pipe', 'pipe'] })
const killed = await new Promise((resolve) => {
  let out = ''
  let err = ''
  let done = false
  child.stdout.on('data', (d) => {
    out += String(d)
    if (!done && out.includes('RESERVED')) { done = true; child.kill('SIGKILL') }
  })
  child.stderr.on('data', (d) => { err += String(d) })
  child.on('exit', (code, signal) => resolve({ code, signal, out, err }))
  setTimeout(() => { if (!done) { done = true; child.kill('SIGKILL') } }, 30000)
})
const afterCrash = ledgerEvents()
repo.check('the worker reserved a stream and then died by SIGKILL', killed.signal === 'SIGKILL' && killed.out.includes('RESERVED'), JSON.stringify({ signal: killed.signal, out: killed.out.trim(), err: killed.err.trim().slice(0, 200) }))
repo.check('the outstanding reservation survives the crash as pending', afterCrash.filter((e) => e.type === 'reserve').length === 1 && afterCrash.filter((e) => e.type === 'settle' || e.type === 'release').length === 0, JSON.stringify(afterCrash))
repo.check('the killed process did not leave its lock file behind', !existsSync(lockPath), lockPath)
const crashedAmount = afterCrash.find((e) => e.type === 'reserve').amount

// ---------- Part A2: the pending reservation still counts against the daily cap ----------
const tight = { ...baseGuard, dailyYuan: 0.15 }
const appA = await createApp({ mock: true, mockConfig, guard: tight })
const chunksA = await collect(appA.ctx.llm.stream(request({ provider: 'mock-cloud', sessionId: 'after-crash' })))
const reasonA = finalReason(chunksA)
const deniedA = readJsonl(guardLog).filter((e) => e.event === 'denied')
repo.check('a new process counts the crashed reservation and refuses to exceed the daily cap', reasonA.kind === 'error' && reasonA.failure.code === 'BUDGET_DAILY' && deniedA.some((e) => String(e.code) === 'BUDGET_DAILY' && Number(e.amount) > 0), JSON.stringify({ reason: reasonA, committed: deniedA.map((e) => e.committed) }))
repo.check('the refused stream after the crash never reached a provider', readJsonl(mockLog).filter((e) => e.event === 'request').length === 0, JSON.stringify(readJsonl(mockLog).map((e) => e.event)))
await appA.fibers.guard.dispose()

// ---------- Part A3: stale lock reclaimed, live lock fails closed ----------
const appB = await createApp({ mock: true, mockConfig, guard: { ...baseGuard, dailyYuan: 2.0, lockTimeoutMs: 300, lockStaleMs: 30000 } })
writeFileSync(lockPath, 'stale')
const old = new Date(Date.now() - 600000)
utimesSync(lockPath, old, old)
const chunksB = await collect(appB.ctx.llm.stream(request({ provider: 'mock-cloud', sessionId: 'stale-lock' })))
const staleOk = textOf(chunksB).includes('mock reply') && !existsSync(lockPath)
repo.check('a stale lock is reclaimed and the reservation lands', staleOk, JSON.stringify({ text: textOf(chunksB), leftover: existsSync(lockPath) }))
writeFileSync(lockPath, 'fresh')
const before = ledgerEvents().length
const chunksC = await collect(appB.ctx.llm.stream(request({ provider: 'mock-cloud', sessionId: 'fresh-lock' })))
const reasonC = finalReason(chunksC)
const freshDenied = readJsonl(guardLog).filter((e) => e.event === 'denied' && String(e.code) === 'BUDGET_LEDGER_ERROR')
repo.check('a live lock makes the guard fail closed instead of reserving', reasonC.kind === 'error' && reasonC.failure.code === 'BUDGET_LEDGER_ERROR' && ledgerEvents().length === before && freshDenied.length === 1, JSON.stringify({ reason: reasonC, denied: freshDenied.length, ledgerLines: ledgerEvents().length }))
rmSync(lockPath)
await appB.fibers.guard.dispose()

// ---------- Part B1: an active guard reserves and settles ----------
const appC = await createApp({ mock: true, mockConfig, guard: { ...baseGuard, dailyYuan: 2.0 } })
const requestsBefore = readJsonl(mockLog).filter((e) => e.event === 'request').length
const chunksD = await collect(appC.ctx.llm.stream(request({ provider: 'mock-cloud', sessionId: 'unload-check' })))
const activeLedger = ledgerEvents()
repo.check('while mounted the guard reserves and settles a paid call', textOf(chunksD).includes('mock reply') && activeLedger.some((e) => e.type === 'reserve' && e.sessionId === 'unload-check') === false && activeLedger.filter((e) => e.type === 'reserve').length >= 3 && activeLedger.filter((e) => e.type === 'settle').length >= 2, JSON.stringify(activeLedger))

// Part B2: an in-flight reservation stays pending across dispose
const eventsBeforeDispose = ledgerEvents().length
const inflightStream = appC.ctx.llm.stream(request({ provider: 'mock-cloud', sessionId: 'inflight-dispose' }))
const afterInflight = ledgerEvents()
await appC.fibers.guard.dispose()
const afterDispose = ledgerEvents()
repo.check('dispose does not settle or release an in-flight reservation', afterInflight.length === eventsBeforeDispose + 1 && JSON.stringify(afterDispose) === JSON.stringify(afterInflight), JSON.stringify({ before: eventsBeforeDispose, inflight: afterInflight.length, after: afterDispose.length }))
void inflightStream

// Part B3: after dispose the waterfall listener is gone (no guard, still answered)
const logLinesBefore = readJsonl(guardLog).length
const chunksE = await collect(appC.ctx.llm.stream(request({ provider: 'mock-cloud', sessionId: 'after-dispose' })))
const requestsAfter = readJsonl(mockLog).filter((e) => e.event === 'request').length
repo.check('after dispose a paid call is no longer guarded and still reaches the provider', textOf(chunksE).includes('mock reply') && readJsonl(guardLog).length === logLinesBefore && ledgerEvents().length === afterDispose.length && requestsAfter === requestsBefore + 2, JSON.stringify({ text: textOf(chunksE), guardLines: readJsonl(guardLog).length - logLinesBefore, ledgerLines: ledgerEvents().length - afterDispose.length, reqBefore: requestsBefore, reqAfter: requestsAfter }))

const result = repo.result(['crash worker killed by SIGKILL after RESERVED', 'pending reservation', 'stale and live lock behaviour', 'guard dispose keeps pending, removes listener'])
writeFileSync(join(caseDir, 'result.json'), JSON.stringify(result, null, 2) + '\n')
process.exit(result.verdict === 'PASS' ? 0 : 1)
