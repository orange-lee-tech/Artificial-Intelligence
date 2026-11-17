/**
 * dsh-budget-guard — pre-flight cost gate for every LLM stream.
 *
 * The gate is an `llm/stream` waterfall listener. It runs before the adapter is
 * reached, so a rejected call performs *zero* provider egress. Before `next()`
 * it reserves the worst-case cost of the call in an append-only JSONL ledger,
 * serialized by an O_EXCL lock file; while streaming it observes `usage`
 * chunks; after the stream ends it settles the reservation with the measured
 * cost.
 *
 * Deliberate properties:
 * - unknown price => refusal (fail closed), never a guessed price;
 * - no ledger configured => refusal in enforce mode, because a cap that cannot
 *   be recorded cannot be enforced;
 * - failed or uncertain streams keep their reservation pending (未决预留),
 *   so a crashed or unbilled call can never silently free budget;
 * - the ledger is append-only and replayed on read, so a crash between lock
 *   release and rewrite cannot lose a reservation.
 *
 * Zero package dependencies.
 *
 * @module dsh-budget-guard
 */

export const name = 'budget-guard'

export const inject = []

export const BUDGET_NO_LEDGER = 'BUDGET_NO_LEDGER'
export const BUDGET_UNKNOWN_PRICE = 'BUDGET_UNKNOWN_PRICE'
export const BUDGET_PER_REQUEST = 'BUDGET_PER_REQUEST'
export const BUDGET_DAILY = 'BUDGET_DAILY'
export const BUDGET_LEDGER_ERROR = 'BUDGET_LEDGER_ERROR'

const DEFAULTS = Object.freeze({
  mode: 'observe',
  ledgerFile: '',
  perRequestYuan: 0.2,
  dailyYuan: 2.0,
  freeProviders: Object.freeze([]),
  prices: Object.freeze({}),
  defaultReserveOutputTokens: 1024,
  inputTokensPerChar: 0.5,
  lockTimeoutMs: 5000,
  lockStaleMs: 30000,
  releaseOnError: false,
  logFile: '',
})

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeConfig(raw) {
  if (raw === undefined) raw = {}
  if (!isPlainObject(raw)) throw new Error('budget-guard: config must be an object')
  const config = { ...DEFAULTS, ...raw, prices: { ...(raw.prices === undefined ? {} : raw.prices) } }
  if (config.mode !== 'observe' && config.mode !== 'enforce') {
    throw new Error('budget-guard: mode must be "observe" or "enforce"')
  }
  if (typeof config.ledgerFile !== 'string') throw new Error('budget-guard: ledgerFile must be a string')
  const numeric = ['perRequestYuan', 'dailyYuan', 'inputTokensPerChar', 'lockTimeoutMs', 'lockStaleMs']
  for (const key of numeric) {
    if (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] < 0) {
      throw new Error('budget-guard: ' + key + ' must be a non-negative number')
    }
  }
  if (!Number.isInteger(config.defaultReserveOutputTokens) || config.defaultReserveOutputTokens < 1) {
    throw new Error('budget-guard: defaultReserveOutputTokens must be a positive integer')
  }
  if (!Array.isArray(config.freeProviders) || config.freeProviders.some((p) => typeof p !== 'string')) {
    throw new Error('budget-guard: freeProviders must be an array of provider ids')
  }
  for (const provider of Object.keys(config.prices)) {
    const price = config.prices[provider]
    if (!isPlainObject(price)
      || typeof price.inputPerMTok !== 'number' || !Number.isFinite(price.inputPerMTok) || price.inputPerMTok < 0
      || typeof price.outputPerMTok !== 'number' || !Number.isFinite(price.outputPerMTok) || price.outputPerMTok < 0) {
      throw new Error('budget-guard: prices.' + provider + ' needs non-negative inputPerMTok and outputPerMTok')
    }
  }
  return config
}

export function localDateKey(date) {
  const d = date === undefined ? new Date() : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

/** Conservative input-token estimate; never lower than ceil(chars / 4). */
export function estimateInputTokens(options, inputTokensPerChar) {
  let chars = 0
  const system = options.system
  if (typeof system === 'string') chars += system.length
  const messages = Array.isArray(options.messages) ? options.messages : []
  for (const message of messages) {
    const content = message === null || message === undefined ? undefined : message.content
    if (typeof content === 'string') {
      chars += content.length
      continue
    }
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!isPlainObject(block)) continue
      if (typeof block.text === 'string') chars += block.text.length
      else if (block.type === 'image') chars += 4000
      else chars += 64
    }
  }
  return Math.ceil(Math.max(chars / 4, chars * inputTokensPerChar))
}

/** Measured cost of one stream from its DISJOINT usage counters. */
export function chunkCost(usage, price) {
  const inputTokens = (usage.inputTokens === undefined ? 0 : usage.inputTokens)
    + (usage.cacheReadTokens === undefined ? 0 : usage.cacheReadTokens)
    + (usage.cacheWriteTokens === undefined ? 0 : usage.cacheWriteTokens)
  const outputTokens = (usage.outputTokens === undefined ? 0 : usage.outputTokens)
    + (usage.reasoningTokens === undefined ? 0 : usage.reasoningTokens)
  return (inputTokens * price.inputPerMTok) / 1e6 + (outputTokens * price.outputPerMTok) / 1e6
}

