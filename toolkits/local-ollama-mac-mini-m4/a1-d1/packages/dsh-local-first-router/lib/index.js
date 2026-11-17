/**
 * dsh-local-first-router — deterministic local-first model routing.
 *
 * Routing happens exactly once per inbound user message, on
 * `agent/inbox/inserted`, which the Agent Loop emits synchronously while the
 * message enters the inbox and therefore *before* it resolves the model for
 * the next step. The decision is recorded through `agent.model.select()` and
 * kept as session stickiness, so a retry or a replay of the same step cannot
 * switch routes on its own.
 *
 * A local decision also locks the session: an ordinary conversation request
 * that later names another provider is short-circuited with a terminal error
 * chunk *before* `next()`, so a local failure can never fall through to a
 * cloud route. There is deliberately no error listener that re-routes.
 *
 * The plugin has no package dependencies (it talks to Cordis and to the
 * model-selection facade only), so it can be dropped into a profile without
 * an install step.
 *
 * @module dsh-local-first-router
 */

/** Stable plugin name for loader diagnostics. */
export const name = 'local-first-router'

/** No service is required: routing uses events and the Agent facade only. */
export const inject = []

/** Failure code yielded when a locked session tries another provider. */
export const LOCAL_ROUTE_LOCKED = 'LOCAL_ROUTE_LOCKED'

const DEFAULTS = Object.freeze({
  policy: 'local-only',
  local: Object.freeze({ provider: '', model: '' }),
  strictSticky: true,
  respectRecordedSelection: true,
  allowedRemoteProviders: Object.freeze([]),
  classifier: Object.freeze({ cloudKeywords: Object.freeze([]) }),
  logFile: '',
})

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate and normalize the loader-provided config. */
function normalizeConfig(raw) {
  if (raw === undefined) raw = {}
  if (!isPlainObject(raw)) throw new Error('local-first-router: config must be an object')
  const config = {
    ...DEFAULTS,
    ...raw,
    local: { ...DEFAULTS.local, ...(isPlainObject(raw.local) ? raw.local : {}) },
    classifier: { ...DEFAULTS.classifier, ...(isPlainObject(raw.classifier) ? raw.classifier : {}) },
  }
  if (config.policy !== 'local-only' && config.policy !== 'local-first') {
    throw new Error('local-first-router: policy must be "local-only" or "local-first"')
  }
  for (const key of ['provider', 'model']) {
    if (typeof config.local[key] !== 'string') {
      throw new Error(`local-first-router: local.${key} must be a string`)
    }
  }
  if (!Array.isArray(config.allowedRemoteProviders) || config.allowedRemoteProviders.some(p => typeof p !== 'string')) {
    throw new Error('local-first-router: allowedRemoteProviders must be an array of provider ids')
  }
  if (!Array.isArray(config.classifier.cloudKeywords)
    || config.classifier.cloudKeywords.some(p => typeof p !== 'string')) {
    throw new Error('local-first-router: classifier.cloudKeywords must be an array of regex source strings')
  }
  if (typeof config.logFile !== 'string') throw new Error('local-first-router: logFile must be a string')
  config.strictSticky = config.strictSticky !== false
  config.respectRecordedSelection = config.respectRecordedSelection !== false
  return config
}

/** Flatten one user message into searchable text. */
export function messageText(message) {
  const content = message === null || message === undefined ? undefined : message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (isPlainObject(block) && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (isPlainObject(block) && block.type === 'file') parts.push('[file]')
    else if (isPlainObject(block) && block.type === 'image') parts.push('[image]')
  }
  return parts.join('\n')
}

/**
 * Deterministic classifier. No model call, no randomness: the same text and
 * the same config always produce the same decision.
 * @returns {{kind: 'local'|'cloud', rule: string, matched?: string}}
 */
export function classify(text, config) {
  if (config.policy === 'local-only') return { kind: 'local', rule: 'policy:local-only' }
  for (const source of config.classifier.cloudKeywords) {
    let pattern
    try {
      pattern = new RegExp(source, 'i')
    } catch (error) {
      throw new Error(`local-first-router: invalid cloudKeywords pattern ${JSON.stringify(source)}: ${error.message}`)
    }
    const matched = pattern.exec(text)
    if (matched !== null) return { kind: 'cloud', rule: `keyword:${source}`, matched: matched[0] }
  }
  return { kind: 'local', rule: 'default:local' }
}

