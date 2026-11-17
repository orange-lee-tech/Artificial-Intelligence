/**
 * T10 worker: reserve one paid stream and then hang, so the parent can kill the
 * process while a reservation is outstanding. Nothing is settled or released.
 */
import { createApp, request } from '../harness.mjs'

const payload = JSON.parse(process.argv[2])
const { ctx } = await createApp({ guard: payload.guard, mockConfig: payload.mock })
ctx.llm.stream(request({ provider: 'mock-cloud' }))
console.log('RESERVED')
setInterval(() => {}, 1000)