export function round6(value) {
  return Math.round(value * 1e6) / 1e6
}

function errorChunk(code, message) {
  return { type: 'finish', reason: { kind: 'error', failure: { code, message } } }
}

let fsCache
function nodeFs() {
  if (fsCache === undefined) {
    const proc = globalThis.process
    fsCache = proc !== undefined && typeof proc.getBuiltinModule === 'function'
      ? proc.getBuiltinModule('node:fs')
      : undefined
  }
  return fsCache
}

/**
 * @param {object} ctx Cordis context
 * @param {object} rawConfig loader config
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)

  const log = (entry) => {
    if (config.logFile === '') return
    const fs = nodeFs()
    if (fs === undefined) return
    try {
      fs.appendFileSync(config.logFile, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n')
    } catch { /* best effort */ }
  }

  const inflight = new Map()
  let sequence = 0

  function readLedger(fs) {
    const state = { reservations: new Map(), spentByDate: new Map() }
    let text = ''
    try {
      text = fs.readFileSync(config.ledgerFile, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') return state
      throw error
    }
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      if (event === null || typeof event !== 'object') continue
      if (event.type === 'reserve') {
        state.reservations.set(event.id, { amount: event.amount, date: event.date, settled: false })
      } else if (event.type === 'settle') {
        const reservation = state.reservations.get(event.id)
        if (reservation !== undefined) {
          reservation.settled = true
          state.spentByDate.set(event.date, (state.spentByDate.get(event.date) || 0) + event.amount)
        }
      } else if (event.type === 'release') {
        const reservation = state.reservations.get(event.id)
        if (reservation !== undefined) reservation.settled = true
      }
    }
    return state
  }

  function pendingOn(state, date) {
    let total = 0
    for (const reservation of state.reservations.values()) {
      if (reservation.settled || reservation.date !== date) continue
      total += reservation.amount
    }
    return total
  }

  function withLedgerLock(fn) {
    const fs = nodeFs()
    if (fs === undefined) throw new Error('budget-guard: node:fs is unavailable in this runtime')
    const lockPath = config.ledgerFile + '.lock'
    const deadline = Date.now() + config.lockTimeoutMs
    let fd
    for (;;) {
      try {
        fd = fs.openSync(lockPath, 'wx')
        break
      } catch (error) {
        if (!error || error.code !== 'EEXIST') throw error
        try {
          const stat = fs.statSync(lockPath)
          if (Date.now() - stat.mtimeMs > config.lockStaleMs) {
            fs.unlinkSync(lockPath)
            continue
          }
        } catch { /* lock vanished between open and stat: retry */ }
        if (Date.now() > deadline) throw new Error('budget-guard: ledger lock timeout')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
      }
    }
    try {
      fs.writeFileSync(fd, String(process.pid))
      return fn(fs)
    } finally {
      try { fs.closeSync(fd) } catch { /* ignore */ }
      try { fs.unlinkSync(lockPath) } catch { /* ignore */ }
    }
  }

  function appendEvent(fs, event) {
    fs.appendFileSync(config.ledgerFile, JSON.stringify(event) + '\n')
    try {
      const handle = fs.openSync(config.ledgerFile, 'r')
      try { fs.fsyncSync(handle) } finally { fs.closeSync(handle) }
    } catch { /* fsync is best effort on some filesystems */ }
  }

  function reserve(provider, model, amount, date) {
    try {
      return withLedgerLock((fs) => {
        const state = readLedger(fs)
        const spent = state.spentByDate.get(date) === undefined ? 0 : state.spentByDate.get(date)
        const pending = pendingOn(state, date)
        const committed = spent + pending
        if (amount > config.perRequestYuan) {
          return { ok: false, code: BUDGET_PER_REQUEST, amount: round6(amount), committed: round6(committed), spent: round6(spent), pending: round6(pending) }
        }
        if (committed + amount > config.dailyYuan) {
          return { ok: false, code: BUDGET_DAILY, amount: round6(amount), committed: round6(committed), spent: round6(spent), pending: round6(pending) }
        }
        sequence += 1
        const id = date + '-' + process.pid + '-' + Date.now().toString(36) + '-' + sequence
        appendEvent(fs, { type: 'reserve', id, ts: new Date().toISOString(), date, amount: round6(amount), provider, model })
        return { ok: true, id, amount: round6(amount), committed: round6(committed + amount) }
      })
    } catch (error) {
      return { ok: false, code: BUDGET_LEDGER_ERROR, message: String(error && error.message) }
    }
  }

  function settle(id, date, amount) {
    try {
      return withLedgerLock((fs) => {
        appendEvent(fs, { type: 'settle', id, ts: new Date().toISOString(), date, amount: round6(Math.min(amount, config.perRequestYuan)) })
        return { ok: true }
      })
    } catch (error) {
      log({ event: 'settle-error', id, error: String(error && error.message) })
      return { ok: false }
    }
  }

  function release(id, date) {
    try {
      return withLedgerLock((fs) => {
        appendEvent(fs, { type: 'release', id, ts: new Date().toISOString(), date })
        return { ok: true }
      })
    } catch (error) {
      log({ event: 'release-error', id, error: String(error && error.message) })
      return { ok: false }
    }
  }

  function decide(options) {
    const provider = options.provider
    const model = options.model
    if (config.freeProviders.includes(provider)) return { kind: 'free', provider, model }
    const price = config.prices[provider]
    if (price === undefined) {
      return {
        kind: 'deny',
        code: BUDGET_UNKNOWN_PRICE,
        message: 'budget-guard: no price configured for provider "' + provider + '"; refusing to guess',
      }
    }
    if (config.mode === 'enforce' && config.ledgerFile === '') {
      return {
        kind: 'deny',
        code: BUDGET_NO_LEDGER,
        message: 'budget-guard: enforce mode requires ledgerFile; a cap that cannot be recorded cannot be enforced',
      }
    }
    const inputTokens = estimateInputTokens(options, config.inputTokensPerChar)
    const outputTokens = typeof options.maxTokens === 'number' && options.maxTokens > 0
      ? options.maxTokens
      : config.defaultReserveOutputTokens
    const amount = (inputTokens * price.inputPerMTok) / 1e6 + (outputTokens * price.outputPerMTok) / 1e6
    return { kind: 'paid', provider, model, price, amount: round6(amount), inputTokens, outputTokens }
  }

  ctx.on('llm/stream', (options, next) => {
    const decision = decide(options)
    if (decision.kind === 'deny') {
      log({ event: 'denied', code: decision.code, provider: options.provider, model: options.model, sessionId: options.sessionId, purpose: options.purpose })
      return (async function* deniedStream() {
        yield errorChunk(decision.code, decision.message)
      })()
    }
    if (decision.kind === 'free') {
      log({ event: 'free', provider: options.provider, model: options.model, sessionId: options.sessionId })
      return next()
    }
    const date = localDateKey()
    const reservation = config.mode === 'enforce'
      ? reserve(decision.provider, decision.model, decision.amount, date)
      : { ok: true, id: 'observe-' + (++sequence), amount: decision.amount }
    if (!reservation.ok) {
      log({ event: 'denied', code: reservation.code, provider: options.provider, model: options.model, amount: reservation.amount, sessionId: options.sessionId, purpose: options.purpose })
      const detail = 'budget-guard: ' + reservation.code + ' for ' + options.provider + '/' + options.model
        + ' (reserve CNY ' + Number(reservation.amount).toFixed(4)
        + ', committed CNY ' + Number(reservation.committed === undefined ? 0 : reservation.committed).toFixed(4) + ')'
      return (async function* overBudgetStream() {
        yield errorChunk(reservation.code, detail)
      })()
    }
    log({ event: 'reserved', id: reservation.id, amount: reservation.amount, provider: options.provider, model: options.model, sessionId: options.sessionId, purpose: options.purpose })
    inflight.set(reservation.id, { amount: reservation.amount })

    return (async function* guardedStream() {
      let usage
      let outcome = 'unknown'
      try {
        for await (const chunk of next()) {
          if (chunk !== null && typeof chunk === 'object' && chunk.type === 'usage') usage = chunk.usage
          if (chunk !== null && typeof chunk === 'object' && chunk.type === 'finish') {
            // FinishReason.kind is a *success* vocabulary ('stop' | 'length' | 'tool-calls' | ...);
            // there is no 'success' member. Only 'error' and 'aborted' are failures
            // (@deepseek-ai/dsh-llm lib/types/index.js FinishReason, consumer dsh-agent-loop/src/agent.ts:547).
            const kind = chunk.reason === null || chunk.reason === undefined ? 'unknown' : chunk.reason.kind
            outcome = kind === 'error' || kind === 'aborted' ? 'failure' : 'success'
          }
          yield chunk
        }
      } catch (error) {
        outcome = 'threw'
        throw error
      } finally {
        inflight.delete(reservation.id)
        if (config.mode === 'enforce') {
          if (outcome === 'success') {
            const actual = usage === undefined ? decision.amount : chunkCost(usage, decision.price)
            settle(reservation.id, date, actual)
            log({ event: 'settled', id: reservation.id, actual: round6(actual), reserved: reservation.amount })
          } else if (outcome === 'failure' && config.releaseOnError) {
            release(reservation.id, date)
            log({ event: 'released', id: reservation.id, outcome })
          } else {
            log({ event: 'pending-kept', id: reservation.id, outcome, note: 'reservation remains pending until reconciled' })
          }
        }
      }
    })()
  })

  ctx.effect(() => () => {
    inflight.clear()
  })

  log({ event: 'guard-mounted', mode: config.mode, ledgerFile: config.ledgerFile })
}

export const __internals = { normalizeConfig }
