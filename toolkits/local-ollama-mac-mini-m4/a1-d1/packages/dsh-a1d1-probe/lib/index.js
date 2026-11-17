/**
 * dsh-a1d1-probe — test-only observer for the agent/request-error waterfall.
 */

export const name = 'a1d1-probe'

export const inject = []

function nodeFs() {
  const proc = globalThis.process
  if (proc === undefined || typeof proc.getBuiltinModule !== 'function') return undefined
  return proc.getBuiltinModule('node:fs')
}

function describeValue(value) {
  if (value === null) return { kind: 'null' }
  const t = typeof value
  if (t !== 'object') return { kind: t, finite: t === 'number' ? Number.isFinite(value) : undefined, negativeZero: t === 'number' ? Object.is(value, -0) : undefined }
  const proto = Object.getPrototypeOf(value)
  const names = Object.getOwnPropertyNames(value)
  const symbols = Object.getOwnPropertySymbols(value)
  const nonEnumerable = names.filter((n) => !Object.prototype.propertyIsEnumerable.call(value, n))
  return {
    kind: Array.isArray(value) ? 'array' : 'object',
    protoName: proto === null ? 'null' : (proto.constructor && proto.constructor.name) || 'anonymous',
    protoIsObjectProto: proto === Object.prototype,
    ownNames: names,
    nonEnumerable,
    symbols: symbols.map(String),
    isFrozen: Object.isFrozen(value),
    jsonOk: (() => { try { JSON.stringify(value); return true } catch { return false } })(),
  }
}

export function apply(ctx, rawConfig) {
  const config = rawConfig === undefined ? {} : rawConfig
  const logFile = typeof config.logFile === 'string' ? config.logFile : ''
  const write = (entry) => {
    if (logFile === '') return
    const fs = nodeFs()
    if (fs === undefined) return
    try {
      fs.appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n')
    } catch { /* best effort */ }
  }
  write({ event: 'probe-mounted' })
  ctx.on('agent/request-error', async (payload, next) => {
    const policy = payload.retryPolicy
    write({
      event: 'request-error',
      provider: payload.provider,
      failureCode: payload.failure === undefined ? null : payload.failure.code,
      retryPolicyPresent: policy !== undefined,
      turn: payload.turn,
      step: payload.step,
      payloadKeys: Object.keys(payload),
      failureShape: payload.failure === undefined ? null : describeValue(payload.failure),
      policyShape: policy === undefined ? null : describeValue(policy),
      retryableCodesShape: policy === undefined ? null : describeValue(policy.retryableCodes),
      at: Date.now(),
    })
    try {
      const action = await next()
      write({ event: 'downstream-action', actionKind: action === undefined ? null : String(action.kind), at: Date.now() })
      return action
    } catch (error) {
      write({ event: 'downstream-error', message: String(error && error.message) })
      throw error
    }
  })
}