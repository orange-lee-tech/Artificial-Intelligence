/**
 * T9 - an explicitly chosen provider (the way a subagent selects one) is still
 * subject to the budget guard.
 *
 * The mini harness has no agent tree, so the request carries the observable
 * shape a subagent turn produces: provider mock-cloud, purpose 'subagent' and a
 * child session id. The guard consumes only GenerateOptions; a static check
 * below proves its decision path has no agent-role or purpose branch.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, createApp, collect, finalReason, textOf, makeReporter, readJsonl, request } from '../harness.mjs'

const caseDir = join(ROOT, 'evidence', 't9')
mkdirSync(caseDir, { recursive: true })
const ledger = join(caseDir, 'ledger.jsonl')
const guardLog = join(caseDir, 'guard.jsonl')
const mockLog = join(caseDir, 'mock-calls.jsonl')
for (const f of [ledger, guardLog, mockLog]) if (existsSync(f)) rmSync(f)

const mockConfig = { providers: ['mock-local', 'mock-cloud'], logFile: mockLog, text: 'mock reply' }
const child = { provider: 'mock-cloud', purpose: 'subagent', sessionId: 'child-agent-session-t9' }
const baseGuard = {
  mode: 'enforce',
  ledgerFile: ledger,
  logFile: guardLog,
  freeProviders: [],
  perRequestYuan: 0.2,
  dailyYuan: 2.0,
  defaultReserveOutputTokens: 100,
}

const reporter = makeReporter('9', 'an explicit subagent provider is still budget-constrained')

const guardSrc = readFileSync(join(ROOT, 'packages', 'dsh-budget-guard', 'lib', 'index.js'), 'utf8')
reporter.check('the guard decision path has no agent-role or purpose branch',
  !/subagent/i.test(guardSrc) && !/if\s*\([^)]*purpose/i.test(guardSrc))

const denyApp = await createApp({
  guard: { ...baseGuard, prices: { 'mock-cloud': { inputPerMTok: 1000000, outputPerMTok: 1000000 } } },
  mockConfig,
})
const denyChunks = await collect(denyApp.ctx.llm.stream(request(child)))
const denyReason = finalReason(denyChunks)
reporter.check('an over-budget subagent call is refused with BUDGET_PER_REQUEST',
  denyReason !== undefined && denyReason.kind === 'error' && denyReason.failure.code === 'BUDGET_PER_REQUEST',
  denyReason)
reporter.check('the refused subagent call never reached a provider',
  readJsonl(mockLog).filter((e) => e.event === 'request').length === 0)
const denials = readJsonl(guardLog).filter((e) => e.event === 'denied')
reporter.check('the refusal is logged with the subagent purpose and child session',
  denials.length === 1 && denials[0].purpose === 'subagent' && denials[0].sessionId === child.sessionId,
  denials.map((e) => ({ purpose: e.purpose, sessionId: e.sessionId, code: e.code })))

const allowApp = await createApp({
  guard: { ...baseGuard, prices: { 'mock-cloud': { inputPerMTok: 1000, outputPerMTok: 1000 } } },
  mockConfig,
})
const allowChunks = await collect(allowApp.ctx.llm.stream(request(child)))
reporter.check('an in-budget subagent call is admitted and answered',
  textOf(allowChunks) === 'mock reply' && finalReason(allowChunks).kind === 'stop',
  { text: textOf(allowChunks), kind: finalReason(allowChunks).kind })
const allowRequests = readJsonl(mockLog).filter((e) => e.event === 'request')
reporter.check('the admitted call used the explicitly selected provider once',
  allowRequests.length === 1 && allowRequests[0].provider === 'mock-cloud' && allowRequests[0].purpose === 'subagent',
  allowRequests.map((e) => ({ provider: e.provider, purpose: e.purpose })))
const events = readJsonl(ledger)
const reserves = events.filter((e) => e.type === 'reserve')
const settles = events.filter((e) => e.type === 'settle')
reporter.check('the admitted subagent call reserved and settled on the ledger',
  reserves.length === 1 && settles.length === 1 && settles[0].id === reserves[0].id && Math.abs(reserves[0].amount - 0.106) < 1e-9,
  { reserve: reserves[0] === undefined ? null : reserves[0].amount, settle: settles[0] === undefined ? null : settles[0].amount })
reporter.check('no free-provider shortcut was applied to the child session',
  readJsonl(guardLog).filter((e) => e.event === 'free').length === 0)

const result = reporter.result([
  'Simulated subagent shape only: the mini harness mounts no agent tree, so real subagent wiring of purpose/sessionId remains NOT_TESTED.',
  'Guard enforcement is provider- and role-agnostic: it keys on GenerateOptions, and no code path checks who issued the call.',
])
const { writeFileSync } = await import('node:fs')
writeFileSync(join(caseDir, 'result.json'), JSON.stringify(result, null, 2))
process.exit(result.verdict === 'PASS' ? 0 : 1)