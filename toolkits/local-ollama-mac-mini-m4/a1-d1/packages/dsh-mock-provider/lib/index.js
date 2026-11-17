/**
 * dsh-mock-provider — a scripted, offline LLM adapter for isolation tests.
 *
 * It registers itself as one or more providers through `ctx.llm.registerAdapter`
 * and never opens a socket. Every call is appended to a JSONL log, so a test can
 * assert *which* provider/model was actually reached and in what order, and the
 * script can make a route fail (timeout/MTP 500/empty) exactly once to exercise
 * retry stickiness.
 *
 * Duck-typed on purpose: the package must load inside a profile whose
 * node_modules has no @deepseek-ai/cordis or dsh-llm, so it never extends
 * `LlmAdapter` and never imports core code. Zero package dependencies.
 *
 * @module dsh-mock-provider
 */

export const name = 'mock-provider'

export const inject = ['llm']

const DEFAULT_BEHAVIOR = Object.freeze({ mode: 'ok', delayMs: 0, text: 'MOCK_OK' })

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nodeFs() {
  const proc = globalThis.process
  if (proc === undefined || typeof proc.getBuiltinModule !== 'function') return undefined
  return proc.getBuiltinModule('node:fs')
}

function abortError() {
  const error = new Error('mock-provider: stream aborted')
  error.code = 'ABORTED'
  return error
}

/**
 * Build a failure that satisfies the dsh-llm adapter failure protocol.
 *
 * dsh-llm's normalizeLlmFailure (@deepseek-ai/dsh-llm/lib/index.js:450-521)
 * trusts a thrown value's own `failure` snapshot ONLY when its code equals the
 * thrower's own `code`; otherwise it falls back to
 * `error instanceof HarnessError ? error.code : 'UNKNOWN'`. A plain Error with
 * a hand-set `code` therefore normalizes to UNKNOWN, which is not in
 * retryableCodes, so llm-retry never retries. Real adapters attach the snapshot;
 * the mock must do the same to exercise the real retry path.
 */
function providerFailure(message, code, status) {
  const error = new Error(message)
  const failure = { message, code }
  if (typeof status === 'number') failure.status = status
  error.code = code
  Object.defineProperty(error, 'failure', { value: Object.freeze(failure), enumerable: false })
  return error
}

