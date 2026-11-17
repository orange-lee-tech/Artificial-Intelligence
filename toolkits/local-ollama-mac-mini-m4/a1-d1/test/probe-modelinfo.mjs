import { createApp } from './harness.mjs'
const app = await createApp({ mockConfig: { logFile: '/tmp/probe-mock.jsonl' } })
try {
  const info = await app.ctx.llm.resolveModelInfo('mock-local','mock-small')
  console.log('INFO', JSON.stringify(info))
} catch (e) { console.log('ERR', e.code, e.message) }
try {
  const cat = await app.ctx.llm.listModels('mock-local')
  console.log('CAT', JSON.stringify(cat))
} catch (e) { console.log('CATERR', e.code, e.message) }
process.exit(0)