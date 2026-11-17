import { ensureDir, LOGS, runDsh, truncate } from '../lib/e2e.mjs'
import { EVIDENCE, ROOT, makeReporter } from '../harness.mjs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(EVIDENCE, 't1')
ensureDir(dir)

const repo = makeReporter(1, 'isolation profile loads both plugins with the intended config')
const run = await runDsh({ dumpConfig: true, timeoutMs: 120000 })
const dump = run.stdout
writeFileSync(join(dir, 'dump-config.yml'), dump)

const lines = dump.split('\n')
function blockOf(id) {
  const start = lines.reduce((last, l, i) => (l.trim() === '- id: ' + id ? i : last), -1)
  if (start < 0) return ''
  const out = [lines[start]]
  for (let j = start + 1; j < lines.length; j++) {
    const l = lines[j]
    if (/^\s*- id: /.test(l)) break
    out.push(l)
  }
  return out.join('\n')
}

repo.check('dump-config exits cleanly', run.status === 0, { status: run.status, stderr: run.stderr.slice(0, 400) })

const defaultModel = blockOf('agent-default-model')
repo.check('agent default model points at the mock local provider', /provider: mock-local/.test(defaultModel) && /model: mock-small/.test(defaultModel), defaultModel)

for (const id of ['llm-deepseek', 'llm-deepseek-account', 'llm-pi-ai', 'session-title-llm']) {
  const b = blockOf(id)
  repo.check('cloud row ' + id + ' is disabled', b !== '' && /disabled: true/.test(b), b)
}

for (const pair of [['mock-provider', 'dsh-mock-provider'], ['local-first-router', 'dsh-local-first-router'], ['budget-guard', 'dsh-budget-guard']]) {
  const b = blockOf(pair[0])
  repo.check('plugin row ' + pair[0] + ' is registered', b !== '' && b.includes('name: ' + pair[1]), b)
}

const routerBlock = blockOf('local-first-router')
const guardBlock = blockOf('budget-guard')
const mockBlock = blockOf('mock-provider')
repo.check('router config carries the local policy and local target', /policy: local-only/.test(routerBlock) && /mock-local/.test(routerBlock), routerBlock)
repo.check('guard config is enforce with ledger and CNY caps', /mode: enforce/.test(guardBlock) && /ledgerFile:/.test(guardBlock) && /perRequestYuan: 0\.2/.test(guardBlock) && /dailyYuan: 2/.test(guardBlock), guardBlock)
repo.check('mock config lists both scripted providers', /mock-local/.test(mockBlock) && /mock-cloud/.test(mockBlock), mockBlock)

const result = repo.result(['Runtime evidence from dsh ' + run.args.join(' ') + ' in ' + ROOT + ': the loader parsed all three plugin rows and disabled every cloud provider row.'])
writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
process.exit(result.verdict === 'PASS' ? 0 : 1)