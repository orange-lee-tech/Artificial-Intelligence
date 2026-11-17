/**
 * T8 worker: mount the real LlmRuntime + budget-guard from source, request one
 * paid stream, and exit WITHOUT iterating it.
 *
 * The guard reserves synchronously inside the llm/stream waterfall listener, so
 * the ledger records a pending reservation before the provider is ever prepared.
 * The stream is abandoned so the reservation is never settled: that keeps the
 * cap arithmetic deterministic while twenty processes race on the same ledger.
 */
import { createApp, request } from '../harness.mjs'

const payload = JSON.parse(process.argv[2])
const { ctx } = await createApp({ guard: payload.guard, mockConfig: payload.mock })
ctx.llm.stream(request({ provider: 'mock-cloud' }))
process.exit(0)
