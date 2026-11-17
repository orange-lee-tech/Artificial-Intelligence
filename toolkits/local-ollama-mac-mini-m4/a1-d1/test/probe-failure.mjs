
import { loadModules, createApp, collect, finalReason, request, readJsonl } from './harness.mjs'
import { unlinkSync, existsSync } from 'node:fs'
const log = '/tmp/t5probe-mock.jsonl'
if (existsSync(log)) unlinkSync(log)
const mods = await loadModules()
const { app } = await createApp({
  mock: true,
  mockConfig: {
    providers: ['mock-local'],
    logFile: log,
    behaviors: { 'mock-local': [{ mode: 'timeout' }, { mode: 'ok', text: 'retry ok' }] },
    retryPolicy: { mode: 'normal', maxRetries: 2, initialDelayMs: 10, maxDelayMs: 40 },
  },
})
const chunks = await collect(app.llm.stream(request({ provider: 'mock-local' })))
console.log(JSON.stringify({ reason: finalReason(chunks), chunkTypes: chunks.map(c => c.type) }))
console.log(JSON.stringify(readJsonl(log)))
process.exit(0)