function selectionOf(route) {
  return { provider: route.provider, model: route.model }
}

/** Resolve the configured route object for one decision kind. */
function routeFor(decision, config) {
  const source = decision.kind === 'local' ? config.local : { provider: '', model: '' }
  return { kind: decision.kind, provider: source.provider, model: source.model }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} rawConfig
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  /** @type {Map<string, {provider: string, model: string, kind: string, messageId: string, decidedAt: number, rule: string}>} */
  const sticky = new Map()
  let warnedMissingRoute = false

  // Synchronous append keeps the JSONL order equal to the decision order, which
  // is what the ordering evidence (route before first request) relies on.
  const fsModule = (() => {
    const proc = globalThis.process
    if (proc === undefined || typeof proc.getBuiltinModule !== 'function') return undefined
    try { return proc.getBuiltinModule('node:fs') } catch { return undefined }
  })()

  const writeLog = (entry) => {
    if (config.logFile === '' || fsModule === undefined) return
    try {
      fsModule.appendFileSync(config.logFile, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n')
    } catch { /* logging is best effort */ }
  }

  const resolveSessionId = (agent) => {
    try {
      return agent.session.id
    } catch {
      return undefined
    }
  }

  const decide = (agent, message) => {
    const sessionId = resolveSessionId(agent)
    const text = messageText(message)
    let decision = classify(text, config)

    if (decision.kind === 'cloud') {
      // A cloud classification still needs an explicit remote route; this
      // skeleton only supports the local route, so fall back to local rather
      // than inventing a provider id.
      decision = { kind: 'local', rule: decision.rule + '->local:no-remote-route' }
    }

    if (decision.kind === 'local' && config.respectRecordedSelection && config.allowedRemoteProviders.length > 0) {
      let current
      try {
        current = agent.model.current()
      } catch {
        current = undefined
      }
      if (current !== undefined && config.allowedRemoteProviders.includes(current.provider)) {
        decision = { kind: 'cloud', rule: 'recorded-selection:' + current.provider }
        const route = { kind: 'cloud', provider: current.provider, model: current.model }
        const record = { ...route, messageId: message.id, decidedAt: Date.now(), rule: decision.rule }
        sticky.set(sessionId, record)
        return record
      }
    }

    const route = routeFor(decision, config)
    if (route.provider === '' || route.model === '') {
      if (!warnedMissingRoute) {
        warnedMissingRoute = true
        writeLog({ event: 'router-idle', reason: 'no local route configured; selection untouched' })
      }
      return undefined
    }
    const record = { ...route, messageId: message.id, decidedAt: Date.now(), rule: decision.rule }
    sticky.set(sessionId, record)
    try {
      agent.model.select(selectionOf(route))
    } catch (error) {
      writeLog({ event: 'route-error', sessionId, message: String(error && error.message) })
      return undefined
    }
    writeLog({
      event: 'route',
      sessionId,
      messageId: message.id,
      kind: record.kind,
      provider: record.provider,
      model: record.model,
      rule: record.rule,
      decidedAt: record.decidedAt,
      textChars: text.length,
    })
    return record
  }

  ctx.on('agent/inbox/inserted', ({ agent, message }) => {
    try {
      decide(agent, message)
    } catch (error) {
      writeLog({ event: 'route-crash', error: String(error && error.message) })
    }
  })

  ctx.on('llm/stream', (options, next) => {
    const sessionId = options.sessionId
    const record = sessionId === undefined ? undefined : sticky.get(sessionId)
    const locked = config.strictSticky
      && record !== undefined
      && record.kind === 'local'
      && options.purpose === undefined
      && options.provider !== record.provider
    if (!locked) return next()
    writeLog({
      event: 'route-locked',
      sessionId,
      attempted: options.provider + '/' + options.model,
      lockedTo: record.provider + '/' + record.model,
    })
    return (async function* lockedStream() {
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            code: LOCAL_ROUTE_LOCKED,
            message: `local-first-router: session is pinned to ${record.provider}/${record.model}; refused `
              + `${options.provider}/${options.model}. A local decision is never retried on a cloud route.`,
          },
        },
      }
    })()
  })

  ctx.effect(() => () => {
    sticky.clear()
  })

  writeLog({ event: 'router-mounted', policy: config.policy, local: config.local })
}
