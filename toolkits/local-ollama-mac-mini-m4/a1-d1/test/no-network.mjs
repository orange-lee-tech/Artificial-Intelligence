/**
 * Zero-egress guard for T3.
 *
 * Loaded with NODE_OPTIONS=--import so it runs before the CLI body. Every
 * attempt to open a TCP/TLS connection, resolve a DNS name or call fetch is
 * appended to NETGUARD_LOG and then refused, so a plugin that tried to reach a
 * real provider fails loudly instead of succeeding quietly.
 */
import { appendFileSync } from "node:fs"

const logFile = process.env.NETGUARD_LOG === undefined ? "" : process.env.NETGUARD_LOG

function builtin(id) {
  if (typeof process.getBuiltinModule === "function") {
    try { return process.getBuiltinModule(id) } catch { /* fall through */ }
  }
  return undefined
}

function record(kind, detail) {
  const entry = { t: new Date().toISOString(), pid: process.pid, kind, detail: String(detail) }
  if (logFile !== "") {
    try { appendFileSync(logFile, JSON.stringify(entry) + "\n") } catch { /* guard log is best effort */ }
  }
  throw new Error("no-network guard: blocked " + kind + " (" + String(detail) + ")")
}

const net = builtin("node:net")
if (net !== undefined) {
  const original = net.Socket.prototype.connect
  net.Socket.prototype.connect = function connect(...args) {
    const first = args[0]
    let host = "?"
    let port = "?"
    if (typeof first === "number") {
      port = String(first)
      host = typeof args[1] === "string" ? args[1] : "?"
    } else if (first !== null && typeof first === "object") {
      host = String(first.host === undefined ? (first.path === undefined ? "?" : first.path) : first.host)
      port = String(first.port === undefined ? "?" : first.port)
    }
    void original
    return record("net.Socket.connect", host + ":" + port)
  }
}

const dns = builtin("node:dns")
if (dns !== undefined) {
  for (const name of ["lookup", "resolve", "resolve4", "resolve6"]) {
    if (typeof dns[name] !== "function") continue
    const original = dns[name]
    void original
    dns[name] = (...args) => record("dns." + name, String(args[0]))
  }
  if (dns.promises !== undefined) {
    for (const name of ["lookup", "resolve", "resolve4", "resolve6"]) {
      if (typeof dns.promises[name] !== "function") continue
      dns.promises[name] = async (...args) => record("dns.promises." + name, String(args[0]))
    }
  }
}

const tls = builtin("node:tls")
if (tls !== undefined) {
  const connect = tls.connect
  void connect
  tls.connect = (...args) => {
    const first = args[0]
    const target = first !== null && typeof first === "object"
      ? String(first.host === undefined ? "?" : first.host) + ":" + String(first.port === undefined ? "?" : first.port)
      : String(first) + ":" + String(args[1])
    return record("tls.connect", target)
  }
}

const originalFetch = globalThis.fetch
if (typeof originalFetch === "function") {
  globalThis.fetch = async (input) => {
    const target = typeof input === "string" ? input : String(input && input.url === undefined ? input : input.url)
    record("fetch", target)
  }
}