function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    if (signal !== undefined) {
      if (signal.aborted) {
        clearTimeout(timer)
        reject(abortError())
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export function apply(ctx, rawConfig) {
  const config = rawConfig === undefined ? {} : rawConfig
  const providers = Array.isArray(config.providers) && config.providers.length > 0
    ? config.providers
    : ['mock-local', 'mock-cloud']
  const logFile = typeof config.logFile === 'string' ? config.logFile : ''
  const defaultDelayMs = typeof config.delayMs === 'number' ? config.delayMs : 0
  const defaultText = typeof config.text === 'string' ? config.text : DEFAULT_BEHAVIOR.text
  const behaviors = isPlainObject(config.behaviors) ? config.behaviors : {}
  // dsh-llm captures adapter.providerRetryPolicy() verbatim (lib/index.js:1981) and
  // llm-retry's localDelay() reads `config.initialDelayMs` / `config.maxDelayMs` at the
  // TOP level (dsh-llm-retry/lib/index.js:44-49). The nested `backoff` object is only the
  // shape of the *provider configuration* schema (RetryPolicySchema, dsh-llm/lib/index.js:306-322);
  // resolveRetryPolicy() flattens it via `...resolveBackoff(...)` (dsh-llm/lib/index.js:364-395).
  // Returning the nested form here leaves initialDelayMs undefined -> delayMs = NaN ->
  // dsh-session rejects the "llm/retry" event as non-JSON-serializable. So return the
  // RESOLVED (flat) policy, exactly as resolveRetryPolicy would.
  const requestedRetry = isPlainObject(config.retryPolicy) ? config.retryPolicy : {}
  const retryBackoff = isPlainObject(requestedRetry.backoff) ? requestedRetry.backoff : requestedRetry
  const retryPolicy = Object.freeze({
    mode: requestedRetry.mode === 'always' ? 'always' : 'normal',
    maxRetries: typeof requestedRetry.maxRetries === 'number' ? requestedRetry.maxRetries : 3,
    retryableCodes: Object.freeze(['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT']),
    initialDelayMs: typeof retryBackoff.initialDelayMs === 'number' ? retryBackoff.initialDelayMs : 10,
    maxDelayMs: typeof retryBackoff.maxDelayMs === 'number' ? retryBackoff.maxDelayMs : 50,
    jitterRatio: 0,
  })
  /** per-provider cursor over the scripted behaviour list */
  const cursors = new Map()
  let callSequence = 0

  const writeLog = (entry) => {
    if (logFile === '') return
    const fs = nodeFs()
    if (fs === undefined) return
    try {
      fs.appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n')
    } catch { /* best effort */ }
  }

  function nextBehavior(provider) {
    const script = Array.isArray(behaviors[provider]) ? behaviors[provider] : []
    const cursor = cursors.get(provider) === undefined ? 0 : cursors.get(provider)
    cursors.set(provider, cursor + 1)
    if (cursor < script.length) return { ...DEFAULT_BEHAVIOR, ...script[cursor] }
    return { ...DEFAULT_BEHAVIOR, delayMs: defaultDelayMs, text: defaultText }
  }

  const adapter = {
    providerInfo(provider) {
      return { id: provider, name: 'Mock ' + provider, description: 'scripted offline mock provider' }
    },
    providerRetryPolicy() {
      return retryPolicy
    },
    listModels(provider) {
      return [{ provider, id: 'mock-small', name: 'Mock Small', contextWindow: 8192, maxTokens: 1024 }]
    },
    async resolveModel(provider, model) {
      return { provider, id: model, name: 'Mock ' + model }
    },
    async prepareCall(provider, model, signal) {
      const resolved = await adapter.resolveModel(provider, model, signal)
      return { model: resolved, stream: (options) => adapter.stream(options) }
    },
    async *stream(options) {
      callSequence += 1
      const behavior = nextBehavior(options.provider)
      const delayMs = typeof behavior.delayMs === 'number' ? behavior.delayMs : 0
      writeLog({
        event: 'request',
        seq: callSequence,
        provider: options.provider,
        model: options.model,
        purpose: options.purpose === undefined ? null : options.purpose,
        sessionId: options.sessionId === undefined ? null : options.sessionId,
        mode: behavior.mode,
        messageCount: Array.isArray(options.messages) ? options.messages.length : 0,
      })
      if (behavior.mode === 'hang') {
        await new Promise((resolve, reject) => {
          const onAbort = () => reject(abortError())
          if (options.signal !== undefined) {
            if (options.signal.aborted) { reject(abortError()); return }
            options.signal.addEventListener('abort', onAbort, { once: true })
          }
          void resolve
        })
      }
      await sleep(delayMs, options.signal)
      if (behavior.mode === 'timeout') {
        throw providerFailure('mock-provider: simulated upstream timeout',
          typeof behavior.code === 'string' ? behavior.code : 'TIMEOUT')
      }
      if (behavior.mode === 'server-error') {
        throw providerFailure('mock-provider: simulated upstream 500',
          typeof behavior.code === 'string' ? behavior.code : 'SERVER')
      }
      const text = behavior.mode === 'empty' ? '' : (typeof behavior.text === 'string' ? behavior.text : defaultText)
      const inputTokens = typeof behavior.inputTokens === 'number' ? behavior.inputTokens : 32
      const outputTokens = typeof behavior.outputTokens === 'number' ? behavior.outputTokens : 8
      yield { type: 'block-start', index: 0, blockType: 'text' }
      if (text !== '') yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'usage', usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } }
      yield { type: 'finish', reason: { kind: text === '' ? 'stop' : 'stop' } }
    },
  }

  const disposer = ctx.llm.registerAdapter(providers, adapter)
  writeLog({ event: 'adapter-registered', providers, retryPolicy })

  ctx.effect(() => () => {
    cursors.clear()
    if (typeof disposer === 'function') disposer()
  })
}
