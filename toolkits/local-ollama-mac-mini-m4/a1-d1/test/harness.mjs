/** Shared mini-harness: loads the real Cordis + LlmRuntime from the extracted
 * app.asar tree, then mounts our plugins without any profile or network. */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..')
/**
 * Path to the node_modules directory of an extracted DSH app.asar tree.
 * Set PACS_ASAR_NM before running the tests, e.g.
 *   PACS_ASAR_NM=/path/to/extracted/dsh/node_modules node test/run-all.mjs
 * The tests never download DSH; they reuse the copy already installed on disk.
 */
export const ASAR_NM = (() => {
  const value = process.env.PACS_ASAR_NM
  if (typeof value !== 'string' || value === '') {
    throw new Error('PACS_ASAR_NM is not set: point it at the extracted DSH app.asar node_modules directory (see test/README.md)')
  }
  return value
})()
export const CORDIS = ASAR_NM + '/@deepseek-ai/cordis/lib/index.js'
export const LLM = ASAR_NM + '/@deepseek-ai/dsh-llm/lib/index.js'
export const PACKAGES = join(ROOT, 'packages')
export const EVIDENCE = join(ROOT, 'evidence')

export async function loadModules() {
  const cordis = await import(CORDIS)
  const llm = await import(LLM)
  const guard = await import(join(PACKAGES, 'dsh-budget-guard/lib/index.js'))
  const router = await import(join(PACKAGES, 'dsh-local-first-router/lib/index.js'))
  const mock = await import(join(PACKAGES, 'dsh-mock-provider/lib/index.js'))
  return { Context: cordis.Context, LlmRuntime: llm.default, guard, router, mock }
}

export async function createApp(options) {
  const opts = options === undefined ? {} : options
  const mods = await loadModules()
  const app = new mods.Context()
  const fibers = {}
  await app.plugin(mods.LlmRuntime)
  if (opts.mock !== false) {
    fibers.mock = await app.plugin(mods.mock, opts.mockConfig === undefined ? { providers: ['mock-local', 'mock-cloud'] } : opts.mockConfig)
  }
  if (opts.guard !== undefined) fibers.guard = await app.plugin(mods.guard, opts.guard)
  if (opts.router !== undefined) fibers.router = await app.plugin(mods.router, opts.router)
  return { app, ctx: app, mods, fibers }
}

export async function collect(iterable) {
  const chunks = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

export function finalReason(chunks) {
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    if (chunks[i].type === 'finish') return chunks[i].reason
  }
  return undefined
}

export function textOf(chunks) {
  return chunks.filter((c) => c.type === 'text-delta').map((c) => c.text).join('')
}

export function readJsonl(file) {
  if (!existsSync(file)) return []
  const out = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    try { out.push(JSON.parse(line)) } catch { /* torn line */ }
  }
  return out
}

export function request(overrides) {
  const base = {
    provider: 'mock-cloud',
    model: 'mock-small',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello world' }] }],
  }
  return { ...base, ...(overrides === undefined ? {} : overrides) }
}

/** tiny assertion helpers so every case prints the same PASS/FAIL shape */
export function makeReporter(caseId, title) {
  const checks = []
  return {
    check(name, condition, detail) {
      checks.push({ name, ok: Boolean(condition), detail: detail === undefined ? null : detail })
      const mark = condition ? 'PASS' : 'FAIL'
      console.log('[T' + caseId + '] ' + mark + ' ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
    },
    result(notes) {
      const failed = checks.filter((c) => !c.ok)
      return {
        case: caseId,
        title,
        verdict: failed.length === 0 ? 'PASS' : (checks.length > 0 && failed.length < checks.length ? 'PARTIAL' : 'FAIL'),
        checks,
        notes: notes === undefined ? [] : notes,
      }
    },
  }
}
