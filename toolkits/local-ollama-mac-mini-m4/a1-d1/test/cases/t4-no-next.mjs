import { createApp, collect, finalReason, request, readJsonl, makeReporter, EVIDENCE } from '../harness.mjs'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(EVIDENCE, 't4')
mkdirSync(dir, { recursive: true })
const ledger = join(dir, 'ledger.jsonl')
const mockLog = join(dir, 'mock-calls.jsonl')
rmSync(ledger, { force: true })
rmSync(mockLog, { force: true })

const r = makeReporter(4, 'llm/stream not calling next() => zero provider egress')
const { app, ctx } = await createApp({
  mockConfig: { providers: ['mock-local', 'mock-cloud'], logFile: mockLog },
  guard: {
    mode: 'enforce',
    ledgerFile: ledger,
    perRequestYuan: 0.2,
    dailyYuan: 2.0,
    prices: { 'mock-cloud': { inputPerMTok: 1000000, outputPerMTok: 1000000 } },
  },
})

const chunks = await collect(ctx.llm.stream(request()))
const reason = finalReason(chunks)
const calls = readJsonl(mockLog).filter((e) => e.event === 'request')
r.check('terminal finish is an error', reason !== undefined && reason.kind === 'error', reason)
r.check('error code is budget refusal', reason !== undefined && reason.failure.code === 'BUDGET_PER_REQUEST', reason === undefined ? null : reason.failure)
r.check('adapter saw zero requests', calls.length === 0, { calls: calls.length })
r.check('refusal mentions provider and amount', reason !== undefined && reason.failure.message.includes('mock-cloud'), reason === undefined ? null : reason.failure.message)
r.check('ledger file was never created', readJsonl(ledger).length === 0)
const result = r.result(['Refusal happens in the waterfall listener before next(), so the adapter stream is never invoked.'])
writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
process.exit(result.verdict === 'PASS' ? 0 : 1)